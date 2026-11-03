import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sendMessageSchema } from './chats.schema.js';

void test('messages accept 8,000 characters and reject longer content', () => {
  assert.equal(sendMessageSchema.safeParse({ content: 'a'.repeat(8_000) }).success, true);
  assert.equal(sendMessageSchema.safeParse({ content: 'a'.repeat(8_001) }).success, false);
});
