import { and, eq, lt } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { document } from '../../db/schema/message.js';
import { boss, JOB_NAMES } from '../../lib/queue/boss.js';
import { deleteObject } from '../../lib/storage/r2.js';
import { logger } from '../../utils/logger.js';
import { pruneChatRequests } from '../ai/chat-admission.js';
import { enqueueIngest } from '../rag/jobs.js';
import { objectRef } from './document.repository.js';

const HOUR_MS = 60 * 60 * 1_000;

export const cleanupStaleUploads = async (): Promise<void> => {
  await pruneChatRequests();
  const stale = await db
    .select()
    .from(document)
    .where(
      and(eq(document.status, 'uploading'), lt(document.createdAt, new Date(Date.now() - HOUR_MS))),
    );
  for (const row of stale) {
    try {
      // The row lock prevents completion from racing cleanup's storage deletion.
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(document)
          .where(and(eq(document.id, row.id), eq(document.status, 'uploading')))
          .for('update');
        if (!current) return;
        await deleteObject(objectRef(current));
        await tx.delete(document).where(eq(document.id, row.id));
      });
    } catch (error) {
      logger.error({ err: error, documentId: row.id }, 'Stale upload cleanup failed');
    }
  }
  // Recover a crash between pending and enqueue, or an interrupted/expired worker.
  await db
    .update(document)
    .set({ status: 'pending' })
    .where(
      and(
        eq(document.status, 'processing'),
        lt(document.updatedAt, new Date(Date.now() - HOUR_MS)),
      ),
    );
  const pending = await db
    .select({ id: document.id })
    .from(document)
    .where(eq(document.status, 'pending'));
  for (const row of pending) await enqueueIngest(row.id);
};

export const registerCleanupWorker = async (): Promise<void> => {
  await boss.createQueue(JOB_NAMES.STALE_UPLOAD_CLEANUP, { policy: 'exclusive', retryLimit: 2 });
  await boss.work(JOB_NAMES.STALE_UPLOAD_CLEANUP, cleanupStaleUploads);
  await boss.schedule(JOB_NAMES.STALE_UPLOAD_CLEANUP, '*/10 * * * *');
};
