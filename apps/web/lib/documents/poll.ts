import { fetchDocument } from '@/lib/documents/api';
import { type ChatDocument, isDocumentProcessing } from '@/lib/documents/types';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_FAILURES = 3;

function waitForPoll(signal: AbortSignal, delay: number): Promise<void> {
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

export async function pollDocument(
  initial: ChatDocument,
  onUpdate: (document: ChatDocument) => void,
  signal: AbortSignal,
): Promise<void> {
  let document = initial;
  let failures = 0;
  let polls = 0;
  while (isDocumentProcessing(document.status)) {
    await waitForPoll(signal, Math.min(POLL_INTERVAL_MS + polls * 500, 5_000));
    polls += 1;
    try {
      document = (await fetchDocument(document.id, signal)).document;
      signal.throwIfAborted();
      failures = 0;
      onUpdate(document);
    } catch (error) {
      if (signal.aborted) throw error;
      failures += 1;
      if (failures >= MAX_POLL_FAILURES)
        throw new Error('Could not refresh this document. Retry to check its status.');
    }
  }
}
