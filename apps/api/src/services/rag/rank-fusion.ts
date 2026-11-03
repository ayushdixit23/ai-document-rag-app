import { RRF_CONSTANT } from './config.js';
import type { Candidate, RetrievedChunk } from './retrieval-types.js';

export const fuseRanks = (vector: RetrievedChunk[], lexical: RetrievedChunk[]): Candidate[] => {
  const candidates = new Map<string, Candidate>();
  for (const [branch, rows] of [
    ['vector', vector],
    ['lexical', lexical],
  ] as const) {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (seen.has(row.chunkId)) return;
      seen.add(row.chunkId);
      const candidate = candidates.get(row.chunkId) ?? { ...row, fusionScore: 0 };
      candidate.fusionScore += 1 / (RRF_CONSTANT + index + 1);
      candidate[`${branch}Rank`] = index + 1;
      candidate[`${branch}Score`] = row.score;
      candidates.set(row.chunkId, candidate);
    });
  }
  return [...candidates.values()].sort(
    (a, b) => b.fusionScore - a.fusionScore || a.chunkId.localeCompare(b.chunkId),
  );
};
