import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { document, messageDocument } from '../../db/schema/message.js';
import { messageCitation } from '../../db/schema/message-citation.js';

export const loadThreadLinks = async (userId: string, messageIds: string[]) => {
  if (!messageIds.length) return { links: [], citations: [] };
  const [links, citations] = await Promise.all([
    db
      .select({ messageId: messageDocument.messageId, documentId: messageDocument.documentId })
      .from(messageDocument)
      .innerJoin(document, eq(document.id, messageDocument.documentId))
      .where(and(inArray(messageDocument.messageId, messageIds), eq(document.userId, userId))),
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
      .innerJoin(document, eq(document.id, messageCitation.documentId))
      .where(and(inArray(messageCitation.messageId, messageIds), eq(document.userId, userId)))
      .orderBy(asc(messageCitation.ordinal)),
  ]);
  return { links, citations };
};
