// Query glue is removed without assuming the document's language or stemming identifiers.
const QUERY_GLUE = new Set(
  'a an and are as at be by can could did do does for from how i in is it me of on or please tell that the their them there these this to was were what when where which who why will with would you'.split(
    ' ',
  ),
);

export const tokenize = (text: string): string[] =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}\p{M}]+(?:[-_.][\p{L}\p{N}\p{M}]+)*/gu) ?? [];

export const searchTerms = (query: string): string[] =>
  [...new Set(tokenize(query).filter((term) => !QUERY_GLUE.has(term)))].slice(0, 32);

/** OR terms for recall; quoted phrases remain phrase queries. Values are bound SQL parameters. */
export const lexicalQueryText = (query: string): string => {
  const phrases = [...query.matchAll(/"([^"\n]+)"/gu)].slice(0, 4).map(
    (match) =>
      `"${tokenize(match[1] ?? '')
        .slice(0, 12)
        .join(' ')}"`,
  );
  const terms = searchTerms(query).map((term) => `"${term}"`);
  return [...new Set([...phrases, ...terms])].join(' OR ');
};
