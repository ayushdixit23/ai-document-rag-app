import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lowLatencyThinking } from './model-options.js';
import { makeTurn } from './query-pipeline.fixtures.js';
import { type RouteInput, routeWithFallback } from './route-policy.js';

const input = (): RouteInput => ({
  content: 'What about its costs?',
  summary: null,
  history: [],
  documentNames: ['report.pdf'],
  hasNewAttachments: false,
  signal: new AbortController().signal,
});

void test('successful topic switches pass through without fallback', async () => {
  const expected = { route: 'general' as const, standaloneQuery: 'What is the weather?' };
  const result = await routeWithFallback(
    input(),
    () => Promise.resolve(expected),
    () => assert.fail(),
  );
  assert.deepEqual(result, expected);
});

void test('a hanging router is aborted and returns a contextual document query', async () => {
  const request = input();
  const turn = makeTurn();
  request.history = [
    {
      id: 'first',
      chatId: turn.chat.id,
      role: 'user',
      content: 'Explain the merger.',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  let child: AbortSignal | undefined;
  let failures = 0;
  const result = await routeWithFallback(
    request,
    (signal) => {
      child = signal;
      return new Promise(() => {});
    },
    () => {
      failures += 1;
    },
    10,
  );
  assert.equal(child?.aborted, true);
  assert.equal(failures, 1);
  assert.equal(result.route, 'documents');
  assert.match(result.standaloneQuery, /merger/u);
  assert.match(result.standaloneQuery, /costs/u);
});

void test('client cancellation propagates without fallback or extra provider work', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    routeWithFallback(
      { ...input(), signal: controller.signal },
      () => {
        calls += 1;
        return Promise.resolve({ route: 'general', standaloneQuery: 'hello' });
      },
      () => assert.fail(),
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 0);
});

void test('latency settings use the supported thinking controls for each model family', () => {
  assert.deepEqual(lowLatencyThinking('gemini-3.1-flash-lite'), { thinkingLevel: 'minimal' });
  assert.deepEqual(lowLatencyThinking('gemini-3.1-pro-preview'), { thinkingLevel: 'low' });
  assert.deepEqual(lowLatencyThinking('gemini-2.5-flash-lite'), { thinkingBudget: 0 });
  assert.deepEqual(lowLatencyThinking('gemini-2.5-pro'), {});
});
