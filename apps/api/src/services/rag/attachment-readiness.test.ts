import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDocument, makeHarness, makeTurn } from './query-pipeline.fixtures.js';
import { runQueryPipeline } from './query-pipeline.js';

void test('new attachments finish indexing before any answer even when the router returns general', async () => {
  const turn = makeTurn();
  addDocument(turn, 'pending');
  turn.input.documentIds = ['doc'];
  const harness = makeHarness('general');
  let polls = 0;
  harness.dependencies.documents.load = () => {
    polls += 1;
    assert.equal(harness.calls.saved, 0);
    assert.equal(
      harness.events.some((row) => row.event === 'token'),
      false,
    );
    return Promise.resolve(
      turn.documents.map((row) => ({ ...row, status: polls === 1 ? 'processing' : 'ready' })),
    );
  };
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(polls, 2);
  assert.equal(harness.calls.retrieved, 0);
  assert.equal(harness.calls.saved, 1);
  assert.deepEqual(
    harness.events.map((row) => row.event),
    ['meta', 'status', 'status', 'sources', 'token', 'done'],
  );
});

void test('failed, missing, and unfinished uploads block the new-attachment turn before generation', async () => {
  for (const state of ['failed', 'missing', 'uploading'] as const) {
    const turn = makeTurn();
    turn.input.documentIds = ['doc'];
    if (state !== 'missing') addDocument(turn, state);
    const harness = makeHarness('general');
    harness.dependencies.streamAnswer = () => assert.fail('No answer model call before readiness');
    await assert.rejects(runQueryPipeline(turn, harness.stream, harness.dependencies));
    assert.equal(harness.calls.saved, 0);
  }
});

void test('an already indexed new attachment announces its ready version before answer text', async () => {
  const turn = makeTurn();
  addDocument(turn, 'ready');
  turn.input.documentIds = ['doc'];
  const harness = makeHarness('general');
  harness.dependencies.documents.load = () => assert.fail('Ready files need no polling');
  const original = harness.dependencies.streamAnswer;
  harness.dependencies.streamAnswer = (messages, signal) => {
    assert.deepEqual(harness.events.find((row) => row.event === 'status')?.data, {
      phase: 'answering',
      documentIds: ['doc'],
      documentVersions: [{ id: 'doc', updatedAt: new Date(0).toISOString() }],
    });
    return original(messages, signal);
  };
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.saved, 1);
});

void test('a general turn waits only for its new attachment, not an older processing file', async () => {
  const turn = makeTurn();
  addDocument(turn, 'processing');
  const older = turn.documents[0];
  assert.ok(older);
  older.id = 'older';
  addDocument(turn, 'pending');
  turn.input.documentIds = ['doc'];
  const harness = makeHarness('general');
  harness.dependencies.documents.load = (_owner, ids) => {
    assert.deepEqual(ids, ['doc']);
    return Promise.resolve(
      turn.documents.filter((row) => row.id === 'doc').map((row) => ({ ...row, status: 'ready' })),
    );
  };
  await runQueryPipeline(turn, harness.stream, harness.dependencies);
  assert.equal(harness.calls.saved, 1);
});
