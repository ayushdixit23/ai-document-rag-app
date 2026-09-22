import { bigint, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { chat } from './chats.js';

export const roleEnum = pgEnum('role', ['user', 'assistant']);

export const message = pgTable('message', {
  id: text('id').primaryKey(),
  content: text('content'),
  role: roleEnum('role').default('user').notNull(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const document = pgTable('document', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const messageDocument = pgTable(
  'message_document',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),

    documentId: text('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      columns: [table.messageId, table.documentId],
    }),
  ],
);
