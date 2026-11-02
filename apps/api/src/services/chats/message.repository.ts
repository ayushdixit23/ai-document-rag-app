import { randomUUID } from 'node:crypto';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import { db } from '../../db/index.js';
import type { Source } from '../rag/types.js';
import { messageWriteQuery } from './message-writes.js';

export const saveUserMessage = async (input: {
  id: string;
  userId: string;
  chatId: string;
  content: string;
  documentIds: string[];
}): Promise<string> => {
  const saved = await db.execute<{ id: string }>(messageWriteQuery({ ...input, role: 'user' }));
  if (!saved.length)
    throw new AppError(
      'Chat or attachment is unavailable. Complete the upload before sending.',
      409,
      ERROR_CODES.RESOURCE_CONFLICT,
    );
  return input.id;
};

export const saveAssistantMessage = async (
  chatId: string,
  content: string,
  citations: Source[],
): Promise<string> => {
  const id = randomUUID();
  await db.execute(messageWriteQuery({ id, chatId, role: 'assistant', content, citations }));
  return id;
};
