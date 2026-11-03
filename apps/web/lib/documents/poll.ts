import { ApiError } from '@/lib/api';
import { fetchDocument } from '@/lib/documents/api';
import { documentPollDelay, waitForPoll } from '@/lib/documents/poll-delay';
import { type ChatDocument, isDocumentProcessing } from '@/lib/documents/types';

const MAX_POLL_FAILURES = 3;

type Observer = { update: (document: ChatDocument) => void; finish: (error?: unknown) => void };
type PollSession = {
  document: ChatDocument;
  controller: AbortController;
  observers: Set<Observer>;
};

// Composer attachments and sent-message chips share one active request loop per document.
const sessions = new Map<string, PollSession>();

function removeSession(session: PollSession) {
  if (sessions.get(session.document.id) === session) sessions.delete(session.document.id);
}

function observe(
  session: PollSession,
  update: Observer['update'],
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      if (!session.observers.delete(observer)) return;
      signal.removeEventListener('abort', abort);
      if (error === undefined) resolve();
      else
        reject(error instanceof Error ? error : new Error('Document status subscription failed'));
      if (!session.observers.size) {
        removeSession(session);
        session.controller.abort();
      }
    };
    const observer: Observer = { update, finish };
    const abort = () => {
      finish(new DOMException('Polling cancelled', 'AbortError'));
    };
    session.observers.add(observer);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function publish(session: PollSession) {
  for (const observer of session.observers) {
    try {
      observer.update(session.document);
    } catch (error) {
      observer.finish(error);
    }
  }
}

async function runPoll(session: PollSession): Promise<void> {
  const signal = session.controller.signal;
  let failures = 0;
  let polls = 0;
  try {
    while (isDocumentProcessing(session.document.status)) {
      await waitForPoll(signal, documentPollDelay(session.document, polls));
      polls += 1;
      try {
        session.document = (await fetchDocument(session.document.id, signal)).document;
        signal.throwIfAborted();
        failures = 0;
        publish(session);
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) throw error;
        failures += 1;
        if (failures >= MAX_POLL_FAILURES)
          throw new Error('Could not refresh this document. Retry to check its status.');
      }
    }
    for (const observer of session.observers) observer.finish();
  } catch (error) {
    for (const observer of session.observers) observer.finish(error);
  } finally {
    removeSession(session);
  }
}

export async function pollDocument(
  initial: ChatDocument,
  onUpdate: (document: ChatDocument) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (!isDocumentProcessing(initial.status)) return;
  const existing = sessions.get(initial.id);
  const session: PollSession = existing ?? {
    document: initial,
    controller: new AbortController(),
    observers: new Set(),
  };
  sessions.set(initial.id, session);
  const observing = observe(session, onUpdate, signal);
  if (!existing) void runPoll(session);
  return observing;
}
