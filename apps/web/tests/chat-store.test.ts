import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { createChatStore } from '@/lib/chats/store';

import { chat, deferred, document, jsonResponse, mockFetch, savedUser } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

void test('list, create, rename and delete use the API; failed mutations preserve cached data', async () => {
  const store = createChatStore();
  let failDelete = true;
  mockFetch((url, init) => {
    switch (init?.method) {
      case 'POST':
        return jsonResponse({ chat });
      case 'PATCH':
        return jsonResponse({ chat: { ...chat, title: 'Renamed' } });
      case 'DELETE':
        return failDelete
          ? Response.json({ success: false, message: 'Delete failed' }, { status: 500 })
          : jsonResponse({});
      default:
        assert.equal(url, '/api/chats');
        return jsonResponse({ chats: [] });
    }
  });
  await store.getState().loadChats();
  assert.equal(store.getState().chatList.status, 'ready');
  assert.equal(await store.getState().createChat(), chat.id);
  await store.getState().renameChat(chat.id, 'Renamed');
  assert.equal(store.getState().chats[0]?.title, 'Renamed');
  await assert.rejects(store.getState().deleteChat(chat.id), /Delete failed/);
  assert.equal(store.getState().chats.length, 1);
  failDelete = false;
  await store.getState().deleteChat(chat.id);
  assert.deepEqual(store.getState().chats, []);
});

void test('concurrent sidebar loads deduplicate; a stale list cannot undo a newly created chat', async () => {
  const store = createChatStore();
  const first = deferred<Response>();
  let lists = 0;
  mockFetch((url, init) => {
    if (init?.method === 'POST') return jsonResponse({ chat });
    lists += 1;
    return lists === 1 ? first.promise : jsonResponse({ chats: [chat] });
  });
  const load = store.getState().loadChats();
  assert.equal(store.getState().loadChats(), load);
  await store.getState().createChat();
  first.resolve(jsonResponse({ chats: [] }));
  await load;
  assert.equal(lists, 2);
  assert.deepEqual(
    store.getState().chats.map((item) => item.id),
    [chat.id],
  );
});

void test('thread fetch retains full history, attachments and document statuses', async () => {
  const store = createChatStore();
  const messages = Array.from({ length: 240 }, (_, index) => ({ ...savedUser, id: String(index) }));
  mockFetch(() => jsonResponse({ chat, messages, documents: [document] }));
  await store.getState().loadThread(chat.id);
  assert.equal(store.getState().messagesByChatId[chat.id]?.length, 240);
  assert.deepEqual(store.getState().messagesByChatId[chat.id]?.[0]?.documentIds, [document.id]);
  assert.equal(store.getState().documentsById[document.id]?.status, 'pending');
});

void test('an unavailable chat reports not-found; transient reload errors retain the cached thread', async () => {
  const store = createChatStore();
  let status = 404;
  mockFetch(() => Response.json({ success: false, message: 'Unavailable' }, { status }));
  await store.getState().loadThread(chat.id);
  assert.equal(store.getState().threads[chat.id]?.notFound, true);
  store.setState({ messagesByChatId: { [chat.id]: [savedUser] } });
  status = 503;
  await store.getState().loadThread(chat.id);
  assert.equal(store.getState().threads[chat.id]?.notFound, false);
  assert.deepEqual(store.getState().messagesByChatId[chat.id], [savedUser]);
});

void test('reset aborts requests and prevents a late response from repopulating another session', async () => {
  const store = createChatStore();
  const response = deferred<Response>();
  let signal: AbortSignal | null | undefined;
  mockFetch((url, init) => {
    signal = init?.signal;
    return response.promise;
  });
  const loading = store.getState().loadChats();
  store.getState().reset();
  response.resolve(jsonResponse({ chats: [chat] }));
  await loading;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(store.getState().chats, []);
  assert.equal(store.getState().chatList.status, 'idle');
  assert.deepEqual(createChatStore().getState().chats, []);
});

void test('deleting a document removes its cached message links and citations', () => {
  const store = createChatStore();
  store.getState().setDocument(document);
  store.setState({ messagesByChatId: { [chat.id]: [savedUser] } });
  store.getState().removeDocument(document.id);
  assert.equal(store.getState().documentsById[document.id], undefined);
  assert.deepEqual(store.getState().messagesByChatId[chat.id]?.[0]?.documentIds, []);
});
