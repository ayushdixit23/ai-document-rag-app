import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { captureScrollAnchor } from '@/lib/chats/scroll-anchor';
import { createChatStore } from '@/lib/chats/store';

import { chat, deferred, jsonResponse, mockFetch, savedUser } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});
const messages = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({ ...savedUser, id: String(from + index) }));
const page = (from: number, count: number, hasMore: boolean) => ({
  chat,
  messages: messages(from, count),
  documents: [],
  pageInfo: { hasMore, nextCursor: hasMore ? String(from) : null },
});

void test('history fetches 15 at a time, deduplicates page requests, and prepends without gaps', async () => {
  const store = createChatStore();
  const older = deferred<Response>();
  const urls: string[] = [];
  mockFetch((url) => {
    urls.push(url);
    if (url.endsWith('?before=20')) return older.promise;
    return jsonResponse(url.includes('?before=5') ? page(0, 5, false) : page(20, 15, true));
  });
  await store.getState().loadThread(chat.id);
  assert.equal(store.getState().messagesByChatId[chat.id]?.length, 15);
  const request = store.getState().loadOlderMessages(chat.id);
  assert.equal(request, store.getState().loadOlderMessages(chat.id));
  older.resolve(jsonResponse(page(5, 15, true)));
  await request;
  await store.getState().loadOlderMessages(chat.id);
  assert.deepEqual(
    store.getState().messagesByChatId[chat.id]?.map((row) => row.id),
    messages(0, 35).map((row) => row.id),
  );
  assert.equal(store.getState().paginationByChatId[chat.id]?.hasMore, false);
  await store.getState().loadOlderMessages(chat.id);
  assert.equal(urls.length, 3);
  assert.ok(urls[1]?.endsWith('?before=20'));
  assert.ok(urls[2]?.endsWith('?before=5'));
});

void test('an older page merges with current state without overwriting streamed text or duplicate IDs', async () => {
  const store = createChatStore();
  const response = deferred<Response>();
  mockFetch((url) =>
    url.includes('?before=') ? response.promise : jsonResponse(page(15, 15, true)),
  );
  await store.getState().loadThread(chat.id);
  const request = store.getState().loadOlderMessages(chat.id);
  store.setState({
    messagesByChatId: {
      [chat.id]: messages(15, 15).map((row) => ({ ...row, content: 'New stream text' })),
    },
  });
  response.resolve(
    jsonResponse({ ...page(0, 1, false), messages: [messages(0, 1)[0], ...messages(15, 1)] }),
  );
  await request;
  const loaded = store.getState().messagesByChatId[chat.id] ?? [];
  assert.equal(loaded.length, 16);
  assert.equal(loaded.find((row) => row.id === '15')?.content, 'New stream text');
  assert.equal(new Set(loaded.map((row) => row.id)).size, 16);
});

void test('page failures preserve history and allow retry; session reset rejects late pages', async () => {
  const store = createChatStore();
  const late = deferred<Response>();
  let attempts = 0;
  mockFetch((url) => {
    if (!url.includes('?before=')) return jsonResponse(page(15, 15, true));
    attempts += 1;
    return attempts === 1
      ? Response.json({ success: false, message: 'Unavailable' }, { status: 503 })
      : late.promise;
  });
  await store.getState().loadThread(chat.id);
  await store.getState().loadOlderMessages(chat.id);
  assert.equal(store.getState().messagesByChatId[chat.id]?.length, 15);
  assert.equal(store.getState().paginationByChatId[chat.id]?.loading, false);
  assert.match(store.getState().paginationByChatId[chat.id]?.error ?? '', /Unavailable/u);
  const request = store.getState().loadOlderMessages(chat.id);
  store.getState().reset();
  late.resolve(jsonResponse(page(0, 15, false)));
  await request;
  assert.deepEqual(store.getState().messagesByChatId, {});
  assert.deepEqual(store.getState().paginationByChatId, {});
});

void test('scroll anchoring offsets prepended history while ignoring content growth below it', () => {
  const scroller = { scrollTop: 70 };
  let top = 20;
  const anchor = { isConnected: true, getBoundingClientRect: () => ({ top }) };
  const restore = captureScrollAnchor(scroller, anchor);
  top += 500;
  restore();
  assert.equal(scroller.scrollTop, 570);
  const removed = captureScrollAnchor(scroller, anchor);
  anchor.isConnected = false;
  top += 100;
  removed();
  assert.equal(scroller.scrollTop, 570);
});
