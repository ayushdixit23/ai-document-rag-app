import type { Candidate } from './retrieval-types.js';

const clipBytes = (value: string, maximum: number): string => {
  let bytes = 0;
  let result = '';
  for (const character of value.normalize('NFKC')) {
    bytes += Buffer.byteLength(character);
    if (bytes > maximum) break;
    result += character;
  }
  return result;
};

/** Conservative UTF-8 budget, rather than treating characters as model tokens. */
export const rerankInput = (query: string, candidates: Candidate[]) => {
  const question = clipBytes(query, 256);
  // Leave room for SentencePiece boundary/special tokens under the 1,024-token pair limit.
  const passageBytes = 1_000 - Buffer.byteLength(question);
  let shortened = question !== query;
  const documents = candidates.map((candidate) => {
    const heading =
      typeof candidate.metadata.heading === 'string' ? candidate.metadata.heading : '';
    const full = `${candidate.title}\n${heading}\n${candidate.snippet}`;
    const text = clipBytes(full, passageBytes);
    shortened ||= text !== full;
    return { id: candidate.chunkId, text };
  });
  return { query: question, documents, shortened };
};
