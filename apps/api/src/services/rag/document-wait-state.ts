import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import type { PreparedTurn } from './prepare-turn.js';

type TurnDocument = PreparedTurn['documents'][number];

export const isIndexing = (row: TurnDocument) =>
  row.status === 'pending' || row.status === 'processing';

export const requiredDocuments = (documents: TurnDocument[], ids: string[]): TurnDocument[] => {
  const selected = documents.filter((row) => ids.includes(row.id));
  if (selected.length !== ids.length)
    throw new AppError(
      'An attached document is no longer available.',
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
    );
  if (selected.some((row) => row.status === 'failed'))
    throw new AppError(
      'A document could not be processed. Retry the failed file, then send your question again.',
      409,
      ERROR_CODES.FILE_UPLOAD_FAILED,
    );
  if (selected.some((row) => row.status === 'uploading'))
    throw new AppError(
      'Complete each upload before attaching it.',
      409,
      ERROR_CODES.RESOURCE_CONFLICT,
    );
  return selected;
};
