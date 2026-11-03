import {
  GoogleGenerativeAIEmbeddings,
  type GoogleGenerativeAIEmbeddingsParams,
} from '@langchain/google-genai';
import { z } from 'zod';

import { logger } from '../../utils/logger.js';
import { EMBEDDING_REQUEST_TIMEOUT_MS } from './config.js';
import { embeddingProviderError } from './embedding-error.js';
import { EmbeddingRateLimit } from './embedding-rate-limit.js';

export { EmbeddingProviderError } from './embedding-error.js';

const batchResponse = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) });

interface EmbedOptions {
  signal?: AbortSignal;
  onRetry?: (retryAt: string) => Promise<void>;
}

/** The upstream batch implementation swallows rejected requests and returns empty vectors. */
export class DocumentEmbeddings extends GoogleGenerativeAIEmbeddings {
  private readonly rateLimit: EmbeddingRateLimit | undefined;
  constructor(
    fields: GoogleGenerativeAIEmbeddingsParams & { inputsPerMinute?: number },
    private readonly transport: typeof fetch = fetch,
  ) {
    super(fields);
    if (fields.inputsPerMinute) this.rateLimit = new EmbeddingRateLimit(fields.inputsPerMinute);
    this.maxBatchSize = Math.min(48, fields.inputsPerMinute ?? 48);
  }

  override embedDocuments(documents: string[], options: EmbedOptions = {}): Promise<number[][]> {
    options.signal?.throwIfAborted();
    return this.caller.callWithOptions({ signal: options.signal }, () =>
      this.embedBatches(documents, options),
    );
  }

  private async embedBatches(documents: string[], options: EmbedOptions): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < documents.length; start += this.maxBatchSize) {
      options.signal?.throwIfAborted();
      vectors.push(
        ...(await this.requestBatch(documents.slice(start, start + this.maxBatchSize), options)),
      );
    }
    return vectors;
  }

  private async requestBatch(documents: string[], options: EmbedOptions): Promise<number[][]> {
    const reservation = await this.rateLimit?.acquire(
      documents.length,
      options.signal,
      options.onRetry,
    );
    const started = performance.now();
    const response = await this.fetchBatch(documents, options).catch((error: unknown) => {
      logger.warn(
        {
          model: this.model,
          count: documents.length,
          durationMs: Math.round(performance.now() - started),
          errorName: error instanceof Error ? error.name : 'Unknown',
        },
        'Document embedding transport failed',
      );
      throw error;
    });
    logger.debug(
      {
        model: this.model,
        count: documents.length,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
      },
      'Document embedding batch',
    );
    if (!response.ok) {
      const error = embeddingProviderError(
        response.status,
        await response.json().catch(() => null),
        response.headers.get('retry-after'),
      );
      logger.warn(
        {
          model: this.model,
          status: error.status,
          providerCode: error.providerCode,
          retryAfter: error.headers['retry-after'],
          quotaLimits: error.quotaLimits,
        },
        'Document embedding retry or failure',
      );
      const seconds = Number(error.headers['retry-after']);
      if (error.status === 429) reservation?.release();
      if (Number.isFinite(seconds) && seconds <= 60) {
        this.rateLimit?.deferFor(seconds * 1_000);
        await options.onRetry?.(new Date(Date.now() + seconds * 1_000).toISOString());
      }
      throw error;
    }
    const result = batchResponse.parse(await response.json());
    if (result.embeddings.length !== documents.length)
      throw new Error('Incomplete Gemini embedding response.');
    return result.embeddings.map((item) => item.values);
  }

  private fetchBatch(documents: string[], options: EmbedOptions): Promise<Response> {
    if (!this.apiKey) throw new Error('Missing Gemini API key.');
    const timeout = AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS);
    return this.transport(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:batchEmbedContents`,
      {
        method: 'POST',
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          requests: documents.map((text) => ({
            model: `models/${this.model}`,
            content: {
              role: 'user',
              parts: [{ text: this.stripNewLines ? text.replace(/\n/g, ' ') : text }],
            },
            taskType: this.taskType,
            title: this.title,
            outputDimensionality: this.outputDimensionality,
          })),
        }),
      },
    );
  }
}
