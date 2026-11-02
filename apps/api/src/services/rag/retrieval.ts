import { db } from '../../db/index.js';
import { EMBEDDING_DIMENSIONS } from './config.js';
import { embeddings } from './models.js';
import { retrievalQuery } from './retrieval-query.js';
import { timeStage } from './timing.js';
import type { Source } from './types.js';

type RetrievedRow = Omit<Source, 'n' | 'page'> & { metadata: Record<string, unknown> };

export const retrieveSources = async (
  userId: string,
  readyIds: string[],
  query: string,
): Promise<Source[]> => {
  if (!readyIds.length) return [];
  const vector = await timeStage('embed query', { userId }, () => embeddings.embedQuery(query));
  if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite))
    throw new Error('Invalid query embedding.');
  // Exact search within the indexed user/document scope avoids HNSW post-filter recall loss.
  const rows = await timeStage('vector search', { userId }, () =>
    db.execute<RetrievedRow>(retrievalQuery(userId, readyIds, vector)),
  );
  return rows.map(({ metadata, ...row }, index) => ({
    ...row,
    n: index + 1,
    page: typeof metadata.page === 'number' ? metadata.page : null,
  }));
};
