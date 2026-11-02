import { and, desc, eq, sql } from 'drizzle-orm';

import type { db } from '../../db/index.js';
import { message } from '../../db/schema/message.js';

export const MESSAGE_PAGE_SIZE = 15;

export const messagePageQuery = (
  database: Pick<typeof db, 'select'>,
  chatId: string,
  before?: string,
) =>
  database
    .select()
    .from(message)
    .where(
      and(
        eq(message.chatId, chatId),
        before
          ? sql`
    (${message.createdAt}, ${message.id}) < (
      select cursor.created_at, cursor.id from message as cursor
      where cursor.id = ${before} and cursor.chat_id = ${chatId}
    )`
          : undefined,
      ),
    )
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(MESSAGE_PAGE_SIZE + 1);

export const messagePage = <T extends { id: string }>(rows: T[]) => {
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  const messages = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();
  return {
    messages,
    pageInfo: { hasMore, nextCursor: hasMore ? (messages[0]?.id ?? null) : null },
  };
};
