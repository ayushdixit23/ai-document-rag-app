import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { document, message, messageDocument } from '../../db/schema/message.js';
import { ownedChatFilter } from './chat.repository.js';

export const loadTitleContext = async (userId: string, id: string) => {
  const first = db.$with('first_user').as(
    db
      .select({ id: message.id, content: message.content })
      .from(message)
      .where(and(eq(message.chatId, id), eq(message.role, 'user')))
      .orderBy(asc(message.createdAt), asc(message.id))
      .limit(1),
  );
  const [row] = await db
    .with(first)
    .select({
      chat,
      firstId: first.id,
      content: first.content,
      documentNames: sql<
        string[]
      >`coalesce((select jsonb_agg(${document.name} order by ${document.name})
      from ${messageDocument} inner join ${document} on ${document.id} = ${messageDocument.documentId}
      where ${messageDocument.messageId} = ${first.id} and ${document.userId} = ${userId}), '[]'::jsonb)`,
    })
    .from(chat)
    .leftJoin(first, sql`true`)
    .where(ownedChatFilter(userId, id));
  return row;
};
