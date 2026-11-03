import { randomUUID } from 'node:crypto';

import type { SendMessageInput } from '../../core/validation/schemas/chats.schema.js';
import { loadChatDocuments } from '../chats/chat.repository.js';
import { saveUserMessage } from '../chats/message.repository.js';
import { loadTurnContext } from '../chats/turn-context.repository.js';
import { getAttachments, publicDocument } from '../documents/document.repository.js';
import { timeStage } from './timing.js';

export const prepareTurn = async (userId: string, chatId: string, input: SendMessageInput) => {
  const userMessageId: string = randomUUID();
  const context = timeStage('load chat context', { chatId }, () =>
    Promise.all([
      loadTurnContext(userId, chatId, userMessageId),
      loadChatDocuments(userId, chatId),
      getAttachments(userId, input.documentIds),
    ]),
  );
  const write = timeStage('save user message', { chatId }, () =>
    saveUserMessage({ userId, chatId, id: userMessageId, ...input }),
  );
  // Settle both paths before reporting an error; the SQL write validates access independently.
  const [loaded, saved] = await Promise.allSettled([context, write]);
  if (loaded.status === 'rejected') throw loaded.reason;
  if (saved.status === 'rejected') throw saved.reason;
  const [{ chat, history, preferences }, scope, attached] = loaded.value;
  const documents = [
    ...new Map([...scope, ...attached.map(publicDocument)].map((row) => [row.id, row])).values(),
  ];
  return { userId, chat, history, preferences, documents, input, userMessageId };
};

export type PreparedTurn = Awaited<ReturnType<typeof prepareTurn>>;
