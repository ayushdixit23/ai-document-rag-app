import type { StoredMessage } from '../chats/chat.repository.js';
import { withDeadline } from './deadline.js';

export interface RouteInput {
  content: string;
  summary: string | null;
  history: StoredMessage[];
  documentNames: string[];
  hasNewAttachments: boolean;
  signal: AbortSignal;
}
export interface RouteDecision {
  route: 'documents' | 'general';
  standaloneQuery: string;
  fallback?: boolean;
}

export const ROUTER_TIMEOUT_MS = 8_000;

export const routeWithFallback = async (
  input: RouteInput,
  generate: (signal: AbortSignal) => Promise<RouteDecision>,
  onFallback: (error: unknown) => void,
  timeoutMs = ROUTER_TIMEOUT_MS,
): Promise<RouteDecision> => {
  try {
    return await withDeadline(generate, input.signal, timeoutMs);
  } catch (error) {
    input.signal.throwIfAborted();
    onFallback(error);
    // Keep document access available if the classifier fails; the answer must still cite evidence.
    const previous =
      [...input.history].reverse().find((item) => item.role === 'user')?.content ?? '';
    return {
      route: 'documents',
      fallback: true,
      standaloneQuery: `${previous.slice(-1_000)}\n${input.content}`.trim().slice(-4_000),
    };
  }
};
