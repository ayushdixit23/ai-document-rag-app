import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

export const chat = pgTable(
  'chat',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    titlePending: boolean('title_pending').default(false).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    summary: text('summary'),
    summarizedUntil: timestamp('summarized_until'),
    summarizedUntilMessageId: text('summarized_until_message_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('chat_user_updated_idx').on(
      table.userId,
      table.updatedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
  ],
);
