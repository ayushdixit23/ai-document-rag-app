import { and, desc, eq } from 'drizzle-orm';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { document, message, messageDocument } from '../../db/schema/message.js';
import { publicDocument } from '../documents/document.repository.js';

export type StoredChat = typeof chat.$inferSelect;
export type StoredMessage = typeof message.$inferSelect;

export const ownedChatFilter = (userId: string, id: string) =>
  and(eq(chat.userId, userId), eq(chat.id, id));

export const getOwnedChat = async (userId: string, id: string): Promise<StoredChat> => {
  const [row] = await db.select().from(chat).where(ownedChatFilter(userId, id));
  if (!row) throw new AppError('Chat not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  return row;
};

export const loadChatDocuments = async (userId: string, chatId: string) => {
  const rows = await db
    .selectDistinct({ document })
    .from(document)
    .innerJoin(messageDocument, eq(messageDocument.documentId, document.id))
    .innerJoin(message, eq(message.id, messageDocument.messageId))
    .innerJoin(chat, eq(chat.id, message.chatId))
    .where(and(ownedChatFilter(userId, chatId), eq(document.userId, userId)))
    .orderBy(desc(document.createdAt), desc(document.id));
  return rows.map((row) => publicDocument(row.document));
};

export const loadRecentMessages = async (chatId: string): Promise<StoredMessage[]> => {
  const rows = await db
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(1_000);
  return rows.reverse();
};
