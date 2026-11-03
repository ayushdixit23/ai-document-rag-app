import assert from 'node:assert/strict';
import { test } from 'node:test';

import { candidate } from './retrieval.fixtures.js';
import { SourceCache, sourceCacheKey } from './retrieval-cache.js';

void test('cache keys change on owner, document selection, content version, and rewritten question', () => {
  const versions = [
    { id: 'a', updatedAt: new Date(1) },
    { id: 'b', updatedAt: new Date(2) },
  ];
  const key = sourceCacheKey('owner', versions, 'Revenue?');
  assert.equal(key, sourceCacheKey('owner', [...versions].reverse(), 'Revenue?'));
  assert.notEqual(key, sourceCacheKey('other-owner', versions, 'Revenue?'));
  assert.notEqual(key, sourceCacheKey('owner', versions.slice(0, 1), 'Revenue?'));
  assert.notEqual(key, sourceCacheKey('owner', [{ id: 'a', updatedAt: new Date(3) }], 'Revenue?'));
  assert.notEqual(key, sourceCacheKey('owner', versions, 'Costs?'));
});

void test('evidence cache expires, evicts least recently used entries, and cannot be mutated by callers', () => {
  let now = 0;
  const cache = new SourceCache(() => now, 2);
  const source = { ...candidate('a'), n: 1, page: 1 };
  cache.set('a', [source]);
  cache.set('b', [source]);
  const hit = cache.get('a');
  assert.ok(hit?.[0]);
  hit[0].snippet = 'Modified by caller';
  assert.notEqual(cache.get('a')?.[0]?.snippet, hit[0].snippet);
  cache.set('c', [source]);
  assert.equal(cache.get('b'), undefined);
  now = 120_001;
  assert.equal(cache.get('a'), undefined);
});
