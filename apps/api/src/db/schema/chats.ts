import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

export const chat = pgTable('chat', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
