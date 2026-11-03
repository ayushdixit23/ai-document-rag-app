import { setTimeout } from 'node:timers/promises';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import { isIndexing, requiredDocuments } from './document-wait-state.js';
import type { PreparedTurn } from './prepare-turn.js';
import type { TurnStream } from './types.js';

type TurnDocument = PreparedTurn['documents'][number];
export interface DocumentWaitDependencies {
  load: (userId: string, ids: string[]) => Promise<TurnDocument[]>;
  pause?: (signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}
const WAIT_TIMEOUT_MS = 4 * 60 * 1_000;

const reportReady = (stream: TurnStream, documents: TurnDocument[]) =>
  stream.send('status', {
    phase: 'answering',
    documentIds: documents.map((row) => row.id),
    documentVersions: documents.map(({ id, updatedAt }) => ({
      id,
      updatedAt: updatedAt.toISOString(),
    })),
  });

export const waitForDocuments = async (
  turn: PreparedTurn,
  stream: TurnStream,
  deps: DocumentWaitDependencies,
  requiredIds?: string[],
): Promise<PreparedTurn> => {
  const targets = requiredIds ?? turn.documents.filter(isIndexing).map((row) => row.id);
  if (!targets.length) return turn;
  let selected = requiredDocuments(turn.documents, targets);
  if (selected.every((row) => row.status === 'ready')) {
    await reportReady(stream, selected);
    return turn;
  }
  const deadline = Date.now() + (deps.timeoutMs ?? WAIT_TIMEOUT_MS);
  let documents = turn.documents;
  let polls = 0;
  await stream.send('status', { phase: 'reading_documents', documentIds: targets });
  while (selected.some(isIndexing)) {
    stream.signal.throwIfAborted();
    if (Date.now() >= deadline)
      throw new AppError(
        'Document processing is taking longer than expected. Please retry once the files are ready.',
        408,
        ERROR_CODES.REQUEST_TIMEOUT,
      );
    await (deps.pause?.(stream.signal) ??
      setTimeout(Math.min(1_000 + polls * 500, 3_000), undefined, { signal: stream.signal }));
    polls += 1;
    stream.signal.throwIfAborted();
    selected = requiredDocuments(await deps.load(turn.userId, targets), targets);
    stream.signal.throwIfAborted();
    const refreshed = new Map(selected.map((row) => [row.id, row]));
    documents = documents.map((row) => refreshed.get(row.id) ?? row);
  }
  await reportReady(stream, selected);
  return { ...turn, documents };
};
