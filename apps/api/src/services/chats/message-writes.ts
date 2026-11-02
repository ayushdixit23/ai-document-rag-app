import { eq } from 'drizzle-orm';

import type { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { message } from '../../db/schema/message.js';

type MessageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Pipeline independent writes; links/citations still wait for the message's foreign key. */
export async function insertMessageRow(
  tx: MessageTransaction,
  values: typeof message.$inferInsert,
): Promise<void> {
  await Promise.all([
    tx.insert(message).values(values),
    tx.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, values.chatId)),
  ]);
}
