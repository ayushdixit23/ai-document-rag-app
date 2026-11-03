import type { Candidate } from './retrieval-types.js';
import { searchTerms, tokenize } from './search-terms.js';

const K1 = 1.2;
const B = 0.75;

const termCounts = (candidate: Candidate) => {
  const heading = typeof candidate.metadata.heading === 'string' ? candidate.metadata.heading : '';
  const tokens = tokenize(`${candidate.title}\n${heading}\n${candidate.snippet}`);
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return { counts, length: tokens.length };
};

/** CPU-only fallback. BM25 re-scores this candidate pool, blended with semantic/fusion rank. */
export const localRerank = (query: string, candidates: Candidate[]): Candidate[] => {
  const terms = searchTerms(query);
  if (!terms.length || !candidates.length) return candidates;
  const documents = candidates.map(termCounts);
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length || 1;
  const frequencies = terms.map((term) => documents.filter((doc) => doc.counts.has(term)).length);
  const scores = documents.map((doc) =>
    terms.reduce((sum, term, index) => {
      const frequency = doc.counts.get(term) ?? 0;
      const df = frequencies[index] ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + K1 * (1 - B + B * (doc.length / averageLength));
      return sum + (idf * frequency * (K1 + 1)) / denominator;
    }, 0),
  );
  const maximum = Math.max(...scores);
  if (!maximum) return candidates;
  const bestFusion = Math.max(...candidates.map((candidate) => candidate.fusionScore));
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      rerankScore:
        0.65 * ((scores[index] ?? 0) / maximum) +
        0.35 * (candidate.fusionScore / (bestFusion || 1)),
    }))
    .sort(
      (a, b) =>
        b.rerankScore - a.rerankScore ||
        b.fusionScore - a.fusionScore ||
        a.chunkId.localeCompare(b.chunkId),
    );
};
