import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { ApiError } from '@/lib/api';
import { createSseParser, readSse, type SseFrame } from '@/lib/chats/sse-parser';
import { streamMessage } from '@/lib/chats/stream';
import type { StreamEvent } from '@/lib/chats/stream-events';
import { parseStreamEvent } from '@/lib/chats/stream-events';

import { chat, citation, mockFetch, requestJson, sseFrame, sseResponse } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

void test('SSE parses comments, multiline data, LF/CRLF/CR across every split', () => {
  const input =
    ': heartbeat\r\nevent: token\r\ndata: first\r\ndata: second\r\n\r\nevent: done\rdata: {}\r\r';
  for (let split = 1; split < input.length; split += 1) {
    const frames: SseFrame[] = [];
    const parser = createSseParser((frame) => {
      frames.push(frame);
      return true;
    });
    parser.push(input.slice(0, split));
    parser.push(input.slice(split));
    assert.deepEqual(frames, [
      { event: 'token', data: 'first\nsecond' },
      { event: 'done', data: '{}' },
    ]);
  }
});

void test('reader preserves UTF-8 when every network chunk is one byte', async () => {
  const bytes = new TextEncoder().encode(sseFrame('token', { text: 'Revenue ₹ grew 📈' }));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      bytes.forEach((byte) => {
        controller.enqueue(Uint8Array.of(byte));
      });
      controller.close();
    },
  });
  const frames: SseFrame[] = [];
  await readSse(
    body,
    (frame) => {
      frames.push(frame);
      return true;
    },
    new AbortController().signal,
  );
  assert.equal(frames[0]?.data, JSON.stringify({ text: 'Revenue ₹ grew 📈' }));
  assert.equal(body.locked, false);
});

void test('POST streaming sends credentials and JSON, and processes all events in order', async () => {
  const fetch = mockFetch((url, init) => {
    assert.equal(url, `/api/chats/${chat.id}/messages`);
    assert.equal(init?.method, 'POST');
    assert.equal(init.credentials, 'include');
    assert.deepEqual(requestJson(init), { content: 'Explain', documentIds: [] });
    return sseResponse(
      sseFrame('meta', { userMessageId: 'user', processingDocumentIds: [] }) +
        sseFrame('sources', [citation]) +
        sseFrame('token', { text: 'Growth [1]' }) +
        sseFrame('done', { assistantMessageId: 'answer', citations: [citation] }),
    );
  });
  const events: StreamEvent[] = [];
  await streamMessage(
    chat.id,
    { content: 'Explain', documentIds: [] },
    (event) => {
      events.push(event);
    },
    new AbortController().signal,
  );
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(
    events.map((event) => event.event),
    ['meta', 'sources', 'token', 'done'],
  );
});

void test('normal JSON authentication failures retain the API error', async () => {
  mockFetch(() =>
    Response.json({ success: false, error: { message: 'Sign in again' } }, { status: 401 }),
  );
  await assert.rejects(
    streamMessage(
      chat.id,
      { content: 'Hello', documentIds: [] },
      () => undefined,
      new AbortController().signal,
    ),
    (error: unknown) =>
      error instanceof ApiError && error.status === 401 && error.message === 'Sign in again',
  );
});

void test('a drop after tokens is an error, including a truncated final event', async () => {
  mockFetch(() =>
    sseResponse(sseFrame('token', { text: 'Partial answer' }) + 'event: done\ndata: {'),
  );
  const events: StreamEvent[] = [];
  await assert.rejects(
    streamMessage(
      chat.id,
      { content: 'Hello', documentIds: [] },
      (event) => {
        events.push(event);
      },
      new AbortController().signal,
    ),
    /Connection lost/,
  );
  assert.equal(events[0]?.event, 'token');
});

void test('error events and malformed known events surface actionable errors', async () => {
  mockFetch(() =>
    sseResponse(sseFrame('error', { code: 'RATE_LIMITED', message: 'Try again soon' })),
  );
  await assert.rejects(
    streamMessage(
      chat.id,
      { content: 'Hello', documentIds: [] },
      () => undefined,
      new AbortController().signal,
    ),
    /Try again soon/,
  );
  assert.throws(() => parseStreamEvent('token', '{bad json'), /invalid response/);
  assert.throws(() => parseStreamEvent('token', JSON.stringify({ text: 7 })), /invalid response/);
  assert.equal(parseStreamEvent('future-event', '{}'), null);
});

void test('aborting a stalled reader cancels it and releases its lock', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const reading = readSse(body, () => true, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

void test('done cancels an open stream and ignores subsequent bytes', async () => {
  let cancelled = false;
  mockFetch(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                sseFrame('done', { assistantMessageId: 'answer', citations: [] }) +
                  sseFrame('token', { text: 'ignored' }),
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  const events: StreamEvent[] = [];
  await streamMessage(
    chat.id,
    { content: 'Hello', documentIds: [] },
    (event) => {
      events.push(event);
    },
    new AbortController().signal,
  );
  assert.equal(cancelled, true);
  assert.deepEqual(
    events.map((event) => event.event),
    ['done'],
  );
});
