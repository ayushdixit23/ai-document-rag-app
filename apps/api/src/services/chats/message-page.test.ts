import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drizzle } from 'drizzle-orm/postgres-js';

import { messagePageSchema } from '../../core/validation/schemas/message-page.schema.js';
import { messagePage, messagePageQuery } from './message-page.js';

void test('a page returns at most 15 messages in chronological order and an older cursor', () => {
  const rows = Array.from({ length: 16 }, (_, index) => ({ id: String(31 - index) }));
  const page = messagePage(rows);
  assert.equal(page.messages.length, 15);
  assert.equal(page.messages[0]?.id, '17');
  assert.equal(page.messages.at(-1)?.id, '31');
  assert.deepEqual(page.pageInfo, { hasMore: true, nextCursor: '17' });
  assert.deepEqual(messagePage(rows.slice(0, 15)).pageInfo, { hasMore: false, nextCursor: null });
  assert.deepEqual(messagePage([]), {
    messages: [],
    pageInfo: { hasMore: false, nextCursor: null },
  });
});

void test('cursor queries retain SQL timestamp precision, scope to the chat, and bound the read', () => {
  const query = messagePageQuery(drizzle.mock(), 'owned-chat', 'cursor-message').toSQL();
  assert.match(query.sql, /\("message"\."created_at", "message"\."id"\) </u);
  assert.match(query.sql, /cursor\.chat_id =/u);
  assert.match(query.sql, /order by "message"\."created_at" desc, "message"\."id" desc/u);
  assert.deepEqual(query.params, ['owned-chat', 'cursor-message', 'owned-chat', 16]);
});

void test('pagination accepts only a valid cursor ID', () => {
  assert.equal(messagePageSchema.safeParse({}).success, true);
  assert.equal(messagePageSchema.safeParse({ before: 'not-an-id' }).success, false);
  assert.equal(
    messagePageSchema.safeParse({ before: '10000000-0000-4000-8000-000000000001' }).success,
    true,
  );
});
