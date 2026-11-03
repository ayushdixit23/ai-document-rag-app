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
  assert.equal(harness.calls.summary, 0);
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

void test('processing documents are reported, refreshed, and then used for the answer', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const harness = makeHarness();
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.deepEqual(harness.events[0]?.data, {
    userMessageId: 'user-message',
    processingDocumentIds: ['doc'],
  });
  assert.equal(harness.calls.retrieved, 1);
  assert.deepEqual(
    harness.events.filter((item) => item.event === 'status').map((item) => item.data),
    [
      { phase: 'reading_documents', documentIds: ['doc'] },
      {
        phase: 'answering',
        documentIds: ['doc'],
        documentVersions: [{ id: 'doc', updatedAt: new Date(0).toISOString() }],
      },
    ],
  );
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

void test('retrieval failures produce an honest answer without fabricated citations', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  const harness = makeHarness();
  harness.dependencies.retrieveSources = () => Promise.reject(new Error('embedding unavailable'));
  const original = harness.dependencies.streamAnswer;
  harness.dependencies.streamAnswer = (messages, signal) => {
    assert.match(messages[0]?.text ?? '', /"retrievalFailed":true/u);
    return original(messages, signal);
  };
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.saved, 1);
  assert.deepEqual(harness.calls.citations, []);
});

void test('upload-only turns bypass the router and retrieve ready document context', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  turn.input = { content: '', documentIds: ['doc'] };
  const harness = makeHarness();
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.routed, 0);
  assert.equal(harness.calls.retrieved, 1);
});

void test('summary work is queued only once the unsummarized token threshold is reached', async () => {
  const turn = makeTurn();
  turn.input.content = 'x'.repeat(12_000);
  const harness = makeHarness();
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.summary, 1);
});

void test('upload-only turns wait for the new file and then retrieve it instead of older files', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  const older = turn.documents[0];
  assert.ok(older);
  older.id = 'older';
  addDocument(turn, 'processing');
  turn.input = { content: '', documentIds: ['doc'] };
  const harness = makeHarness();
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.routed, 0);
  assert.equal(harness.calls.retrieved, 1);
});

void test('an unavailable router permits normal answers to unrelated questions', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  const harness = makeHarness();
  harness.dependencies.routeQuestion = () =>
    Promise.resolve({ route: 'documents', standaloneQuery: 'What is 2 + 2?', fallback: true });
  const original = harness.dependencies.streamAnswer;
  harness.dependencies.streamAnswer = (messages, signal) => {
    assert.match(messages[0]?.text ?? '', /document route is provisional/u);
    return original(messages, signal);
  };
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.saved, 1);
});
