import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

import { createChatStore } from '@/lib/chats/store';
import type { ChatStoreApi } from '@/lib/chats/store-types';

import { chat, deferred, mockFetch, sseFrame, waitForIdle } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

function beginOpenStream(store: ChatStoreApi) {
  const received = deferred<boolean>();
  let signal: AbortSignal | null | undefined;
  let cancelled = false;
  const unsubscribe = store.subscribe((state) => {
    if (state.messagesByChatId[chat.id]?.at(-1)?.content !== 'Head ') return;
    queueMicrotask(() => {
      received.resolve(true);
    });
  });
  mockFetch((url, init) => {
    signal = init?.signal;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              sseFrame('token', { text: 'Head ' }) + sseFrame('token', { text: 'and tail' }),
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  });
  store.getState().sendMessage(chat.id, { content: 'Explain', documentIds: [] });
  return {
    received: received.promise,
    unsubscribe,
    aborted: () => signal?.aborted,
    cancelled: () => cancelled,
  };
}

void test('stopping an answer aborts the connection, preserves buffered text, and unlocks the composer', async () => {
  const store = createChatStore();
  const stream = beginOpenStream(store);
  await stream.received;
  store.getState().stopGenerating('another-chat');
  assert.equal(store.getState().generatingChatId, chat.id);
  store.getState().stopGenerating(chat.id);
  await waitForIdle(store);
  stream.unsubscribe();
  const answer = store.getState().messagesByChatId[chat.id]?.at(-1);
  assert.equal(answer?.status, 'stopped');
  assert.equal(answer.content, 'Head and tail');
  assert.equal(stream.aborted(), true);
  assert.equal(stream.cancelled(), true);
  assert.equal(store.getState().generatingChatId, null);
});

void test('session disposal cancels buffered updates without restoring the old transcript', async () => {
  const store = createChatStore();
  const stream = beginOpenStream(store);
  await stream.received;
  store.getState().reset();
  await setTimeout(50);
  stream.unsubscribe();
  assert.equal(stream.aborted(), true);
  assert.equal(stream.cancelled(), true);
  assert.deepEqual(store.getState().messagesByChatId, {});
  assert.equal(store.getState().generatingChatId, null);
});
