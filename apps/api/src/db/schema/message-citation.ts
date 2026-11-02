import { foreignKey, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { documentChunk } from './document-chunk.js';
import { document, message } from './message.js';

export const messageCitation = pgTable(
  'message_citation',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    chunkId: text('chunk_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    page: integer('page'),
    snippet: text('snippet').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.ordinal] }),
    index('message_citation_document_idx').on(table.documentId),
    index('message_citation_chunk_document_idx').on(table.chunkId, table.documentId),
    foreignKey({
      columns: [table.chunkId, table.documentId],
      foreignColumns: [documentChunk.id, documentChunk.documentId],
    }).onDelete('cascade'),
  ],
);
