import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { createChatStore } from '@/lib/chats/store';

import {
  chat,
  citation,
  deferred,
  document,
  jsonResponse,
  mockFetch,
  requestJson,
  savedUser,
  sseFrame,
  sseResponse,
  waitForIdle,
} from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

void test('streaming replaces provisional IDs, shows sources before tokens, and finalizes citations', async () => {
  const store = createChatStore();
  store.setState({ chats: [chat] });
  store.getState().setDocument(document);
  const snapshots: { content: string | null; citations: number }[] = [];
  const unsubscribe = store.subscribe((state) => {
    const answer = state.messagesByChatId[chat.id]?.at(-1);
    if (answer) snapshots.push({ content: answer.content, citations: answer.citations.length });
  });
  mockFetch(() =>
    sseResponse(
      sseFrame('meta', { userMessageId: 'user-1', processingDocumentIds: [document.id] }) +
        sseFrame('sources', [citation]) +
        sseFrame('token', { text: 'Revenue ' }) +
        sseFrame('token', { text: 'grew [1].' }) +
        sseFrame('done', { assistantMessageId: 'assistant-1', citations: [citation] }),
    ),
  );
  store.getState().sendMessage(chat.id, { content: 'Explain', documentIds: [document.id] });
  const optimistic = store.getState().messagesByChatId[chat.id];
  await waitForIdle(store);
  unsubscribe();
  const messages = store.getState().messagesByChatId[chat.id];
  assert.equal(messages?.[0]?.id, 'user-1');
  assert.equal(messages[1]?.id, 'assistant-1');
  assert.equal(messages[1].content, 'Revenue grew [1].');
  assert.deepEqual(messages[1].citations, [citation]);
  assert.equal(messages[1].status, undefined);
  assert.equal(messages[0].clientId, optimistic?.[0]?.clientId);
  assert.equal(messages[1].clientId, optimistic?.[1]?.clientId);
  assert.ok(snapshots.some((snapshot) => snapshot.content === '' && snapshot.citations === 1));
  assert.equal(store.getState().documentsById[document.id]?.status, 'processing');
});

void test('large token bursts update only the active message and flush their tail on completion', async () => {
  const store = createChatStore();
  store.setState({ messagesByChatId: { [chat.id]: [savedUser] } });
  const oldMessage = store.getState().messagesByChatId[chat.id]?.[0];
  let updates = 0;
  store.subscribe(() => {
    updates += 1;
  });
  mockFetch(() =>
    sseResponse(
      sseFrame('meta', { userMessageId: 'new-user', processingDocumentIds: [] }) +
        Array.from({ length: 100 }, () => sseFrame('token', { text: 'word ' })).join('') +
        sseFrame('done', { assistantMessageId: 'answer', citations: [] }),
    ),
  );
  store.getState().sendMessage(chat.id, { content: 'Explain', documentIds: [] });
  await waitForIdle(store);
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.content, 'word '.repeat(100));
  assert.equal(store.getState().messagesByChatId[chat.id]?.[0], oldMessage);
  assert.ok(updates < 10, `Expected batched updates, received ${String(updates)}`);
});

void test('disconnecting before a scheduled render preserves all pending text', async () => {
  const store = createChatStore();
  mockFetch(() =>
    sseResponse(sseFrame('token', { text: 'Head ' }) + sseFrame('token', { text: 'and tail' })),
  );
  store.getState().sendMessage(chat.id, { content: 'Explain', documentIds: [] });
  await waitForIdle(store);
  const answer = store.getState().messagesByChatId[chat.id]?.at(-1);
  assert.equal(answer?.status, 'error');
  assert.equal(answer.content, 'Head and tail');
});

void test('a dropped stream keeps partial text; retry first reconciles saved history and attachments', async () => {
  const store = createChatStore();
  store.setState({ chats: [chat] });
  let streams = 0;
  const calls: string[] = [];
  mockFetch((url, init) => {
    calls.push(init?.method ?? 'GET');
    if (!init?.method) return jsonResponse({ chat, messages: [savedUser], documents: [document] });
    streams += 1;
    assert.deepEqual(requestJson(init), {
      content: 'Why did it grow?',
      documentIds: [document.id],
    });
    return streams === 1
      ? sseResponse(
          sseFrame('meta', { userMessageId: savedUser.id, processingDocumentIds: [] }) +
            sseFrame('token', { text: 'Partial' }),
        )
      : sseResponse(
          sseFrame('meta', { userMessageId: 'retry-user', processingDocumentIds: [] }) +
            sseFrame('token', { text: 'Complete' }) +
            sseFrame('done', { assistantMessageId: 'retry-answer', citations: [] }),
        );
  });
  store
    .getState()
    .sendMessage(chat.id, { content: 'Why did it grow?', documentIds: [document.id] });
  await waitForIdle(store);
  const partial = store.getState().messagesByChatId[chat.id]?.at(-1);
  assert.equal(partial?.content, 'Partial');
  assert.equal(partial.status, 'error');
  assert.match(partial.error ?? '', /Connection lost/);
  await store.getState().retryMessage(chat.id, partial.id);
  await waitForIdle(store);
  assert.deepEqual(calls, ['POST', 'GET', 'POST']);
  assert.deepEqual(
    store.getState().messagesByChatId[chat.id]?.map((message) => message.id),
    [savedUser.id, 'retry-user', 'retry-answer'],
  );
});

void test('attachment-only messages are sent and overlapping sends are ignored', async () => {
  const store = createChatStore();
  const response = deferred<Response>();
  const fetch = mockFetch(() => response.promise);
  store.getState().sendMessage(chat.id, { content: '', documentIds: [document.id] });
  store.getState().sendMessage(chat.id, { content: 'overlap', documentIds: [] });
  assert.equal(fetch.mock.callCount(), 1);
  response.resolve(sseResponse(sseFrame('done', { assistantMessageId: 'answer', citations: [] })));
  await waitForIdle(store);
  assert.equal(store.getState().messagesByChatId[chat.id]?.[0]?.content, '');
  assert.deepEqual(store.getState().messagesByChatId[chat.id]?.[0]?.documentIds, [document.id]);
});

void test('a stale thread request cannot overwrite a stream that started afterward', async () => {
  const store = createChatStore();
  const oldThread = deferred<Response>();
  const answer = deferred<Response>();
  mockFetch((url, init) => (init?.method === 'POST' ? answer.promise : oldThread.promise));
  const loading = store.getState().loadThread(chat.id);
  store.getState().sendMessage(chat.id, { content: 'Hello', documentIds: [] });
  oldThread.resolve(jsonResponse({ chat, messages: [], documents: [] }));
  await loading;
  assert.equal(store.getState().messagesByChatId[chat.id]?.length, 2);
  answer.resolve(sseResponse(sseFrame('done', { assistantMessageId: 'answer', citations: [] })));
  await waitForIdle(store);
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.id, 'answer');
});
