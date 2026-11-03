import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localRerank } from './local-rerank.js';
import { rerankCandidates } from './rerank.js';
import { rerankInput } from './rerank-input.js';
import { candidate, rerankHarness } from './retrieval.fixtures.js';

void test('hosted reranking uses response indices and keeps authoritative original passage text', async () => {
  const { calls, dependencies, candidates, signal } = rerankHarness();
  dependencies.fetch = (_url, options) => {
    assert.equal(typeof options?.body, 'string');
    if (typeof options?.body === 'string') assert.match(options.body, /bge-reranker-v2-m3/u);
    assert.equal(options?.signal?.aborted, false);
    calls.fetched += 1;
    return Promise.resolve(
      Response.json({
        data: [
          { index: 1, score: 2.5, document: { text: 'Untrusted provider replacement' } },
          { index: 0, score: -1 },
        ],
        usage: { rerank_units: 1 },
      }),
    );
  };
  const result = await rerankCandidates('revenue', candidates, signal, dependencies);
  assert.deepEqual(
    result.map((item) => item.chunkId),
    ['second', 'first'],
  );
  assert.equal(result[0]?.snippet, candidates[1]?.snippet);
  assert.equal(calls.reserved, 1);
  assert.equal(calls.fetched, 1);
  assert.equal(calls.reports[0]?.provider, 'pinecone');
});

void test('fallback runs locally only when hosted reranking is unavailable', async () => {
  for (const unavailable of ['credentials', 'quota', 'database', 'network', 'http'] as const) {
    const { dependencies, candidates, signal, calls } = rerankHarness();
    if (unavailable === 'credentials') dependencies.apiKey = '';
    if (unavailable === 'quota') dependencies.reserve = () => Promise.resolve(null);
    if (unavailable === 'database')
      dependencies.reserve = () => Promise.reject(new Error('Offline'));
    if (unavailable === 'network') dependencies.fetch = () => Promise.reject(new Error('Offline'));
    if (unavailable === 'http')
      dependencies.fetch = () => Promise.resolve(new Response('', { status: 503 }));
    const result = await rerankCandidates('revenue', candidates, signal, dependencies);
    assert.deepEqual(result, localRerank('revenue', candidates));
    assert.equal(calls.reports.at(-1)?.provider, 'local_bm25');
    if (unavailable === 'credentials' || unavailable === 'quota' || unavailable === 'database')
      assert.equal(calls.fetched, 0);
  }
});

void test('malformed, duplicate, incomplete, unknown, and non-finite provider results fall back', async () => {
  for (const data of [
    null,
    [],
    [{ index: 0, score: 1 }],
    [
      { index: 0, score: 1 },
      { index: 0, score: 2 },
    ],
    [
      { index: 2, score: 1 },
      { index: 0, score: 2 },
    ],
    [
      { index: 0, score: null },
      { index: 1, score: 2 },
    ],
    [
      { index: -1, score: 1 },
      { index: 1, score: 2 },
    ],
  ]) {
    const { calls, dependencies, candidates, signal } = rerankHarness({ data });
    assert.deepEqual(
      await rerankCandidates('revenue', candidates, signal, dependencies),
      localRerank('revenue', candidates),
    );
    assert.equal(calls.reports.at(-1)?.provider, 'local_bm25');
  }
});

void test('provider monthly and per-minute limits persist different circuit breakers without retries', async () => {
  for (const monthly of [true, false]) {
    const { calls, dependencies, candidates, signal } = rerankHarness();
    dependencies.fetch = () => {
      calls.fetched += 1;
      return Promise.resolve(
        new Response(monthly ? 'monthly request limit' : 'requests per minute', { status: 429 }),
      );
    };
    await rerankCandidates('revenue', candidates, signal, dependencies);
    assert.deepEqual(calls.blocked, [monthly]);
    assert.equal(calls.fetched, 1);
  }
});

void test('two-second hosted deadline returns local ranking even for an unresponsive transport', async () => {
  const { dependencies, candidates, signal } = rerankHarness();
  dependencies.fetch = () => new Promise<never>(() => {});
  const started = performance.now();
  assert.deepEqual(
    await rerankCandidates('revenue', candidates, signal, dependencies),
    localRerank('revenue', candidates),
  );
  assert.ok(performance.now() - started < 2_500);
});

void test('parent cancellation and empty candidates never dispatch a hosted request', async () => {
  const { dependencies, candidates, calls, signal } = rerankHarness();
  assert.deepEqual(await rerankCandidates('revenue', [], signal, dependencies), []);
  const controller = new AbortController();
  controller.abort(new Error('Disconnected'));
  await assert.rejects(
    rerankCandidates('revenue', candidates, controller.signal, dependencies),
    /Disconnected/u,
  );
  assert.equal(calls.reserved, 0);
  assert.equal(calls.fetched, 0);
});

void test('rerank pair preparation bounds Unicode input without changing cited passages', () => {
  const original = candidate('unicode', 'हिंदी 😊 revenue '.repeat(500));
  const prepared = rerankInput('Why revenue? '.repeat(200), [original]);
  assert.equal(prepared.shortened, true);
  assert.ok(Buffer.byteLength(prepared.query + (prepared.documents[0]?.text ?? '')) <= 1_000);
  assert.ok(original.snippet.length > 5_000);
  assert.doesNotMatch(prepared.documents[0]?.text ?? '', /[\uD800-\uDBFF]$/u);
});
