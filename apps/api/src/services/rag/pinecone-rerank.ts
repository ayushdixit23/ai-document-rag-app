import { z } from 'zod';

import { RERANK_MODEL } from './config.js';
import { rerankInput } from './rerank-input.js';
import type { Candidate } from './retrieval-types.js';

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), score: z.number() })),
  usage: z.object({ rerank_units: z.number().nonnegative() }).optional(),
});

export class RerankProviderError extends Error {
  constructor(
    readonly status: number,
    readonly monthly: boolean,
  ) {
    super(`Reranking provider returned HTTP ${String(status)}`);
  }
}

export const pineconeRerank = async (input: {
  query: string;
  candidates: Candidate[];
  apiKey: string;
  signal: AbortSignal;
  fetch: typeof fetch;
}) => {
  const prepared = rerankInput(input.query, input.candidates);
  const response = await input.fetch('https://api.pinecone.io/rerank', {
    method: 'POST',
    signal: input.signal,
    headers: {
      'Api-Key': input.apiKey,
      'Content-Type': 'application/json',
      'X-Pinecone-Api-Version': '2026-07',
    },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query: prepared.query,
      documents: prepared.documents,
      top_n: input.candidates.length,
      return_documents: false,
      rank_fields: ['text'],
      parameters: { truncate: 'END' },
    }),
  });
  if (!response.ok) {
    const body = response.status === 429 ? await response.text() : '';
    throw new RerankProviderError(response.status, /month|quota/iu.test(body));
  }
  const result = responseSchema.parse(await response.json());
  const indices = new Set(result.data.map((item) => item.index));
  if (indices.size !== input.candidates.length || result.data.length !== input.candidates.length)
    throw new Error('Incomplete or duplicated reranking indices.');
  const candidates = result.data.map(({ index, score }) => {
    const candidate = input.candidates[index];
    if (!candidate) throw new Error('Unknown reranking index.');
    return { ...candidate, rerankScore: score };
  });
  candidates.sort((a, b) => b.rerankScore - a.rerankScore || b.fusionScore - a.fusionScore);
  return { candidates, shortened: prepared.shortened, units: result.usage?.rerank_units };
};
