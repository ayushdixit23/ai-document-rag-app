import { and, desc, eq, inArray } from 'drizzle-orm';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import { db } from '../../db/index.js';
import { document } from '../../db/schema/message.js';

export type StoredDocument = typeof document.$inferSelect;

export const publicDocument = ({
  storageKey: _storageKey,
  userId: _userId,
  ...value
}: StoredDocument) => value;

export const ownedDocumentFilter = (userId: string, id: string) =>
  and(eq(document.userId, userId), eq(document.id, id));

export const getOwnedDocument = async (userId: string, id: string): Promise<StoredDocument> => {
  const [row] = await db.select().from(document).where(ownedDocumentFilter(userId, id));
  if (!row) throw new AppError('Document not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  return row;
};

export const listOwnedDocuments = async (userId: string) => {
  const rows = await db
    .select()
    .from(document)
    .where(eq(document.userId, userId))
    .orderBy(desc(document.createdAt), desc(document.id));
  return rows.map(publicDocument);
};

export const getAttachments = async (userId: string, ids: string[]): Promise<StoredDocument[]> => {
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(document)
    .where(and(eq(document.userId, userId), inArray(document.id, ids)));
  if (rows.length !== ids.length) {
    throw new AppError('Document not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  }
  if (rows.some((row) => row.status === 'uploading')) {
    throw new AppError(
      'Complete each upload before attaching it',
      409,
      ERROR_CODES.RESOURCE_CONFLICT,
    );
  }
  return rows;
};

export const objectRef = (row: StoredDocument) => ({
  userId: row.userId,
  documentId: row.id,
  fileName: row.name,
});
