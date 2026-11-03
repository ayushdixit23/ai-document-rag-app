import { withDeadline } from './deadline.js';
import { fuseRanks } from './rank-fusion.js';
import type { RetrievedChunk } from './retrieval-types.js';
import { lexicalQueryText } from './search-terms.js';

export interface SearchDependencies {
  vector: (query: string, signal: AbortSignal) => Promise<RetrievedChunk[]>;
  lexical: (query: string, signal: AbortSignal) => Promise<RetrievedChunk[]>;
  report: (branch: string) => void;
  mode: 'vector' | 'hybrid' | 'hybrid_rerank';
}

export const searchCandidates = async (
  query: string,
  signal: AbortSignal,
  dependencies: SearchDependencies,
) => {
  const lexicalText = lexicalQueryText(query);
  const [vector, lexical] = await Promise.allSettled([
    withDeadline((child) => dependencies.vector(query, child), signal, 5_500),
    dependencies.mode === 'vector' || !lexicalText
      ? Promise.resolve([])
      : withDeadline((child) => dependencies.lexical(lexicalText, child), signal, 5_500),
  ]);
  signal.throwIfAborted();
  if (vector.status === 'rejected') dependencies.report('vector');
  if (lexical.status === 'rejected') dependencies.report('lexical');
  if (
    vector.status === 'rejected' &&
    (lexical.status === 'rejected' || dependencies.mode === 'vector' || !lexicalText)
  )
    throw new Error('Document search is unavailable.');
  return fuseRanks(
    vector.status === 'fulfilled' ? vector.value : [],
    lexical.status === 'fulfilled' ? lexical.value : [],
  );
};
