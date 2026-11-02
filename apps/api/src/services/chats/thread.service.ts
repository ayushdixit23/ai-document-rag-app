import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { document } from '../../db/schema/message.js';
import { publicDocument } from '../documents/document.repository.js';
import { getOwnedChat } from './chat.repository.js';
import { messagePage, messagePageQuery } from './message-page.js';
import { loadThreadLinks } from './thread-links.repository.js';

export const getChatThread = async (userId: string, chatId: string, before?: string) => {
  const ownedChat = await getOwnedChat(userId, chatId);
  const { messages, pageInfo } = messagePage(await messagePageQuery(db, chatId, before));
  const { links, citations } = await loadThreadLinks(
    userId,
    messages.map((row) => row.id),
  );
  const ids = [...new Set([...links, ...citations].map((row) => row.documentId))];
  const documents = ids.length
    ? await db
        .select()
        .from(document)
        .where(and(eq(document.userId, userId), inArray(document.id, ids)))
    : [];
  return {
    chat: ownedChat,
    pageInfo,
    documents: documents.map(publicDocument),
    messages: messages.map((row) => ({
      ...row,
      documentIds: links.filter((link) => link.messageId === row.id).map((link) => link.documentId),
      citations: citations
        .filter((citation) => citation.messageId === row.id)
        .map(({ messageId: _id, ...citation }) => citation),
    })),
  };
};
