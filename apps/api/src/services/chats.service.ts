import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import { AppError } from '../core/errors/AppError.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { db } from '../db/index.js';
import { chat } from '../db/schema/chats.js';
import { getOwnedChat, loadChatDocuments, ownedChatFilter } from './chats/chat.repository.js';

export const createChat = async (userId: string, title?: string) => {
  const [row] = await db
    .insert(chat)
    .values({
      id: randomUUID(),
      userId,
      title: title ?? 'New chat',
      titlePending: title === undefined,
    })
    .returning();
  return row;
};

export const listChats = (userId: string) =>
  db
    .select({
      id: chat.id,
      title: chat.title,
      titlePending: chat.titlePending,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(eq(chat.userId, userId))
    .orderBy(desc(chat.updatedAt), desc(chat.id));

export const renameChat = async (userId: string, id: string, title: string) => {
  const [row] = await db
    .update(chat)
    .set({ title, titlePending: false })
    .where(ownedChatFilter(userId, id))
    .returning();
  if (!row) throw new AppError('Chat not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  return row;
};

export const deleteChat = async (userId: string, id: string): Promise<void> => {
  const rows = await db.delete(chat).where(ownedChatFilter(userId, id)).returning({ id: chat.id });
  if (!rows.length) throw new AppError('Chat not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
};

export const getChatDocuments = async (userId: string, chatId: string) => {
  await getOwnedChat(userId, chatId);
  return loadChatDocuments(userId, chatId);
};
