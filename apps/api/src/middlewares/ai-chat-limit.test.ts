import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import type { Request, Response } from 'express';

import { createAiChatLimit } from './ai-chat-limit.js';

class TestResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  headers: Record<string, string> = {};
  setHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  asResponse() {
    return this as unknown as Response;
  }
}
const request = {
  session: { user: { id: 'authenticated-owner' } },
  body: { userId: 'spoofed' },
} as unknown as Request;
const granted = { request_id: 'lease', reason: null, retry_after: 0 };

void test('AI admission uses authenticated identity and releases its lease once on finish or close', async () => {
  for (const terminal of ['finish', 'close']) {
    let admitted = 0,
      released = 0;
    const res = new TestResponse();
    const middleware = createAiChatLimit({
      reserve: (owner) => {
        assert.equal(owner, 'authenticated-owner');
        return Promise.resolve(granted);
      },
      release: (id) => {
        assert.equal(id, 'lease');
        released += 1;
        return Promise.resolve();
      },
    });
    await middleware(request, res.asResponse(), () => {
      admitted += 1;
    });
    assert.equal(admitted, 1);
    assert.equal(released, 0);
    res.emit(terminal);
    res.emit('finish');
    res.emit('close');
    assert.equal(released, 1);
    assert.equal(res.listenerCount('close'), 0);
  }
});

void test('minute, daily and active-turn limits reject before downstream work with HTTP 429 and Retry-After', async () => {
  for (const reason of ['minute', 'day', 'concurrent'] as const) {
    const res = new TestResponse();
    const middleware = createAiChatLimit({
      reserve: () => Promise.resolve({ request_id: null, reason, retry_after: 12 }),
      release: () => assert.fail('Rejected calls have no lease'),
    });
    await assert.rejects(
      middleware(request, res.asResponse(), () => assert.fail('No model or message writes')),
      {
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      },
    );
    assert.equal(res.headers['Retry-After'], '12');
  }
});

void test('a disconnect while admission is pending releases the granted slot without starting a turn', async () => {
  const res = new TestResponse();
  let released = 0;
  const middleware = createAiChatLimit({
    reserve: () => {
      res.destroyed = true;
      return Promise.resolve(granted);
    },
    release: () => {
      released += 1;
      return Promise.resolve();
    },
  });
  await middleware(request, res.asResponse(), () => assert.fail('Disconnected request'));
  assert.equal(released, 1);
});

void test('admission storage failure and missing authentication never start provider work', async () => {
  const middleware = createAiChatLimit({
    reserve: () => Promise.reject(new Error('Database unavailable')),
    release: () => assert.fail(),
  });
  await assert.rejects(
    middleware(request, new TestResponse().asResponse(), () => assert.fail()),
    /Database unavailable/u,
  );
  await assert.rejects(
    middleware({} as Request, new TestResponse().asResponse(), () => assert.fail()),
    { statusCode: 401 },
  );
});
