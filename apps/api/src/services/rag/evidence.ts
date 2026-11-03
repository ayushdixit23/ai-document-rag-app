import { EVIDENCE_TOKENS, TOP_K } from './config.js';
import { estimateTokens } from './history.js';
import type { Candidate } from './retrieval-types.js';
import type { Source } from './types.js';

const redundant = (candidate: Candidate, selected: Candidate[]) =>
  selected.some((item) => {
    if (
      candidate.documentId !== item.documentId ||
      candidate.metadata.page !== item.metadata.page ||
      candidate.metadata.sheet !== item.metadata.sheet ||
      candidate.metadata.row !== item.metadata.row
    )
      return false;
    return (
      candidate.snippet.replace(/\s+/gu, ' ').trim() === item.snippet.replace(/\s+/gu, ' ').trim()
    );
  });

export const selectEvidence = (candidates: Candidate[], budget = EVIDENCE_TOKENS): Source[] => {
  const selected: Candidate[] = [];
  let tokens = 0;
  for (const candidate of candidates) {
    const cost = estimateTokens(candidate.snippet) + estimateTokens(candidate.title) + 32;
    if (tokens + cost > budget || redundant(candidate, selected)) continue;
    selected.push(candidate);
    tokens += cost;
    if (selected.length === TOP_K) break;
  }
  return selected.map(({ chunkId, documentId, title, snippet, metadata }, index) => ({
    n: index + 1,
    chunkId,
    documentId,
    title,
    snippet,
    page: typeof metadata.page === 'number' ? metadata.page : null,
  }));
};
