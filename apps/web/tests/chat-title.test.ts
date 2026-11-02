import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { createChatStore } from '@/lib/chats/store';

import {
  chat,
  deferred,
  jsonResponse,
  mockFetch,
  sseFrame,
  sseResponse,
  waitForIdle,
} from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

const answer = () =>
  sseResponse(
    sseFrame('meta', { userMessageId: 'user', processingDocumentIds: [] }) +
      sseFrame('token', { text: 'Complete answer' }) +
      sseFrame('done', { assistantMessageId: 'answer', citations: [] }),
  );

void test('a pending title request cannot block tokens, persistence completion, or the next turn', async () => {
  const store = createChatStore();
  store.setState({ chats: [{ ...chat, title: 'New chat', titlePending: true }] });
  const title = deferred<Response>();
  let titleCalls = 0;
  mockFetch((url) => {
    if (url.endsWith('/title')) {
      titleCalls += 1;
      return title.promise;
    }
    return answer();
  });
  store.getState().sendMessage(chat.id, { content: 'Explain revenue', documentIds: [] });
  await waitForIdle(store);
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.content, 'Complete answer');
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.status, undefined);
  store.getState().sendMessage(chat.id, { content: 'Continue', documentIds: [] });
  await waitForIdle(store);
  assert.equal(titleCalls, 1);
  title.resolve(
    jsonResponse({ chat: { ...chat, title: 'Revenue analysis', titlePending: false } }),
  );
  await setImmediate();
  assert.equal(store.getState().chats[0]?.title, 'Revenue analysis');
  store.getState().reset();
});

void test('a delayed generated title cannot overwrite a manual rename', async () => {
  const store = createChatStore();
  store.setState({ chats: [{ ...chat, titlePending: true }] });
  const title = deferred<Response>();
  mockFetch((url, init) => {
    if (url.endsWith('/title')) return title.promise;
    if (init?.method === 'PATCH')
      return jsonResponse({ chat: { ...chat, title: 'My title', titlePending: false } });
    return answer();
  });
  store.getState().sendMessage(chat.id, { content: 'Explain revenue', documentIds: [] });
  await waitForIdle(store);
  await store.getState().renameChat(chat.id, 'My title');
  title.resolve(jsonResponse({ chat: { ...chat, title: 'Generated title', titlePending: false } }));
  await setImmediate();
  assert.equal(store.getState().chats[0]?.title, 'My title');
  store.getState().reset();
});

void test('title service failures leave a completed answer usable', async () => {
  const store = createChatStore();
  store.setState({ chats: [{ ...chat, titlePending: true }] });
  mockFetch((url) =>
    url.endsWith('/title')
      ? Response.json({ success: false, message: 'Unavailable' }, { status: 503 })
      : answer(),
  );
  store.getState().sendMessage(chat.id, { content: 'Explain revenue', documentIds: [] });
  await waitForIdle(store);
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.status, undefined);
  assert.equal(store.getState().chats[0]?.titlePending, true);
  store.getState().reset();
});
