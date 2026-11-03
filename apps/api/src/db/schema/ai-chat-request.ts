import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

/** Shared admission records contain no prompts, responses, or personalization text. */
export const aiChatRequest = pgTable(
  'ai_chat_request',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    activeUntil: timestamp('active_until', { withTimezone: true }),
  },
  (table) => [index('ai_chat_request_user_time_idx').on(table.userId, table.startedAt)],
);
