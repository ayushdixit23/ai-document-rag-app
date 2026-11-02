import type { Source } from './types.js';

export const parseCitations = (content: string, sources: Source[]): Source[] => {
  const used = new Set(Array.from(content.matchAll(/\[(\d+)\]/gu), (match) => Number(match[1])));
  return sources.filter((source) => used.has(source.n));
};

export const publicCitations = (sources: Source[]) =>
  sources.map(({ chunkId: _chunkId, ...citation }) => citation);
