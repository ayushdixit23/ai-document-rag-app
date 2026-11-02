import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeSummaryHarness } from './summary.fixtures.js';
import { runSummaryPipeline } from './summary-pipeline.js';

void test('three consecutive folds persist newer cursors and include the previous summary', async () => {
  const h = makeSummaryHarness();
  h.append(8);
  await runSummaryPipeline('chat', h.dependencies);
  assert.equal(h.current.summarizedUntilMessageId, '003');
  assert.equal(h.inputs[0]?.previousSummary, null);
  // The retained tail alone stays below the trigger and must not call the model again.
  await runSummaryPipeline('chat', h.dependencies);
  assert.equal(h.inputs.length, 1);
  for (const expected of ['007', '011']) {
    h.append(4);
    const previous = h.current.summary;
    await runSummaryPipeline('chat', h.dependencies);
    assert.equal(h.current.summarizedUntilMessageId, expected);
    assert.equal(h.inputs.at(-1)?.previousSummary, previous);
    assert.equal(h.inputs.at(-1)?.messages.length, 4);
  }
  assert.equal(h.events.filter((event) => event.outcome === 'wrote').length, 3);
  assert.ok(h.events.some((event) => event.reason === 'nothing-to-fold'));
});

void test('a rejected write fails the job; a retry reloads state instead of silently succeeding', async () => {
  const h = makeSummaryHarness();
  h.append(8);
  const save = h.dependencies.save;
  h.dependencies.save = () => Promise.resolve(false);
  await assert.rejects(runSummaryPipeline('chat', h.dependencies), /cursor changed/u);
  assert.equal(h.current.summary, null);
  assert.equal(h.events.at(-1)?.outcome, 'conflict');
  h.dependencies.save = save;
  await runSummaryPipeline('chat', h.dependencies);
  assert.equal(h.current.summarizedUntilMessageId, '003');
  assert.equal(h.events.at(-1)?.outcome, 'wrote');
});

void test('missing chats, model failures and empty summaries never report a successful write', async () => {
  const h = makeSummaryHarness();
  const loadChat = h.dependencies.loadChat;
  h.dependencies.loadChat = () => Promise.resolve(undefined);
  await runSummaryPipeline('chat', h.dependencies);
  assert.equal(h.events.at(-1)?.reason, 'chat-missing');
  h.dependencies.loadChat = loadChat;
  h.append(8);
  h.dependencies.generate = () => Promise.resolve('  ');
  await assert.rejects(runSummaryPipeline('chat', h.dependencies), /no text/u);
  h.dependencies.generate = () => Promise.reject(new Error('model unavailable'));
  await assert.rejects(runSummaryPipeline('chat', h.dependencies), /model unavailable/u);
  assert.equal(h.current.summary, null);
  assert.equal(h.events.filter((event) => event.outcome === 'wrote').length, 0);
});
