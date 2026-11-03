import { sql } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import { documentChunk } from '../../../db/schema/document-chunk.js';
import { document } from '../../../db/schema/message.js';
import type { StoredDocument } from '../../documents/document.repository.js';

const INSERT_BATCH_SIZE = 500;

export const saveChunks = async (
  row: StoredDocument,
  values: (typeof documentChunk.$inferInsert)[],
  pageCount: number | null,
  database: Pick<typeof db, 'transaction'> = db,
): Promise<void> => {
  await database.transaction(async (tx) => {
    // The conditional update locks the ingestion version until all chunks commit.
    const claimed = await tx.execute<{ id: string }>(sql`with claimed as (
      update ${document} set status = 'ready', page_count = ${pageCount},
        chunk_count = ${values.length}, error_message = null, processing_progress = null,
        updated_at = clock_timestamp()
      where id = ${row.id} and status = 'processing' and updated_at = ${row.updatedAt.toISOString()}
      returning id
    ), removed as (
      delete from ${documentChunk} using claimed where ${documentChunk.documentId} = claimed.id
    ) select id from claimed`);
    if (!claimed.length) return;
    for (let offset = 0; offset < values.length; offset += INSERT_BATCH_SIZE)
      await tx.insert(documentChunk).values(values.slice(offset, offset + INSERT_BATCH_SIZE));
  });
};
