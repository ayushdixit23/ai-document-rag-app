import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Document } from '@langchain/core/documents';

import { CHUNK_SIZE, CHUNK_VERSION, EMBEDDING_DIMENSIONS } from '../config.js';
import { embedChunks } from './embed-chunks.js';
import { pageNumber } from './load-document.js';
import { recursiveSplit } from './recursive-split.js';
import { textSections } from './sections.js';
import { splitDocuments } from './split-document.js';

void test('recursive chunks retain paragraphs and use sentence boundaries for long paragraphs', () => {
  const paragraphs = Array.from(
    { length: 8 },
    (_, index) =>
      `Paragraph ${String(index)}: ${'financial results '.repeat(Math.floor(CHUNK_SIZE / 40))}.`,
  );
  const text = paragraphs.join('\n\n');
  const chunks = recursiveSplit(text);
  assert.ok(chunks.length > 1);
  for (const paragraph of paragraphs)
    assert.ok(chunks.some((chunk) => chunk.text.includes(paragraph)));
  const sentences = Array.from(
    { length: 20 },
    (_, index) =>
      `Sentence ${String(index)} states that annual revenue and operating profit increased substantially.`,
  );
  const sentenceChunks = recursiveSplit(sentences.join(' '));
  for (const sentence of sentences)
    assert.ok(
      sentenceChunks.some((chunk) => chunk.text.includes(sentence)),
      sentence,
    );
});

void test('heading hierarchy survives continuation chunks and never crosses into the next section', () => {
  const text = `# Report\n\n## Revenue\n${'Revenue rose. '.repeat(250)}\n\n## Costs\nCosts fell.`;
  const chunks = splitDocuments([new Document({ pageContent: text })], true);
  const revenue = chunks.filter((chunk) => chunk.metadata.heading === 'Report > Revenue');
  assert.ok(revenue.length >= 2);
  assert.ok(revenue.every((chunk) => !chunk.pageContent.includes('Costs')));
  assert.equal(chunks.at(-1)?.metadata.heading, 'Report > Costs');
  assert.equal(chunks.at(-1)?.metadata.chunkVersion, CHUNK_VERSION);
  assert.equal(textSections('# Heading\n```md\n# Not a heading\n```\nContent.').length, 1);
  assert.equal(textSections('# C#\nCode.')[0]?.heading, 'C#');
  assert.equal(textSections('# Heading ##\nText.')[0]?.heading, 'Heading');
});

void test('page/sheet/row boundaries and exact offsets are preserved, including repeated text', () => {
  const text = `  ${'Repeated text 😊. '.repeat(300)}  `;
  const documents = [1, 2].map(
    (page) =>
      new Document({
        pageContent: text,
        metadata: { loc: { pageNumber: page }, sheet: 'Budget', row: page },
      }),
  );
  const chunks = splitDocuments(documents, false);
  for (const chunk of chunks) {
    const start: unknown = chunk.metadata.sourceStart;
    const end: unknown = chunk.metadata.sourceEnd;
    assert.equal(typeof start, 'number');
    assert.equal(typeof end, 'number');
    if (typeof start === 'number' && typeof end === 'number')
      assert.equal(text.slice(start, end), chunk.pageContent);
    assert.equal(chunk.metadata.sheet, 'Budget');
    assert.ok(chunk.pageContent.length <= CHUNK_SIZE);
    assert.doesNotMatch(chunk.pageContent, /[\uD800-\uDBFF]$/u);
  }
  assert.deepEqual(new Set(chunks.map((chunk) => Number(chunk.metadata.row))), new Set([1, 2]));
  const starts = chunks
    .filter((chunk) => chunk.metadata.row === 1)
    .map((chunk) => Number(chunk.metadata.sourceStart));
  assert.ok(starts.every((start, index) => index === 0 || start > (starts[index - 1] ?? 0)));
});

void test('a representative 26-page document fits within one background input allowance', () => {
  const pages = Array.from(
    { length: 26 },
    (_, index) =>
      new Document({
        pageContent: 'This passage explains document scoring and its inputs. '.repeat(40),
        metadata: { loc: { pageNumber: index + 1 } },
      }),
  );
  const chunks = splitDocuments(pages, false);
  assert.ok(chunks.length <= 96, `Expected at most 96 sections, got ${String(chunks.length)}`);
  assert.equal(new Set(chunks.map((chunk) => pageNumber(chunk.metadata))).size, 26);
});

void test('oversized unbroken Unicode falls back safely, with no lost non-whitespace content', () => {
  for (const text of ['😊'.repeat(2_000), 'x'.repeat(8_000), '日本語。'.repeat(1_500)]) {
    const spans = recursiveSplit(text);
    const covered = new Uint8Array(text.length);
    for (const span of spans) {
      assert.ok(span.text.length <= CHUNK_SIZE);
      assert.equal(text.slice(span.start, span.start + span.text.length), span.text);
      covered.fill(1, span.start, span.start + span.text.length);
    }
    assert.ok(covered.every(Boolean));
  }
  assert.deepEqual(recursiveSplit(' \n\n '), []);
});

void test('embeddings include heading context while storage retains original text and source metadata', async () => {
  const chunk = new Document({
    pageContent: 'Revenue rose.',
    metadata: {
      heading: 'Report > Revenue',
      sourceStart: 50,
      sourceEnd: 63,
      chunkVersion: CHUNK_VERSION,
      loc: { pageNumber: 2 },
      sheet: 'Budget',
      row: 3,
    },
  });
  const rows = await embedChunks({ id: 'doc', userId: 'owner' }, [chunk], (texts) => {
    assert.deepEqual(texts, ['Report > Revenue\n\nRevenue rose.']);
    return Promise.resolve([Array<number>(EMBEDDING_DIMENSIONS).fill(0.1)]);
  });
  assert.equal(rows[0]?.content, 'Revenue rose.');
  assert.deepEqual(rows[0].metadata, {
    heading: 'Report > Revenue',
    sourceStart: 50,
    sourceEnd: 63,
    chunkVersion: CHUNK_VERSION,
    page: 2,
    sheet: 'Budget',
    row: 3,
  });
});
