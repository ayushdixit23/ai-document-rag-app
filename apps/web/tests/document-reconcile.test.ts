import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reconcileDocument } from '@/lib/documents/reconcile';

import { document } from './fixtures';

void test('terminal document states survive same-version polls while fresh versions remain usable', () => {
  const ready = { ...document, status: 'ready' as const, updatedAt: '2026-11-03T10:00:00.000Z' };
  assert.equal(reconcileDocument(ready, { ...ready, status: 'processing' }), ready);
  assert.equal(
    reconcileDocument({ ...ready, status: 'failed' }, { ...ready, status: 'pending' }).status,
    'failed',
  );
  const enriched = { ...ready, chunkCount: 162 };
  assert.equal(reconcileDocument(ready, enriched), enriched);
  const retry = { ...ready, status: 'pending' as const, updatedAt: '2026-11-03T10:00:01.000Z' };
  assert.equal(reconcileDocument(ready, retry), retry);
  assert.equal(reconcileDocument(retry, ready), retry);
});
