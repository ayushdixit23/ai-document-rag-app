import { setTimeout } from 'node:timers/promises';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import type { PreparedTurn } from './prepare-turn.js';
import type { TurnStream } from './types.js';

type TurnDocument = PreparedTurn['documents'][number];
export interface DocumentWaitDependencies {
  load: (userId: string, ids: string[]) => Promise<TurnDocument[]>;
  pause?: (signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}
const processing = (row: TurnDocument) => ['pending', 'processing'].includes(row.status);
const WAIT_TIMEOUT_MS = 4 * 60 * 1_000;

export const waitForDocuments = async (
  turn: PreparedTurn,
  stream: TurnStream,
  deps: DocumentWaitDependencies,
): Promise<PreparedTurn> => {
  const targets = turn.documents.filter(processing).map((row) => row.id);
  if (!targets.length) return turn;
  const deadline = Date.now() + (deps.timeoutMs ?? WAIT_TIMEOUT_MS);
  let documents = turn.documents;
  await stream.send('status', { phase: 'reading_documents', documentIds: targets });
  while (documents.some((row) => targets.includes(row.id) && processing(row))) {
    stream.signal.throwIfAborted();
    if (Date.now() >= deadline)
      throw new AppError(
        'Document processing is taking longer than expected. Please retry once the files are ready.',
        408,
        ERROR_CODES.REQUEST_TIMEOUT,
      );
    await (deps.pause?.(stream.signal) ?? setTimeout(1_000, undefined, { signal: stream.signal }));
    stream.signal.throwIfAborted();
    const latest = await deps.load(turn.userId, targets);
    stream.signal.throwIfAborted();
    if (latest.some((row) => row.status === 'failed'))
      throw new AppError(
        'A document could not be processed. Retry the failed file, then send your question again.',
        409,
        ERROR_CODES.FILE_UPLOAD_FAILED,
      );
    if (latest.length !== targets.length)
      throw new AppError(
        'An attached document is no longer available.',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND,
      );
    const refreshed = new Map(latest.map((row) => [row.id, row]));
    documents = documents.map((row) => refreshed.get(row.id) ?? row);
  }
  const failed = documents.filter((row) => targets.includes(row.id) && row.status !== 'ready');
  if (failed.length)
    throw new AppError(
      'A document could not be processed. Retry the failed file, then send your question again.',
      409,
      ERROR_CODES.FILE_UPLOAD_FAILED,
    );
  await stream.send('status', { phase: 'answering', documentIds: targets });
  return { ...turn, documents };
};
