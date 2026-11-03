import type { RerankDependencies } from './rerank.js';
import type { Candidate } from './retrieval-types.js';

export const candidate = (
  chunkId: string,
  snippet = 'Revenue grew by twenty percent.',
): Candidate => ({
  chunkId,
  documentId: 'doc',
  title: 'Report',
  snippet,
  metadata: { page: 1 },
  score: 0.8,
  fusionScore: 1 / 61,
});

export const rerankHarness = (
  response: unknown = {
    data: [
      { index: 1, score: 0.9 },
      { index: 0, score: 0.1 },
    ],
    usage: { rerank_units: 1 },
  },
) => {
  const calls = {
    reserved: 0,
    fetched: 0,
    blocked: [] as boolean[],
    reports: [] as Record<string, unknown>[],
  };
  const dependencies: RerankDependencies = {
    apiKey: 'test-key',
    reserve: () => {
      calls.reserved += 1;
      return Promise.resolve('reservation');
    },
    block: (_id, monthly) => {
      calls.blocked.push(monthly);
      return Promise.resolve();
    },
    fetch: () => {
      calls.fetched += 1;
      return Promise.resolve(Response.json(response));
    },
    report: (details) => {
      calls.reports.push(details);
    },
  };
  const candidates = [candidate('first', 'Gardens grow fruit.'), candidate('second')];
  return { calls, dependencies, candidates, signal: new AbortController().signal };
};
