import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDocument, makeHarness, makeTurn, source } from './query-pipeline.fixtures.js';
import { runQueryPipeline } from './query-pipeline.js';

void test('no-document chat skips routing and retrieval and persists a normal answer', async () => {
  const harness = makeHarness();
  await runQueryPipeline(makeTurn(), harness.stream, harness.dependencies);
  assert.equal(harness.calls.routed, 0);
  assert.equal(harness.calls.retrieved, 0);
  assert.equal(harness.calls.saved, 1);
  assert.equal(harness.calls.summary, 1);
  assert.deepEqual(harness.calls.citations, []);
  assert.deepEqual(
    harness.events.map((item) => item.event),
    ['meta', 'sources', 'token', 'done'],
  );
});

void test('document follow-ups retrieve only ready documents using the standalone question', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  const harness = makeHarness();
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.query, 'standalone question');
  assert.deepEqual(harness.calls.citations, [source]);
  assert.equal(harness.events.at(-1)?.event, 'done');
});

void test('topic switches skip retrieval without dropping the document scope', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  const harness = makeHarness('general');
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.retrieved, 0);
  assert.equal(turn.documents.length, 1);
  harness.dependencies.routeQuestion = () =>
    Promise.resolve({ route: 'documents', standaloneQuery: 'back to report' });
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.retrieved, 1);
});

void test('processing documents are reported without embedding or retrieval', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const harness = makeHarness();
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.deepEqual(harness.events[0]?.data, {
    userMessageId: 'user-message',
    processingDocumentIds: ['doc'],
  });
  assert.equal(harness.calls.retrieved, 0);
});

void test('failed or disconnected generations never persist a partial assistant message', async () => {
  const harness = makeHarness();
  harness.dependencies.streamAnswer = () => Promise.reject(new Error('provider unavailable'));
  await assert.rejects(
    runQueryPipeline(makeTurn(), harness.stream, harness.dependencies),
    /provider unavailable/u,
  );
  assert.equal(harness.calls.saved, 0);
  harness.dependencies.streamAnswer = () =>
    Promise.resolve(
      (async function* () {
        yield await Promise.resolve({ text: 'partial' });
        harness.controller.abort();
      })(),
    );
  await assert.rejects(runQueryPipeline(makeTurn(), harness.stream, harness.dependencies), {
    name: 'AbortError',
  });
  assert.equal(harness.calls.saved, 0);
});
