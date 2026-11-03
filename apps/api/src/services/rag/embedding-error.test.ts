import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyRateLimitError } from '@langchain/core/utils/async_caller';

import { embeddingProviderError } from './embedding-error.js';

void test('Google body retry hints reach the SDK even when the HTTP header is absent', () => {
  const error = embeddingProviderError(
    429,
    {
      error: {
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34.5s' }],
      },
    },
    null,
  );
  assert.equal(error.headers['retry-after'], '34.5');
  assert.equal(classifyRateLimitError(error)?.action, 'wait');
  assert.equal(classifyRateLimitError(error)?.retryAfterMs, 34_500);
});

void test('headerless 429 permits bounded retry instead of immediate capacity failure', () => {
  const error = embeddingProviderError(429, { error: { status: 'RESOURCE_EXHAUSTED' } }, null);
  assert.equal(classifyRateLimitError(error)?.action, 'wait');
  assert.equal(error.headers['retry-after'], '2');
});

void test('daily or zero allowance stops retries and records only safe quota metadata', () => {
  for (const quota of [
    { quotaId: 'EmbedContentRequestsPerDayPerProject-FreeTier', quotaValue: '1000' },
    { quotaId: 'EmbedContentRequestsPerMinutePerProject-FreeTier', quotaValue: '0' },
  ]) {
    const error = embeddingProviderError(
      429,
      {
        error: {
          status: 'RESOURCE_EXHAUSTED',
          details: [
            { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [quota] },
          ],
          message: 'secret provider details',
        },
      },
      '1',
    );
    assert.equal(error.code, 'insufficient_quota');
    assert.equal(classifyRateLimitError(error)?.action, 'stop');
    assert.deepEqual(error.headers, {});
    assert.equal(error.quotaLimits[0]?.quotaId, quota.quotaId);
    assert.doesNotMatch(error.message, /secret/u);
  }
});

void test('long waits are not retried automatically and HTTP hints take priority', () => {
  const body = {
    error: {
      status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '120s' }],
    },
  };
  assert.equal(classifyRateLimitError(embeddingProviderError(429, body, null))?.action, 'capacity');
  assert.equal(embeddingProviderError(429, body, '5').headers['retry-after'], '5');
});
