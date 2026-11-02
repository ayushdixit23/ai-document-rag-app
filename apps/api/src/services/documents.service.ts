import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import type { UploadFileInput } from '../core/validation/schemas/documents.schema.js';
import { db } from '../db/index.js';
import { document } from '../db/schema/message.js';
import { buildObjectKey, deleteObject, headObject, presignPutObject } from '../lib/storage/r2.js';
import {
  getOwnedDocument,
  objectRef,
  ownedDocumentFilter,
  publicDocument,
} from './documents/document.repository.js';
import { PRESIGN_TTL_SECONDS } from './rag/config.js';
import { enqueueIngest } from './rag/jobs.js';

export const createUploads = async (userId: string, files: UploadFileInput[]) => {
  const rows = files.map((file) => {
    const id = randomUUID();
    return {
      ...file,
      id,
      userId,
      storageKey: buildObjectKey({ userId, documentId: id, fileName: file.name }),
    };
  });
  const uploads = await Promise.all(
    rows.map(async (row) => ({
      documentId: row.id,
      uploadUrl: await presignPutObject(objectRefForUpload(row), row.mimeType, row.size),
      headers: { 'Content-Type': row.mimeType },
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1_000).toISOString(),
    })),
  );
  await db.insert(document).values(rows);
  return { uploads };
};

const objectRefForUpload = (row: UploadFileInput & { id: string; userId: string }) => ({
  userId: row.userId,
  documentId: row.id,
  fileName: row.name,
});

const queueDocument = async (userId: string, id: string, expected: 'uploading' | 'failed') => {
  const [row] = await db
    .update(document)
    .set({ status: 'pending', errorMessage: null })
    .where(and(ownedDocumentFilter(userId, id), eq(document.status, expected)))
    .returning();
  if (!row)
    throw new AppError(
      'Document status changed; reload and retry',
      409,
      ERROR_CODES.RESOURCE_CONFLICT,
    );
  try {
    await enqueueIngest(id);
  } catch (error) {
    await db
      .update(document)
      .set({ status: 'failed', errorMessage: 'Unable to queue processing. Please retry.' })
      .where(and(ownedDocumentFilter(userId, id), eq(document.status, 'pending')));
    throw error;
  }
  return publicDocument(row);
};

export const completeUpload = async (userId: string, id: string) => {
  const row = await getOwnedDocument(userId, id);
  if (row.status !== 'uploading') return publicDocument(row);
  const head = await headObject(objectRef(row)).catch((error: unknown) => {
    if (error instanceof Error && ['NotFound', 'NoSuchKey'].includes(error.name)) {
      throw new AppError('Upload not found in storage', 409, ERROR_CODES.FILE_UPLOAD_FAILED);
    }
    throw error;
  });
  if (head.ContentLength !== row.size) {
    throw new AppError('Uploaded size does not match', 400, ERROR_CODES.FILE_UPLOAD_FAILED);
  }
  return queueDocument(userId, id, 'uploading');
};

export const retryDocument = async (userId: string, id: string) => {
  const row = await getOwnedDocument(userId, id);
  if (row.status !== 'failed')
    throw new AppError('Only failed documents can be retried', 409, ERROR_CODES.RESOURCE_CONFLICT);
  return queueDocument(userId, id, 'failed');
};

export const removeDocument = async (userId: string, id: string): Promise<void> => {
  const row = await getOwnedDocument(userId, id);
  await deleteObject(objectRef(row));
  await db.delete(document).where(ownedDocumentFilter(userId, id));
};
