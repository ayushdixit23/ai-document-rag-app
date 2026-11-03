import type { Document } from '@langchain/core/documents';

import { GEMINI_EMBED_MODEL } from '../../../config/env.js';
import type { StoredDocument } from '../../documents/document.repository.js';
import { INGEST_EMBED_TIMEOUT_MS } from '../config.js';
import { withDeadline } from '../deadline.js';
import { embedCached, embeddingCacheStore } from '../embedding-cache.js';
import { embeddings } from '../models.js';
import { embedChunks } from './embed-chunks.js';
import { IngestError } from './ingest-error.js';
import { writeIngestProgress } from './progress.js';

export const embedDocument = async (row: StoredDocument, chunks: Document[]) => {
  let completed = 0;
  const controller = new AbortController();
  const cache = embeddingCacheStore(row.userId, GEMINI_EMBED_MODEL);
  const progress = (stage: 'embedding' | 'waiting', retryAt?: string) =>
    writeIngestProgress(row, { stage, completed, total: chunks.length, retryAt });
  await progress('embedding');
  try {
    return await withDeadline(
      (signal) =>
        embedChunks(
          row,
          chunks,
          (texts) =>
            embedCached(
              texts,
              (missing) =>
                embeddings.embedDocuments(missing, {
                  signal,
                  onRetry: (retryAt) => progress('waiting', retryAt),
                }),
              cache,
            ),
          {
            signal,
            onProgress: async (count) => {
              completed = count;
              await progress('embedding');
            },
          },
        ),
      controller.signal,
      INGEST_EMBED_TIMEOUT_MS,
    );
  } catch (error) {
    controller.abort(error);
    if (error instanceof Error && error.message === 'Model deadline exceeded')
      throw new IngestError(
        'Document preparation took too long. Retry the file to continue from saved sections.',
      );
    throw error;
  }
};
