import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTokenBuffer } from '@/lib/chats/token-buffer';

void test('first text appears immediately and subsequent network bursts are combined without losing text', () => {
  const updates: string[] = [];
  let scheduled: (() => void) | undefined;
  let schedules = 0;
  const buffer = createTokenBuffer(
    (text) => updates.push(text),
    (callback) => {
      schedules += 1;
      scheduled = callback;
      return () => {
        scheduled = undefined;
      };
    },
  );
  buffer.append('First');
  assert.deepEqual(updates, ['First']);
  for (let index = 0; index < 100; index += 1) buffer.append(' word');
  assert.equal(schedules, 1);
  assert.equal(updates.length, 1);
  scheduled?.();
  assert.equal(updates.length, 2);
  assert.equal(updates.join(''), 'First' + ' word'.repeat(100));
});

void test('terminal flush includes the final text before completion or error', () => {
  const updates: string[] = [];
  let cancelled = false;
  const buffer = createTokenBuffer(
    (text) => updates.push(text),
    () => () => {
      cancelled = true;
    },
  );
  buffer.append('Hello');
  buffer.append(' world');
  buffer.flush();
  buffer.flush();
  assert.equal(cancelled, true);
  assert.deepEqual(updates, ['Hello', ' world']);
});

void test('disposal cancels outstanding updates and ignores late tokens', () => {
  const updates: string[] = [];
  const buffer = createTokenBuffer(
    (text) => updates.push(text),
    () => () => undefined,
  );
  buffer.append('Kept');
  buffer.append('discarded');
  buffer.dispose();
  buffer.flush();
  buffer.append('late');
  assert.deepEqual(updates, ['Kept']);
});
