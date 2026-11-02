import { randomUUID } from 'node:crypto';

import { asc, desc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { chat } from '../db/schema/chats.js';
import { document, message, messageDocument } from '../db/schema/message.js';
import { messageCitation } from '../db/schema/message-citation.js';
import { getOwnedChat, loadChatDocuments, ownedChatFilter } from './chats/chat.repository.js';

export const createChat = async (userId: string, title = 'New chat') => {
  const [row] = await db.insert(chat).values({ id: randomUUID(), userId, title }).returning();
  return row;
};

export const listChats = (userId: string) =>
  db
    .select()
    .from(chat)
    .where(eq(chat.userId, userId))
    .orderBy(desc(chat.updatedAt), desc(chat.id));

export const renameChat = async (userId: string, id: string, title: string) => {
  await getOwnedChat(userId, id);
  const [row] = await db.update(chat).set({ title }).where(ownedChatFilter(userId, id)).returning();
  return row;
};

export const deleteChat = async (userId: string, id: string): Promise<void> => {
  await getOwnedChat(userId, id);
  await db.delete(chat).where(ownedChatFilter(userId, id));
};

const loadThreadLinks = async (chatId: string) => {
  const [links, citations] = await Promise.all([
    db
      .select({ messageId: messageDocument.messageId, documentId: messageDocument.documentId })
      .from(messageDocument)
      .innerJoin(message, eq(message.id, messageDocument.messageId))
      .where(eq(message.chatId, chatId)),
    db
      .select({
        messageId: messageCitation.messageId,
        n: messageCitation.ordinal,
        documentId: messageCitation.documentId,
        title: document.name,
        page: messageCitation.page,
        snippet: messageCitation.snippet,
      })
      .from(messageCitation)
      .innerJoin(message, eq(message.id, messageCitation.messageId))
      .innerJoin(document, eq(document.id, messageCitation.documentId))
      .where(eq(message.chatId, chatId))
      .orderBy(asc(messageCitation.ordinal)),
  ]);
  return { links, citations };
};

export const getChatThread = async (userId: string, chatId: string) => {
  const ownedChat = await getOwnedChat(userId, chatId);
  const [messages, documents, { links, citations }] = await Promise.all([
    db
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(asc(message.createdAt), asc(message.id)),
    loadChatDocuments(userId, chatId),
    loadThreadLinks(chatId),
  ]);
  return {
    chat: ownedChat,
    documents,
    messages: messages.map((row) => ({
      ...row,
      documentIds: links.filter((link) => link.messageId === row.id).map((link) => link.documentId),
      citations: citations
        .filter((citation) => citation.messageId === row.id)
        .map(({ messageId: _id, ...citation }) => citation),
    })),
  };
};

export const getChatDocuments = async (userId: string, chatId: string) => {
  await getOwnedChat(userId, chatId);
  return loadChatDocuments(userId, chatId);
};
