import type { ChatDocument } from '@/lib/documents/types';

/** During a known cooldown, check at most every 15 seconds instead of every few seconds. */
export function documentPollDelay(document: ChatDocument, polls: number, now = Date.now()): number {
  const normal = Math.min(1500 + polls * 500, 5_000);
  const progress = document.processingProgress;
  if (progress?.stage !== 'waiting' || !progress.retryAt) return normal;
  const remaining = Date.parse(progress.retryAt) - now;
  return Number.isFinite(remaining) ? Math.max(normal, Math.min(remaining, 15_000)) : normal;
}

export function waitForPoll(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Polling cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
}
