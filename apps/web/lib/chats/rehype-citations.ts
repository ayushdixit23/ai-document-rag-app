import type { Element, Root, Text } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

const LITERAL_ELEMENTS = new Set(['a', 'code', 'pre', 'script', 'style']);

function citationNodes(value: string): (Element | Text)[] {
  const result: (Element | Text)[] = [];
  let offset = 0;
  for (const match of value.matchAll(/\[(\d+)\]/g)) {
    if (match.index > offset)
      result.push({ type: 'text', value: value.slice(offset, match.index) });
    result.push({
      type: 'element',
      tagName: 'cite',
      properties: { 'data-citation': Number(match[1]) },
      children: [{ type: 'text', value: match[0] }],
    });
    offset = match.index + match[0].length;
  }
  if (offset < value.length) result.push({ type: 'text', value: value.slice(offset) });
  return result;
}

/** Transform prose markers after sanitization; code and link contents stay literal. */
export function rehypeCitations() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'element' && LITERAL_ELEMENTS.has(node.tagName)) return SKIP;
      if (node.type !== 'text' || index === undefined || !parent || !/\[\d+\]/.test(node.value))
        return;
      const nodes = citationNodes(node.value);
      parent.children.splice(index, 1, ...nodes);
      return index + nodes.length;
    });
  };
}
