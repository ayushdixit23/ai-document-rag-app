import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDocument, makeHarness, makeTurn } from './query-pipeline.fixtures.js';
import { runQueryPipeline } from './query-pipeline.js';

void test('indexing blocks generation and saving until every document is ready', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const harness = makeHarness();
  let polls = 0;
  harness.dependencies.documents.load = () => {
    polls += 1;
    assert.equal(harness.calls.saved, 0);
    assert.equal(harness.calls.retrieved, 0);
    return Promise.resolve(
      turn.documents.map((row) => ({ ...row, status: polls < 2 ? 'processing' : 'ready' })),
    );
  };
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(polls, 2);
  assert.equal(harness.calls.retrieved, 1);
  assert.equal(harness.calls.saved, 1);
  assert.deepEqual(
    harness.events.map((row) => row.event),
    ['meta', 'status', 'status', 'sources', 'token', 'done'],
  );
});

void test('indexing failures or deleted files never produce a misleading assistant message', async () => {
  for (const state of ['failed', 'deleted'] as const) {
    const turn = makeTurn();
    addDocument(turn, 'processing');
    const harness = makeHarness();
    harness.dependencies.documents.load = () =>
      Promise.resolve(
        state === 'deleted' ? [] : turn.documents.map((row) => ({ ...row, status: 'failed' })),
      );
    await assert.rejects(runQueryPipeline(turn, harness.stream, harness.dependencies));
    assert.equal(harness.calls.saved, 0);
    assert.equal(harness.calls.retrieved, 0);
  }
});

void test('stopping while indexing cancels the turn without reading sources or saving an answer', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const harness = makeHarness();
  harness.dependencies.documents.pause = () => {
    harness.controller.abort();
    return Promise.resolve();
  };
  harness.dependencies.documents.load = () => {
    harness.controller.signal.throwIfAborted();
    assert.fail('No further polling after cancellation');
  };
  await assert.rejects(runQueryPipeline(turn, harness.stream, harness.dependencies), {
    name: 'AbortError',
  });
  assert.equal(harness.calls.saved, 0);
});

void test('a general topic switch does not wait for historical processing documents', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const harness = makeHarness('general');
  harness.dependencies.documents.load = () => assert.fail('General turns do not poll files');
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.saved, 1);
  assert.equal(harness.calls.retrieved, 0);
});

void test('a document wait deadline fails before polling or generating an answer', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const harness = makeHarness();
  harness.dependencies.documents.timeoutMs = 0;
  await assert.rejects(
    runQueryPipeline(turn, harness.stream, harness.dependencies),
    /longer than expected/u,
  );
  assert.equal(harness.calls.saved, 0);
});

void test('one failed document ends the wait even while another document is processing', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  addDocument(turn, 'processing');
  const first = turn.documents[0];
  assert.ok(first);
  first.id = 'first';
  const harness = makeHarness();
  let polls = 0;
  harness.dependencies.documents.load = () => {
    polls += 1;
    return Promise.resolve(
      turn.documents.map((row) => ({
        ...row,
        status: row.id === 'first' ? 'failed' : 'processing',
      })),
    );
  };
  await assert.rejects(
    runQueryPipeline(turn, harness.stream, harness.dependencies),
    /could not be processed/u,
  );
  assert.equal(polls, 1);
  assert.equal(harness.calls.saved, 0);
});
