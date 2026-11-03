export interface TextSection {
  text: string;
  start: number;
  heading: string;
}

const nextFence = (line: string, fence: string): string => {
  const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
  if (!marker) return fence;
  if (!fence) return marker;
  return marker.startsWith(fence[0] ?? '') && marker.length >= fence.length ? '' : fence;
};

/** Only explicit Markdown headings are recognized; PDF typography is unavailable to the loader. */
export const textSections = (text: string): TextSection[] => {
  const sections: TextSection[] = [];
  const headings: string[] = [];
  let start = 0;
  let offset = 0;
  let fence = '';
  let heading = '';
  for (const line of text.split(/(?<=\n)/u)) {
    fence = nextFence(line, fence);
    const match = !fence && /^ {0,3}(#{1,6})[\t ]+(.+?)\s*$/u.exec(line.trimEnd());
    if (match) {
      if (offset > start) sections.push({ text: text.slice(start, offset), start, heading });
      const level = match[1]?.length ?? 1;
      headings.length = level - 1;
      headings[level - 1] = (match[2] ?? '').replace(/[\t ]+#+$/u, '');
      heading = headings.filter(Boolean).join(' > ');
      start = offset;
    }
    offset += line.length;
  }
  if (start < text.length) sections.push({ text: text.slice(start), start, heading });
  return sections;
};
