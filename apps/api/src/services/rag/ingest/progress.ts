import { sql } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import type { ProcessingProgress } from '../../../db/schema/message.js';
import type { StoredDocument } from '../../documents/document.repository.js';

/** Guard progress with the ingestion version; never change updated_at or regress completed work. */
export const writeIngestProgress = async (
  row: Pick<StoredDocument, 'id' | 'updatedAt'>,
  progress: ProcessingProgress,
  database: Pick<typeof db, 'execute'> = db,
): Promise<void> => {
  await database.execute(sql`update document set processing_progress = ${JSON.stringify(progress)}::jsonb
    where id = ${row.id} and status = 'processing' and updated_at = ${row.updatedAt.toISOString()}
      and coalesce((processing_progress->>'completed')::int, 0) <= ${progress.completed}`);
};
