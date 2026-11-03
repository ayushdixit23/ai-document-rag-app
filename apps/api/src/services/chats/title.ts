import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { getOwnedChat, ownedChatFilter } from './chat.repository.js';
import { promptTitle } from './prompt-title.js';
import { loadTitleContext } from './title.repository.js';

const pending = new Map<string, Promise<Awaited<ReturnType<typeof getOwnedChat>>>>();

const nameChat = async (userId: string, id: string) => {
  const context = await loadTitleContext(userId, id);
  if (!context) return getOwnedChat(userId, id);
  const started = context.chat;
  if (!started.titlePending) return started;
  if (!context.firstId) return started;
  const title = promptTitle(context.content, context.documentNames);
  const [updated] = await db
    .update(chat)
    .set({ title, titlePending: false, updatedAt: sql`${chat.updatedAt}` })
    .where(and(ownedChatFilter(userId, id), eq(chat.titlePending, true)))
    .returning();
  // A manual rename always wins, including while automatic naming is in progress.
  return updated ?? getOwnedChat(userId, id);
};

export const generateChatTitle = (userId: string, id: string) => {
  const key = `${userId}:${id}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = nameChat(userId, id).finally(() => {
    pending.delete(key);
  });
  pending.set(key, request);
  return request;
};
