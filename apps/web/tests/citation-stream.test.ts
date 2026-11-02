import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageItem } from '@/components/chats/message-item';
import { createChatStore } from '@/lib/chats/store';

import { chat, citation, mockFetch, sseFrame, waitForIdle } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

void test('retrieval candidates never flash as citations; only referenced inline and confirmed sources render', async () => {
  const store = createChatStore();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
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
  store.getState().sendMessage(chat.id, { content: 'Explain', documentIds: [] });
  assert.ok(controller);
  const send = (event: string, data: unknown) =>
    controller?.enqueue(new TextEncoder().encode(sseFrame(event, data)));
  const answer = () => {
    const message = store.getState().messagesByChatId[chat.id]?.at(-1);
    assert.ok(message);
    return message;
  };
  send('sources', [citation, { ...citation, n: 2, title: 'Unused.pdf' }]);
  await setImmediate();
  assert.equal(answer().sourceCandidates?.length, 2);
  assert.deepEqual(answer().citations, []);
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(MessageItem, { message: answer() })),
    /aria-label="Citations"|Unused\.pdf/u,
  );
  send('token', { text: 'Revenue rose [1].' });
  await setImmediate();
  const streaming = renderToStaticMarkup(createElement(MessageItem, { message: answer() }));
  assert.match(streaming, /aria-label="Source 1:/u);
  assert.doesNotMatch(streaming, /aria-label="Citations"|Unused\.pdf/u);
  send('done', { assistantMessageId: 'answer', citations: [citation] });
  await waitForIdle(store);
  assert.equal(answer().sourceCandidates, undefined);
  const completed = renderToStaticMarkup(createElement(MessageItem, { message: answer() }));
  assert.match(completed, /aria-label="Citations"/u);
  assert.doesNotMatch(completed, /Unused\.pdf|Sources found/u);
  store.getState().reset();
});
