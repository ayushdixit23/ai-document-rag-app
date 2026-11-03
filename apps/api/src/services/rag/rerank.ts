import { RERANK_TIMEOUT_MS } from './config.js';
import { withDeadline } from './deadline.js';
import { localRerank } from './local-rerank.js';
import { pineconeRerank, RerankProviderError } from './pinecone-rerank.js';
import type { Candidate } from './retrieval-types.js';

export interface RerankDependencies {
  apiKey: string;
  reserve: () => Promise<string | null>;
  block: (id: string, monthly: boolean) => Promise<void>;
  fetch: typeof fetch;
  report: (details: Record<string, unknown>) => void;
}

interface RerankState {
  reservation: string | null;
  reserveMs?: number;
  providerMs?: number;
  providerStatus?: number;
}

const reserveBudget = async (dependencies: RerankDependencies, state: RerankState) => {
  const started = performance.now();
  try {
    state.reservation = await dependencies.reserve();
  } finally {
    state.reserveMs = Math.round(performance.now() - started);
  }
};

const callProvider = async (
  query: string,
  candidates: Candidate[],
  signal: AbortSignal,
  dependencies: RerankDependencies,
  state: RerankState,
) => {
  const started = performance.now();
  try {
    return await pineconeRerank({
      query,
      candidates,
      apiKey: dependencies.apiKey,
      signal,
      fetch: dependencies.fetch,
    });
  } finally {
    state.providerMs = Math.round(performance.now() - started);
  }
};

const timeoutReason = (error: unknown, state: RerankState): string | undefined => {
  if (!(error instanceof Error) || error.message !== 'Model deadline exceeded') return undefined;
  return state.reservation ? 'provider_timeout' : 'budget_timeout';
};

export const rerankCandidates = async (
  query: string,
  candidates: Candidate[],
  parent: AbortSignal,
  dependencies: RerankDependencies,
): Promise<Candidate[]> => {
  parent.throwIfAborted();
  if (!candidates.length) return [];
  let reason = 'missing_credentials';
  const state: RerankState = { reservation: null };
  if (dependencies.apiKey) {
    try {
      return await withDeadline(
        async (signal) => {
          reason = 'budget_unavailable';
          await reserveBudget(dependencies, state);
          signal.throwIfAborted();
          if (!state.reservation) {
            reason = 'budget_or_rate_limit';
            throw new Error(reason);
          }
          reason = 'provider_unavailable';
          const result = await callProvider(query, candidates, signal, dependencies, state);
          dependencies.report({
            provider: 'pinecone',
            count: candidates.length,
            shortened: result.shortened,
            units: result.units,
            reserveMs: state.reserveMs,
            providerMs: state.providerMs,
          });
          return result.candidates;
        },
        parent,
        RERANK_TIMEOUT_MS,
      );
    } catch (error) {
      parent.throwIfAborted();
      reason = timeoutReason(error, state) ?? reason;
      if (error instanceof RerankProviderError && error.status === 429 && state.reservation) {
        reason = error.monthly ? 'provider_monthly_limit' : 'provider_rate_limit';
        // Do not extend the answer deadline while persisting the provider's circuit breaker.
        void dependencies.block(state.reservation, error.monthly).catch(() => {
          dependencies.report({ reason: 'circuit_breaker_write_failed' });
        });
      }
      if (error instanceof RerankProviderError) state.providerStatus = error.status;
    }
  }
  dependencies.report({
    provider: 'local_bm25',
    reason,
    count: candidates.length,
    reserveMs: state.reserveMs,
    providerMs: state.providerMs,
    providerStatus: state.providerStatus,
  });
  return localRerank(query, candidates);
};
