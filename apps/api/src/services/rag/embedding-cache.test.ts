import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMBEDDING_DIMENSIONS } from './config.js';
import { embedCached, type EmbeddingCacheStore } from './embedding-cache.js';

void test('reuploads reuse verified vectors, preserve duplicate source positions, and do not call the provider', async () => {
  const saved = new Map<string, number[]>();
  const store: EmbeddingCacheStore = {
    load: (keys) =>
      Promise.resolve(
        keys.flatMap((textHash) => {
          const embedding = saved.get(textHash);
          return embedding ? [{ textHash, embedding }] : [];
        }),
      ),
    save: (entries) => {
      entries.forEach((entry) => saved.set(entry.textHash, entry.embedding));
      return Promise.resolve();
    },
  };
  let inputs = 0;
  const embed = (texts: string[]) => {
    inputs += texts.length;
    return Promise.resolve(
      texts.map((_text, index) => Array<number>(EMBEDDING_DIMENSIONS).fill(index + 1)),
    );
  };
  const first = await embedCached(['Revenue\nrose.', 'Costs fell.', 'Revenue rose.'], embed, store);
  assert.equal(inputs, 2);
  assert.deepEqual(first[0], first[2]);
  const again = await embedCached(
    ['Revenue rose.', 'Costs fell.'],
    () => assert.fail('Cache must avoid provider calls'),
    store,
  );
  assert.deepEqual(again, first.slice(0, 2));
});

void test('malformed embeddings are never saved and provider failure leaves verified batches reusable', async () => {
  let saves = 0;
  const store: EmbeddingCacheStore = {
    load: () => Promise.resolve([]),
    save: () => {
      saves += 1;
      return Promise.resolve();
    },
  };
  for (const result of [[], [[1]], [Array<number>(EMBEDDING_DIMENSIONS).fill(NaN)]])
    await assert.rejects(embedCached(['text'], () => Promise.resolve(result), store));
  await assert.rejects(
    embedCached(['text'], () => Promise.reject(new Error('Quota exceeded')), store),
  );
  assert.equal(saves, 0);
});
