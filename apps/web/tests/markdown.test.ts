import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkdownIntoBlocks } from 'streamdown';

import { MessageContent } from '@/components/chats/message-content';

import { citation } from './fixtures';

function render(content: string, pending = false, citations = [citation]) {
  return renderToStaticMarkup(createElement(MessageContent, { content, pending, citations }));
}

void test('assistant Markdown formats headings, emphasis, nested lists, quotes and tables', () => {
  const html = render(
    '### Emotional intelligence\n\nTechnical skill **matters**, and *empathy* matters too.\n\n' +
      '- **Listen:** understand the person.\n  - Ask a follow-up.\n- Build trust.\n\n' +
      '1. Listen\n2. Respond\n\n> Start with understanding.\n\n' +
      '| Skill | Benefit |\n| --- | --- |\n| Listening | Trust |',
  );
  assert.match(html, /<h3[^>]*>Emotional intelligence<\/h3>/);
  assert.match(html, /<strong[^>]*>matters<\/strong>/);
  assert.match(html, /<em>empathy<\/em>/);
  assert.match(html, /<ul/);
  assert.match(html, /<ol/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>Skill<\/th>/);
  assert.match(html, /<td[^>]*>Trust<\/td>/);
  assert.doesNotMatch(html, /### Emotional|\*\*Listen/);
});

void test('known citations work inside formatted prose while unknown markers stay literal', () => {
  const html = render('**Revenue grew [1].**\n\n- Evidence [1]\n- Unknown [99]');
  assert.equal((html.match(/aria-label="Source 1:/g) ?? []).length, 2);
  assert.match(html, /\[99\]/);
  assert.doesNotMatch(html, /Source 99:/);
  assert.doesNotMatch(render('Unknown [1]', false, []), /aria-label="Source/);
});

void test('inline code, fenced code and link labels never become citation chips', () => {
  const html = render(
    'Use `items[1]`.\n\n```ts\nconst items = [1];\n```\n\n[Read [1]](https://example.com)',
  );
  assert.doesNotMatch(html, /aria-label="Source/);
  assert.match(html, /<pre/);
  assert.match(html, /const items = \[1\];/);
  assert.match(html, /href="https:\/\/example.com\/"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

void test('HTML, unsafe links and unsolicited images cannot execute or load', () => {
  const html = render(
    '<script>alert(1)</script>\n\n[Click](javascript:alert%281%29)\n\n' +
      '![Remote chart](https://example.com/tracking.png)\n\n<img src=x onerror="alert(1)">',
  );
  assert.doesNotMatch(html, /<script|<img|href="javascript:|<[^>]+\sonerror\s*=/);
  assert.match(html, /Remote chart/);
  assert.match(render('[Docs](https://example.com/docs)'), /href="https:\/\/example.com\/docs"/);
});

void test('unfinished Markdown renders while streaming and remains valid when finalized', () => {
  const prefix = '### Summary\n\nA **streaming answer';
  assert.match(render(prefix, true), /<strong[^>]*>streaming answer<\/strong>/);
  const completed = render(prefix + '**.\n\n- First\n- Second');
  assert.match(completed, /<h3[^>]*>Summary<\/h3>/);
  assert.match(completed, /<ul/);
  assert.match(render('```js\nconsole.log("hello")', true), /<pre/);
});

void test('extending the active block preserves the completed block prefix', () => {
  const settled = '### Summary\n\nA completed paragraph.\n\n';
  const first = parseMarkdownIntoBlocks(settled + 'Growing **text');
  const next = parseMarkdownIntoBlocks(settled + 'Growing **text with more tokens');
  assert.ok(first.length >= 3);
  assert.deepEqual(first.slice(0, -1), next.slice(0, -1));
});
