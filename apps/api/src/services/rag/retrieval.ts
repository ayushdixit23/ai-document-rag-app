import {
  PINECONE_API_KEY,
  PINECONE_RERANK_BUDGET_SCOPE,
  RAG_RETRIEVAL_MODE,
} from '../../config/env.js';
import { db } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import { EMBEDDING_DIMENSIONS } from './config.js';
import { selectEvidence } from './evidence.js';
import { queryEmbeddings } from './models.js';
import { rerankCandidates } from './rerank.js';
import { blockRerankCalls, reserveRerankCall } from './rerank-budget.js';
import {
  authorizedCacheHit,
  type DocumentVersion,
  sourceCache,
  sourceCacheKey,
} from './retrieval-cache.js';
import { lexicalRetrievalQuery, retrievalQuery } from './retrieval-query.js';
import type { RetrievedChunk } from './retrieval-types.js';
import { searchCandidates } from './search-candidates.js';
import { timeStage } from './timing.js';
import type { Source } from './types.js';

const vectorCandidates = async (
  userId: string,
  readyIds: string[],
  text: string,
  signal: AbortSignal,
) => {
  const vector = await timeStage('embed query', { userId }, () => queryEmbeddings.embedQuery(text));
  signal.throwIfAborted();
  if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite))
    throw new Error('Invalid query embedding.');
  return timeStage('vector search', { userId }, () =>
    db.execute<RetrievedChunk>(retrievalQuery(userId, readyIds, vector)),
  );
};

export const retrieveSources = async (
  userId: string,
  readyIds: string[],
  query: string,
  signal: AbortSignal = new AbortController().signal,
  versions?: DocumentVersion[],
): Promise<Source[]> => {
  signal.throwIfAborted();
  if (!readyIds.length) return [];
  const matchingVersions =
    versions?.length === readyIds.length && versions.every((row) => readyIds.includes(row.id))
      ? versions
      : undefined;
  const cacheKey = matchingVersions ? sourceCacheKey(userId, matchingVersions, query) : undefined;
  if (matchingVersions && cacheKey) {
    const cached = await authorizedCacheHit(userId, matchingVersions, cacheKey);
    signal.throwIfAborted();
    if (cached) {
      logger.debug({ count: cached.length }, 'RAG evidence cache hit');
      return cached;
    }
  }
  const scope = { userId, documentIds: readyIds };
  const candidates = await searchCandidates(query, signal, {
    mode: RAG_RETRIEVAL_MODE,
    report: (branch) => {
      logger.warn({ branch }, 'RAG search branch unavailable');
    },
    vector: (text, child) => vectorCandidates(userId, readyIds, text, child),
    lexical: (text) =>
      timeStage('lexical search', { userId }, () =>
        db.execute<RetrievedChunk>(lexicalRetrievalQuery(scope, text)),
      ),
  });
  const ranked =
    RAG_RETRIEVAL_MODE === 'hybrid_rerank'
      ? await timeStage('rerank', { userId }, () =>
          rerankCandidates(query, candidates, signal, {
            apiKey: PINECONE_API_KEY,
            reserve: () => reserveRerankCall(PINECONE_RERANK_BUDGET_SCOPE),
            block: blockRerankCalls,
            fetch,
            report: (details) => {
              logger.debug(details, 'RAG reranking');
            },
          }),
        )
      : candidates;
  signal.throwIfAborted();
  const sources = selectEvidence(ranked);
  if (cacheKey) sourceCache.set(cacheKey, sources);
  return sources;
};
