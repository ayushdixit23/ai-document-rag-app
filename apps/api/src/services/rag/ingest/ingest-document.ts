import { randomUUID } from 'node:crypto';

import type { Document } from '@langchain/core/documents';
import { and, eq } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import { documentChunk } from '../../../db/schema/document-chunk.js';
import { document } from '../../../db/schema/message.js';
import { getObject } from '../../../lib/storage/r2.js';
import { logger } from '../../../utils/logger.js';
import { objectRef, type StoredDocument } from '../../documents/document.repository.js';
import { getFileKind } from '../../documents/file-types.js';
import { EMBEDDING_DIMENSIONS } from '../config.js';
import { embeddings } from '../models.js';
import { assertMagicBytes } from './file-validation.js';
import { IngestError } from './ingest-error.js';
import { loadAndSplit, pageNumber } from './load-document.js';

const EMBEDDING_BATCH_SIZE = 64;

const embedChunks = async (row: StoredDocument, chunks: Document[]) => {
  const values: (typeof documentChunk.$inferInsert)[] = [];
  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const vectors = await embeddings.embedDocuments(batch.map((item) => item.pageContent));
    batch.forEach((chunk, index) => {
      const embedding = vectors[index];
      if (embedding?.length !== EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite))
        throw new Error('Invalid embedding response.');
      values.push({
        id: randomUUID(),
        documentId: row.id,
        userId: row.userId,
        chunkIndex: start + index,
        content: chunk.pageContent,
        embedding,
        metadata: {
          page: pageNumber(chunk.metadata),
          sheet: chunk.metadata.sheet,
          row: chunk.metadata.row,
        },
      });
    });
  }
  return values;
};

const processDocument = async (row: StoredDocument): Promise<void> => {
  const kind = getFileKind(row.name);
  if (!kind) throw new Error('Unsupported file type.');
  const object = await getObject(objectRef(row));
  if (!object.Body || object.ContentLength !== row.size)
    throw new Error('Stored file is missing or its size changed.');
  const bytes = await object.Body.transformToByteArray();
  await assertMagicBytes(bytes, kind);
  const { chunks, pageCount } = await loadAndSplit(bytes, kind);
  const values = await embedChunks(row, chunks);
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(document).where(eq(document.id, row.id)).for('update');
    if (current?.status !== 'processing' || current.updatedAt.getTime() !== row.updatedAt.getTime())
      return;
    await tx.delete(documentChunk).where(eq(documentChunk.documentId, row.id));
    for (let offset = 0; offset < values.length; offset += EMBEDDING_BATCH_SIZE) {
      await tx.insert(documentChunk).values(values.slice(offset, offset + EMBEDDING_BATCH_SIZE));
    }
    await tx
      .update(document)
      .set({ status: 'ready', pageCount, chunkCount: values.length, errorMessage: null })
      .where(eq(document.id, row.id));
  });
};

export const ingestDocument = async (documentId: string): Promise<void> => {
  const [row] = await db
    .update(document)
    .set({ status: 'processing', errorMessage: null })
    .where(and(eq(document.id, documentId), eq(document.status, 'pending')))
    .returning();
  if (!row) return;
  try {
    await processDocument(row);
  } catch (error) {
    logger.error({ err: error, documentId }, 'Document ingestion failed');
    await db
      .update(document)
      .set({
        status: 'failed',
        errorMessage:
          error instanceof IngestError
            ? error.message.slice(0, 500)
            : 'Document processing failed. Check the file and try again.',
      })
      .where(
        and(
          eq(document.id, row.id),
          eq(document.status, 'processing'),
          eq(document.updatedAt, row.updatedAt),
        ),
      );
  }
};
