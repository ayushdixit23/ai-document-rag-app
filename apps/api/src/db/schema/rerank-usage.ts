import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Shared across API processes; contains no user queries or document text.
export const rerankUsage = pgTable(
  'rerank_usage',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  },
  (table) => [index('rerank_usage_scope_time_idx').on(table.scope, table.dispatchedAt)],
);
