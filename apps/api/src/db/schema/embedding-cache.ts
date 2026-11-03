import { pgTable, primaryKey, text, timestamp, vector } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

export const embeddingCache = pgTable(
  'embedding_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    textHash: text('text_hash').notNull(),
    embedding: vector('embedding', { dimensions: 768 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.model, table.textHash] })],
);
