import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EmbeddingRateLimit } from './embedding-rate-limit.js';

void test('input pacing stays under the allowance and reports the next available time', async () => {
  let now = 0;
  const waits: number[] = [];
  const retryTimes: string[] = [];
  const limit = new EmbeddingRateLimit(
    96,
    () => now,
    (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
  );
  await Promise.all([limit.acquire(48), limit.acquire(48)]);
  assert.deepEqual(waits, []);
  await limit.acquire(48, undefined, (retryAt) => {
    retryTimes.push(retryAt);
    return Promise.resolve();
  });
  assert.deepEqual(waits, [60_000]);
  assert.equal(retryTimes[0], new Date(60_000).toISOString());
  await limit.acquire(18);
  assert.deepEqual(waits, [60_000]);
});

void test('cancelled pacing never reserves or dispatches more input', async () => {
  const controller = new AbortController();
  const limit = new EmbeddingRateLimit(1);
  await limit.acquire(1);
  const waiting = limit.acquire(1, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  await assert.rejects(limit.acquire(2), /allowance/u);
});

void test('rejected provider requests refund input reservations and share the provider cooldown', async () => {
  let now = 0;
  const waits: number[] = [];
  const limit = new EmbeddingRateLimit(
    48,
    () => now,
    (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
  );
  const reservation = await limit.acquire(48);
  reservation.release();
  limit.deferFor(12_000);
  await limit.acquire(48);
  assert.deepEqual(waits, [12_000]);
});
