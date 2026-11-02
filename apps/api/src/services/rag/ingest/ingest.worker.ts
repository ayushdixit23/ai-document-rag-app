import { boss, JOB_NAMES } from '../../../lib/queue/boss.js';
import { ingestDocument } from './ingest-document.js';

export const registerIngestWorker = async (): Promise<void> => {
  await boss.createQueue(JOB_NAMES.INGEST_DOCUMENT, {
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 30,
    expireInSeconds: 900,
  });
  await boss.work<{ documentId: string }>(JOB_NAMES.INGEST_DOCUMENT, async (jobs) => {
    for (const job of jobs) await ingestDocument(job.data.documentId);
  });
};
