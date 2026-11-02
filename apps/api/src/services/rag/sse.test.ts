import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import type { Response } from 'express';

import { untilAborted } from './abortable.js';
import { startSse } from './sse.js';

class TestResponse extends EventEmitter {
  headers: Record<string, string> = {};
  chunks: string[] = [];
  destroyed = false;
  writableEnded = false;
  writableNeedDrain = false;
  statusCode = 0;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  set(headers: Record<string, string>) {
    this.headers = headers;
    return this;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.chunks.push(chunk);
    return !this.writableNeedDrain;
  }
  end() {
    this.writableEnded = true;
  }
  asResponse() {
    return this as unknown as Response;
  }
}

void test('SSE frames structured data and cleans up when closed', async () => {
  const res = new TestResponse();
  const stream = startSse(res.asResponse());
  try {
    await stream.send('token', { text: 'one\ntwo' });
    assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.equal(res.headers['X-Accel-Buffering'], 'no');
    assert.equal(res.chunks[0], 'event: token\ndata: {"text":"one\\ntwo"}\n\n');
  } finally {
    stream.close();
  }
  assert.equal(res.writableEnded, true);
  assert.equal(res.listenerCount('close'), 0);
});

void test('SSE respects backpressure and aborts a pending write on disconnect', async () => {
  const res = new TestResponse();
  res.writableNeedDrain = true;
  const stream = startSse(res.asResponse());
  try {
    const write = stream.send('token', { text: 'one' });
    assert.equal(res.listenerCount('drain'), 1);
    res.emit('close');
    await assert.rejects(write, { name: 'AbortError' });
    assert.equal(stream.signal.aborted, true);
    assert.equal(res.listenerCount('drain'), 0);
  } finally {
    stream.close();
  }
});

void test('abort releases the response even when an integration has not settled', async () => {
  const controller = new AbortController();
  const pending = untilAborted(() => new Promise<never>(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
