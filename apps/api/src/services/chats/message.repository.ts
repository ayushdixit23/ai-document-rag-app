import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { message, messageDocument } from '../../db/schema/message.js';
import { messageCitation } from '../../db/schema/message-citation.js';
import type { Source } from '../rag/types.js';

export const saveUserMessage = async (
  chatId: string,
  content: string,
  documentIds: string[],
): Promise<string> => {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(message).values({ id, chatId, role: 'user', content });
    if (documentIds.length)
      await tx
        .insert(messageDocument)
        .values(documentIds.map((documentId) => ({ messageId: id, documentId })));
    await tx.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, chatId));
  });
  return id;
};

export const saveAssistantMessage = async (
  chatId: string,
  content: string,
  citations: Source[],
): Promise<string> => {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(message).values({ id, chatId, role: 'assistant', content });
    if (citations.length)
      await tx.insert(messageCitation).values(
        citations.map((source) => ({
          messageId: id,
          documentId: source.documentId,
          chunkId: source.chunkId,
          ordinal: source.n,
          page: source.page,
          snippet: source.snippet,
        })),
      );
    await tx.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, chatId));
  });
  return id;
};
