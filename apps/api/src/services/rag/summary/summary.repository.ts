import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';

import type { db } from '../../../db/index.js';
import { chat } from '../../../db/schema/chats.js';
import { message } from '../../../db/schema/message.js';
import type { StoredChat } from '../../chats/chat.repository.js';
import { documentNamesSql } from '../../chats/document-context.js';
import { afterSummaryCursor } from '../history.js';

type SummaryDatabase = Pick<typeof db, 'select' | 'update'>;
export interface SummaryWrite {
  started: StoredChat;
  cursorId: string;
  summary: string;
}

export const loadSummaryChat = async (database: SummaryDatabase, chatId: string) => {
  const [row] = await database.select().from(chat).where(eq(chat.id, chatId));
  return row;
};

export const loadUnsummarizedMessages = (database: SummaryDatabase, started: StoredChat) =>
  database
    .select({ ...getTableColumns(message), documentNames: documentNamesSql })
    .from(message)
    .where(and(eq(message.chatId, started.id), afterSummaryCursor(started)))
    .orderBy(asc(message.createdAt), asc(message.id));

export const summaryUpdate = (
  database: SummaryDatabase,
  { started, cursorId, summary }: SummaryWrite,
) =>
  database
    .update(chat)
    .set({
      summary,
      // Keep the exact timestamp in SQL; never round-trip a cursor through a JS Date.
      summarizedUntil: sql`(select ${message.createdAt} from ${message}
        where ${message.id} = ${cursorId} and ${message.chatId} = ${started.id})`,
      summarizedUntilMessageId: cursorId,
      updatedAt: sql`${chat.updatedAt}`,
    })
    .where(
      and(
        eq(chat.id, started.id),
        sql`${chat.summarizedUntilMessageId} is not distinct from ${started.summarizedUntilMessageId}`,
      ),
    )
    .returning({ id: chat.id });

export const saveSummary = async (
  database: SummaryDatabase,
  write: SummaryWrite,
): Promise<boolean> => {
  const rows = await summaryUpdate(database, write);
  return rows.length === 1;
};
