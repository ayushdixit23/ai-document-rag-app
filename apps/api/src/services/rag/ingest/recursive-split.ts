import { CHUNK_OVERLAP, CHUNK_SIZE } from '../config.js';

const boundaries = [
  (text: string) => text.split(/(?<=\n[\t ]*\n)/u),
  (text: string) =>
    Array.from(
      new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text),
      (item) => item.segment,
    ),
  (text: string) => text.split(/(?<=\n)/u),
  (text: string) => text.split(/(?<=\s)/u),
  (text: string) => Array.from(text),
];

const splitRecursively = (text: string, level = 0): string[] => {
  if (text.length <= CHUNK_SIZE) return [text];
  const split = boundaries[level];
  if (!split) throw new Error('Unable to split document text.');
  return split(text).flatMap((part) => splitRecursively(part, level + 1));
};

const appendChunk = (chunks: TextSpan[], pending: string[], start: number) => {
  const raw = pending.join('');
  const text = raw.trim();
  if (text) chunks.push({ text, start: start + raw.indexOf(text) });
};

export interface TextSpan {
  text: string;
  start: number;
}

/** Prefer whole paragraphs, then sentences, lines, words, and finally Unicode code points. */
export const recursiveSplit = (text: string): TextSpan[] => {
  const chunks: TextSpan[] = [];
  const pending: string[] = [];
  let length = 0;
  let start = 0;
  for (const part of splitRecursively(text)) {
    if (length + part.length > CHUNK_SIZE && pending.length) {
      appendChunk(chunks, pending, start);
      while (pending.length && (length > CHUNK_OVERLAP || length + part.length > CHUNK_SIZE)) {
        const removed = pending.shift()?.length ?? 0;
        length -= removed;
        start += removed;
      }
    }
    pending.push(part);
    length += part.length;
  }
  appendChunk(chunks, pending, start);
  return chunks;
};
