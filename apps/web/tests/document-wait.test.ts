import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TypingIndicator } from '@/components/chats/typing-indicator';
import { createChatStore } from '@/lib/chats/store';

import { chat, document, mockFetch, sseFrame, waitForIdle } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

void test('document reading stays visible and the original turn resumes when indexing finishes', async () => {
  const store = createChatStore();
  store.setState({
    chats: [chat],
    documentsById: { [document.id]: { ...document, status: 'processing' } },
  });
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encode = (event: string, data: unknown) => new TextEncoder().encode(sseFrame(event, data));
  mockFetch(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  store
    .getState()
    .sendMessage(chat.id, { content: 'Explain these files', documentIds: [document.id] });
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.phase, 'reading_documents');
  assert.ok(controller);
  controller.enqueue(
    encode('meta', { userMessageId: 'user', processingDocumentIds: [document.id] }),
  );
  controller.enqueue(encode('status', { phase: 'reading_documents', documentIds: [document.id] }));
  await setImmediate();
  assert.equal(store.getState().generatingChatId, chat.id);
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.content, '');
  const readyVersion = '2026-11-03T10:00:00.000Z';
  controller.enqueue(
    encode('status', {
      phase: 'answering',
      documentIds: [document.id],
      documentVersions: [{ id: document.id, updatedAt: readyVersion }],
    }),
  );
  controller.enqueue(encode('sources', []));
  controller.enqueue(encode('token', { text: 'The indexed document says…' }));
  controller.enqueue(encode('done', { assistantMessageId: 'answer', citations: [] }));
  await waitForIdle(store);
  assert.equal(store.getState().documentsById[document.id]?.status, 'ready');
  store.getState().setDocument({
    ...document,
    status: 'processing',
    updatedAt: '2026-11-03T09:59:59.000Z',
  });
  assert.equal(store.getState().documentsById[document.id]?.status, 'ready');
  assert.equal(store.getState().documentsById[document.id]?.updatedAt, readyVersion);
  store.getState().setDocument({
    ...document,
    status: 'pending',
    updatedAt: '2026-11-03T10:00:01.000Z',
  });
  assert.equal(store.getState().documentsById[document.id]?.status, 'pending');
  assert.equal(store.getState().messagesByChatId[chat.id]?.length, 2);
  assert.equal(
    store.getState().messagesByChatId[chat.id]?.at(-1)?.content,
    'The indexed document says…',
  );
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.phase, undefined);
  store.getState().reset();
});

void test('stopping document reading cancels the stream and clears the loading phase', async () => {
  const store = createChatStore();
  store.setState({ documentsById: { [document.id]: { ...document, status: 'processing' } } });
  mockFetch(
    () => new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } }),
  );
  store.getState().sendMessage(chat.id, { content: 'Explain', documentIds: [document.id] });
  await setImmediate();
  store.getState().stopGenerating(chat.id);
  await waitForIdle(store);
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.status, 'stopped');
  assert.equal(store.getState().messagesByChatId[chat.id]?.at(-1)?.phase, undefined);
  store.getState().reset();
});

void test('the reading indicator exposes its visible label through a status region', () => {
  const html = renderToStaticMarkup(createElement(TypingIndicator, { readingDocuments: true }));
  assert.match(html, /Preparing documents…/u);
  assert.match(html, /role="status"/u);
  assert.match(html, /document-shimmer/u);
  assert.doesNotMatch(html, /animate-pulse/u);
});

void test('answer loading restores the three dots after document preparation', () => {
  const html = renderToStaticMarkup(createElement(TypingIndicator, { readingDocuments: false }));
  assert.match(html, /Thinking of an answer/u);
  assert.equal(html.match(/animate-pulse/gu)?.length, 3);
  assert.doesNotMatch(html, /document-shimmer|Preparing documents/u);
});
