import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DocumentEmbeddings, EmbeddingProviderError } from './document-embeddings.js';

const options = {
  apiKey: 'test-secret',
  model: 'gemini-embedding-001',
  outputDimensionality: 768,
  maxRetries: 0,
};

void test('document embeddings preserve provider status instead of returning empty vectors', async () => {
  const embeddings = new DocumentEmbeddings(options, () =>
    Promise.resolve(
      Response.json(
        {
          error: { status: 'RESOURCE_EXHAUSTED', message: 'Private provider details: test-secret' },
        },
        { status: 429, headers: { 'Retry-After': '1' } },
      ),
    ),
  );
  await assert.rejects(embeddings.embedDocuments(['Sensitive document text']), (error: unknown) => {
    assert.ok(error instanceof EmbeddingProviderError);
    assert.equal(error.status, 429);
    assert.equal(error.providerCode, 'RESOURCE_EXHAUSTED');
    assert.equal(error.headers['retry-after'], '1');
    assert.doesNotMatch(error.message, /test-secret|Sensitive|Private/u);
    return true;
  });
});

void test('retryable provider failure reaches the caller retry policy', async () => {
  let calls = 0;
  const embeddings = new DocumentEmbeddings({ ...options, maxRetries: 1 }, () => {
    calls += 1;
    return Promise.resolve(
      calls === 1
        ? Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 })
        : Response.json({ embeddings: [{ values: [0.1, 0.2] }] }),
    );
  });
  assert.deepEqual(await embeddings.embedDocuments(['text']), [[0.1, 0.2]]);
  assert.equal(calls, 2);
});

void test('batch requests keep model, dimensionality, order, and existing text normalization', async () => {
  const embeddings = new DocumentEmbeddings(options, (_url, request) => {
    assert.equal(typeof request?.body, 'string');
    assert.equal(new Headers(request?.headers).get('x-goog-api-key'), 'test-secret');
    if (typeof request?.body === 'string') {
      assert.match(request.body, /"model":"models\/gemini-embedding-001"/u);
      assert.match(request.body, /"outputDimensionality":768/u);
      assert.match(request.body, /first line/u);
    }
    return Promise.resolve(Response.json({ embeddings: [{ values: [1] }, { values: [2] }] }));
  });
  assert.deepEqual(await embeddings.embedDocuments(['first\nline', 'second']), [[1], [2]]);
});

void test('incomplete and malformed success responses fail instead of reaching storage', async () => {
  for (const response of [{ embeddings: [] }, { embeddings: [{ values: [null] }] }]) {
    const embeddings = new DocumentEmbeddings(options, () =>
      Promise.resolve(Response.json(response)),
    );
    await assert.rejects(embeddings.embedDocuments(['text']));
  }
});

void test('document cancellation aborts the provider transport and queued requests do not dispatch', async () => {
  const controller = new AbortController();
  let calls = 0;
  const embeddings = new DocumentEmbeddings({ ...options, maxConcurrency: 1 }, (_url, request) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      request?.signal?.addEventListener(
        'abort',
        () => {
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  });
  const first = embeddings.embedDocuments(['first'], { signal: controller.signal });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const queued = embeddings.embedDocuments(['queued'], { signal: controller.signal });
  const failures = Promise.allSettled([first, queued]);
  controller.abort();
  assert.ok((await failures).every((result) => result.status === 'rejected'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

void test('provider waits expose a retry time instead of silently leaving processing unchanged', async () => {
  const waits: string[] = [];
  const embeddings = new DocumentEmbeddings(options, () =>
    Promise.resolve(
      Response.json(
        {
          error: {
            status: 'RESOURCE_EXHAUSTED',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '15s' }],
          },
        },
        { status: 429 },
      ),
    ),
  );
  await assert.rejects(
    embeddings.embedDocuments(['text'], {
      onRetry: (retryAt) => {
        waits.push(retryAt);
        return Promise.resolve();
      },
    }),
  );
  assert.equal(waits.length, 1);
  assert.ok(Date.parse(waits[0] ?? '') > Date.now());
});
