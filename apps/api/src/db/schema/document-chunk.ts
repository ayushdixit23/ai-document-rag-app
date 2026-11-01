import { index, integer, jsonb, pgTable, text, unique, vector } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { document } from './message.js';

export const documentChunk = pgTable(
  'document_chunk',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 768 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index('document_chunk_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    index('document_chunk_user_document_idx').on(table.userId, table.documentId),
    unique('document_chunk_id_document_id_unique').on(table.id, table.documentId),
    unique('document_chunk_document_index_unique').on(table.documentId, table.chunkIndex),
  ],
);
