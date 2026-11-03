import type { Source } from './types.js';

export type RetrievedChunk = Omit<Source, 'n' | 'page'> & {
  metadata: Record<string, unknown>;
  score: number;
};

export interface Candidate extends RetrievedChunk {
  fusionScore: number;
  vectorRank?: number;
  lexicalRank?: number;
  vectorScore?: number;
  lexicalScore?: number;
  rerankScore?: number;
}

export interface SearchScope {
  userId: string;
  documentIds: string[];
}
