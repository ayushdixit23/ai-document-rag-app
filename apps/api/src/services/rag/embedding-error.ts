import { z } from 'zod';

import { IngestError } from './ingest/ingest-error.js';

const providerError = z.object({
  error: z.object({
    status: z.string(),
    details: z
      .array(
        z.object({
          '@type': z.string(),
          retryDelay: z.string().optional(),
          violations: z
            .array(
              z.object({
                quotaId: z.string().optional(),
                quotaMetric: z.string().optional(),
                quotaValue: z.string().optional(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
  }),
});

interface QuotaLimit {
  quotaId?: string;
  quotaMetric?: string;
  quotaValue?: string;
}

const safeIdentifier = (value: string | undefined) =>
  value && /^[\w./:-]{1,200}$/u.test(value) ? value : undefined;

export class EmbeddingProviderError extends IngestError {
  readonly headers: Record<string, string>;
  readonly code: string | undefined;

  constructor(
    readonly status: number,
    readonly providerCode: string,
    retryAfter: string | null,
    readonly quotaLimits: QuotaLimit[] = [],
  ) {
    const exhausted =
      status === 429 &&
      quotaLimits.some(
        (limit) =>
          limit.quotaValue === '0' ||
          /day|daily/iu.test(`${limit.quotaId ?? ''} ${limit.quotaMetric ?? ''}`),
      );
    const message = exhausted
      ? 'Gemini embedding quota is exhausted. Check your embedding model limits in Google AI Studio; wait for reset or enable billing before retrying.'
      : 'Gemini embedding service is temporarily unavailable. Please wait and retry the file.';
    super(`${message} (HTTP ${String(status)}, ${providerCode})`);
    this.code = exhausted ? 'insufficient_quota' : undefined;
    // Google's RetryInfo is often in the JSON body rather than the HTTP headers.
    this.headers = status === 429 && !exhausted ? { 'retry-after': retryAfter ?? '2' } : {};
  }
}

export const embeddingProviderError = (
  status: number,
  body: unknown,
  retryAfter: string | null,
) => {
  const parsed = providerError.safeParse(body);
  const error = parsed.success ? parsed.data.error : undefined;
  const code = error && /^[A-Z_]+$/u.test(error.status) ? error.status : 'UNKNOWN';
  const details = error?.details ?? [];
  const retry = details.find(
    (detail) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
  );
  const seconds = retry?.retryDelay && /^(\d+(?:\.\d+)?)s$/u.exec(retry.retryDelay)?.[1];
  const limits = details
    .filter((detail) => detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure')
    .flatMap((detail) => detail.violations ?? [])
    .slice(0, 10)
    .map((limit) => ({
      quotaId: safeIdentifier(limit.quotaId),
      quotaMetric: safeIdentifier(limit.quotaMetric),
      quotaValue: safeIdentifier(limit.quotaValue),
    }));
  return new EmbeddingProviderError(status, code, retryAfter ?? (seconds || null), limits);
};
