/** Instant naming keeps auxiliary model calls from competing with answer generation. */
export const promptTitle = (content: string | null, documentNames: string[]): string => {
  const text = (content?.trim() || documentNames.join(', ') || 'Documents').replace(/\s+/gu, ' ');
  const firstSentence =
    new Intl.Segmenter(undefined, { granularity: 'sentence' })
      .segment(text)
      [Symbol.iterator]()
      .next().value?.segment ?? text;
  return firstSentence.trim().split(/\s+/u).slice(0, 9).join(' ').slice(0, 80);
};
