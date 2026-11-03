import { and, eq } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import { document } from '../../../db/schema/message.js';
import { getObject } from '../../../lib/storage/r2.js';
import { logger } from '../../../utils/logger.js';
import { objectRef, type StoredDocument } from '../../documents/document.repository.js';
import { getFileKind } from '../../documents/file-types.js';
import { timeStage } from '../timing.js';
import { embedDocument } from './embed-document.js';
import { assertMagicBytes } from './file-validation.js';
import { IngestError } from './ingest-error.js';
import { loadAndSplit } from './load-document.js';
import { writeIngestProgress } from './progress.js';
import { saveChunks } from './save-chunks.js';

const processDocument = async (row: StoredDocument): Promise<void> => {
  const kind = getFileKind(row.name);
  if (!kind) throw new Error('Unsupported file type.');
  const object = await getObject(objectRef(row));
  if (!object.Body || object.ContentLength !== row.size)
    throw new Error('Stored file is missing or its size changed.');
  const bytes = await object.Body.transformToByteArray();
  await assertMagicBytes(bytes, kind);
  const { chunks, pageCount } = await loadAndSplit(bytes, kind);
  logger.debug(
    { documentId: row.id, pages: pageCount, chunks: chunks.length },
    'Document indexing started',
  );
  const values = await timeStage('ingest embed', { documentId: row.id }, () =>
    embedDocument(row, chunks),
  );
  await writeIngestProgress(row, {
    stage: 'saving',
    completed: chunks.length,
    total: chunks.length,
  });
  await timeStage('ingest save chunks', { documentId: row.id }, () =>
    saveChunks(row, values, pageCount),
  );
};

export const ingestDocument = async (documentId: string): Promise<void> => {
  const [row] = await db
    .update(document)
    .set({ status: 'processing', errorMessage: null, processingProgress: null })
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
        processingProgress: null,
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
