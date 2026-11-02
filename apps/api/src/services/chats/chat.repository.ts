import { and, desc, eq, exists } from 'drizzle-orm';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { document, message, messageDocument } from '../../db/schema/message.js';
import { publicDocument } from '../documents/document.repository.js';

export type StoredChat = typeof chat.$inferSelect;
export type StoredMessage = typeof message.$inferSelect & {
  documentNames?: string[];
  hasCitations?: boolean;
};

export const ownedChatFilter = (userId: string, id: string) =>
  and(eq(chat.userId, userId), eq(chat.id, id));

export const getOwnedChat = async (userId: string, id: string): Promise<StoredChat> => {
  const [row] = await db.select().from(chat).where(ownedChatFilter(userId, id));
  if (!row) throw new AppError('Chat not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  return row;
};

export const loadChatDocuments = async (userId: string, chatId: string) => {
  const rows = await db
    .select()
    .from(document)
    .where(
      and(
        eq(document.userId, userId),
        exists(
          db
            .select({ id: messageDocument.messageId })
            .from(messageDocument)
            .innerJoin(message, eq(message.id, messageDocument.messageId))
            .innerJoin(chat, eq(chat.id, message.chatId))
            .where(
              and(ownedChatFilter(userId, chatId), eq(messageDocument.documentId, document.id)),
            ),
        ),
      ),
    )
    .orderBy(desc(document.createdAt), desc(document.id));
  return rows.map(publicDocument);
};
