import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Document } from '@langchain/core/documents';

import { EMBEDDING_DIMENSIONS } from '../config.js';
import { embedChunks } from './embed-chunks.js';

void test('embedding batches overlap with bounded concurrency and retain source order', async () => {
  let active = 0;
  let maximum = 0;
  const chunks = Array.from(
    { length: 200 },
    (_, index) => new Document({ pageContent: String(index) }),
  );
  const rows = await embedChunks({ id: 'document', userId: 'owner' }, chunks, async (texts) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, texts[0] === '0' ? 10 : 1));
    active -= 1;
    return texts.map((text) => Array<number>(EMBEDDING_DIMENSIONS).fill(Number(text)));
  });
  assert.equal(maximum, 2);
  assert.equal(rows.length, 200);
  rows.forEach((row, index) => {
    assert.equal(row.chunkIndex, index);
    assert.equal(row.content, String(index));
    assert.equal(row.embedding[0], index);
    assert.equal(row.userId, 'owner');
  });
});

void test('incomplete, non-finite, or dimensionally invalid embeddings never reach storage', async () => {
  const chunks = [new Document({ pageContent: 'text' })];
  for (const vectors of [[], [[1]], [Array<number>(EMBEDDING_DIMENSIONS).fill(NaN)]])
    await assert.rejects(
      embedChunks({ id: 'document', userId: 'owner' }, chunks, () => Promise.resolve(vectors)),
      /embedding response/iu,
    );
});

void test('completed chunks advance monotonically, including batches that finish out of order', async () => {
  const progress: number[] = [];
  const chunks = Array.from(
    { length: 162 },
    (_, index) => new Document({ pageContent: String(index) }),
  );
  await embedChunks(
    { id: 'doc', userId: 'owner' },
    chunks,
    async (texts) => {
      await new Promise((resolve) => setTimeout(resolve, texts[0] === '0' ? 5 : 1));
      return texts.map(() => Array<number>(EMBEDDING_DIMENSIONS).fill(0.1));
    },
    {
      onProgress: (completed) => {
        progress.push(completed);
        return Promise.resolve();
      },
    },
  );
  assert.deepEqual(progress, [48, 96, 144, 162]);
});
