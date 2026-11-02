import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../../../db/schema/index.js';
import { makeSummaryHarness } from './summary.fixtures.js';
import { summaryUpdate } from './summary.repository.js';

void test('summary writes preserve SQL precision and compare only the stable cursor ID', () => {
  const database = drizzle.mock({ schema });
  const started = {
    ...makeSummaryHarness().current,
    summarizedUntil: new Date('2026-11-02T12:00:00.123Z'),
    summarizedUntilMessageId: 'first-cursor',
  };
  const query = summaryUpdate(database, {
    started,
    cursorId: 'second-cursor',
    summary: 'Next summary',
  }).toSQL();
  assert.match(query.sql, /"summarized_until" = \(select "message"\."created_at"/u);
  assert.match(query.sql, /"summarized_until_message_id" is not distinct from/u);
  assert.doesNotMatch(query.sql, /"summarized_until" is not distinct from/u);
  assert.match(query.sql, /returning "id"/u);
  assert.match(query.sql, /"updated_at" = "chat"\."updated_at"/u);
  assert.ok(query.params.includes('first-cursor'));
  assert.ok(query.params.includes('second-cursor'));
  assert.ok(query.params.every((value) => !(value instanceof Date)));
});
