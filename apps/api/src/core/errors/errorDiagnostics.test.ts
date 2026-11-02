import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DrizzleQueryError } from 'drizzle-orm';

import { errorDiagnostics } from './errorDiagnostics.js';
import { normalizeError } from './errorHandler.js';

void test('database diagnostics retain the PostgreSQL cause without SQL or bound values', () => {
  const cause = Object.assign(new Error('column "summarized_until_message_id" does not exist'), {
    code: '42703',
    query: 'select secret from chat',
    parameters: ['private-user-id'],
  });
  const error = new DrizzleQueryError('select secret from chat', ['private-user-id'], cause);
  const diagnostics = errorDiagnostics(error);
  assert.equal(diagnostics[1]?.code, '42703');
  assert.match(diagnostics[1].message, /summarized_until_message_id/);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-user-id|select secret/);
  const normalized = normalizeError(error);
  assert.equal(normalized.statusCode, 500);
  assert.doesNotMatch(normalized.message, /summarized_until_message_id|42703/);
});

void test('diagnostics handle circular causes and non-error values', () => {
  const error = new Error('Original failure');
  error.cause = error;
  assert.equal(errorDiagnostics(error).length, 1);
  assert.deepEqual(errorDiagnostics(null), []);
});
