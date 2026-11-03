import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { ApiError } from '@/lib/api';
import { pollDocument } from '@/lib/documents/poll';
import { documentPollDelay } from '@/lib/documents/poll-delay';

import { document, jsonResponse, mockFetch } from './fixtures';

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

async function advance(milliseconds: number) {
  mock.timers.tick(milliseconds);
  await setImmediate();
}

void test('composer and message observers share one authenticated status request', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const fetch = mockFetch(() => jsonResponse({ document: { ...document, status: 'ready' } }));
  const first: string[] = [];
  const second: string[] = [];
  const observers = [
    pollDocument(document, (value) => first.push(value.status), new AbortController().signal),
    pollDocument(document, (value) => second.push(value.status), new AbortController().signal),
  ];
  await advance(1500);
  await Promise.all(observers);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(first, ['ready']);
  assert.deepEqual(second, ['ready']);
});

void test('removing one observer preserves status updates for the remaining observer', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const fetch = mockFetch(() => jsonResponse({ document: { ...document, status: 'ready' } }));
  const firstController = new AbortController();
  const first = pollDocument(
    document,
    () => assert.fail('Cancelled observer updated'),
    firstController.signal,
  );
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  const updates: string[] = [];
  const second = pollDocument(
    document,
    (value) => updates.push(value.status),
    new AbortController().signal,
  );
  firstController.abort();
  await advance(1500);
  await Promise.all([cancelled, second]);
  assert.deepEqual(updates, ['ready']);
  assert.equal(fetch.mock.callCount(), 1);
});

void test('last observer cancellation aborts the fetch without cancelling a replacement watch', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  let sharedSignal: AbortSignal | undefined;
  mockFetch((_url, init) => {
    requests += 1;
    if (requests > 1) return jsonResponse({ document: { ...document, status: 'ready' } });
    sharedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      sharedSignal?.addEventListener(
        'abort',
        () => {
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  });
  const controller = new AbortController();
  const cancelled = assert.rejects(
    pollDocument(document, () => undefined, controller.signal),
    { name: 'AbortError' },
  );
  await advance(1500);
  controller.abort();
  const replacement = pollDocument(document, () => undefined, new AbortController().signal);
  await advance(1500);
  await Promise.all([cancelled, replacement]);
  assert.equal(sharedSignal?.aborted, true);
  assert.equal(requests, 2);
});

void test('known provider cooldowns back off polling and respect the next batch time', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const fetch = mockFetch(() => jsonResponse({ document: { ...document, status: 'ready' } }));
  const waiting = {
    ...document,
    processingProgress: {
      stage: 'waiting' as const,
      completed: 96,
      total: 138,
      retryAt: new Date(60_000).toISOString(),
    },
  };
  assert.equal(documentPollDelay(waiting, 10, 0), 15_000);
  assert.equal(documentPollDelay(waiting, 10, 50_000), 10_000);
  assert.equal(documentPollDelay(waiting, 10, 60_000), 5_000);
  const observing = pollDocument(waiting, () => undefined, new AbortController().signal);
  await advance(14_999);
  assert.equal(fetch.mock.callCount(), 0);
  await advance(1);
  await observing;
  assert.equal(fetch.mock.callCount(), 1);
});

void test('authentication failures stop polling instead of repeatedly checking the same session', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const fetch = mockFetch(() =>
    Response.json({ success: false, message: 'Authentication required' }, { status: 401 }),
  );
  const failure = assert.rejects(
    pollDocument(document, () => undefined, new AbortController().signal),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
  await advance(1500);
  await failure;
  assert.equal(fetch.mock.callCount(), 1);
});
