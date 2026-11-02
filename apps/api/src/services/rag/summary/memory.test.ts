import assert from 'node:assert/strict';
import { test } from 'node:test';

import { estimateTokens, recentHistory } from '../history.js';
import { messagesToFold } from './fold.js';
import { makeSummaryHarness } from './summary.fixtures.js';
import { runSummaryPipeline } from './summary-pipeline.js';

void test('history retains the unsummarized tail while background memory is pending', async () => {
  const h = makeSummaryHarness();
  h.append(8);
  const history = await recentHistory(h.messages);
  assert.equal(history.length, 8);
  assert.ok(history.reduce((sum, item) => sum + estimateTokens(item.text), 0) > 4_000);
});

void test('a fold cannot separate a retained assistant answer from its user question', () => {
  const h = makeSummaryHarness();
  h.append(8);
  const folded = messagesToFold(h.messages, 1_000, 2_000);
  assert.equal(folded.at(-1)?.role, 'assistant');
  assert.equal(h.messages[folded.length]?.role, 'user');
});

void test('upload-only turns preserve file names in history and summary generation input', async () => {
  const h = makeSummaryHarness();
  h.append(8);
  const first = h.messages[0];
  assert.ok(first);
  first.content = '';
  first.documentNames = ['annual-report.pdf', 'sales.csv'];
  const history = await recentHistory([first]);
  assert.match(history[0]?.text ?? '', /annual-report\.pdf/u);
  await runSummaryPipeline('chat', h.dependencies);
  assert.deepEqual(h.inputs[0]?.messages[0]?.documentNames, first.documentNames);
  assert.equal(h.events.at(-1)?.outcome, 'wrote');
});
