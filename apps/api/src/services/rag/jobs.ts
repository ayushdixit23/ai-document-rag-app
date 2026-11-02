import { boss, JOB_NAMES } from '../../lib/queue/boss.js';
import { logger } from '../../utils/logger.js';

export const enqueueIngest = async (documentId: string): Promise<void> => {
  await boss.send(JOB_NAMES.INGEST_DOCUMENT, { documentId }, { singletonKey: documentId });
};

export const enqueueSummary = async (chatId: string): Promise<void> => {
  const jobId = await boss.send(JOB_NAMES.SUMMARIZE_CHAT, { chatId }, { singletonKey: chatId });
  logger.debug({ chatId, jobId, outcome: jobId ? 'queued' : 'coalesced' }, 'Chat summary enqueue');
};
