import { boss, JOB_NAMES } from '../../lib/queue/boss.js';

export const enqueueIngest = async (documentId: string): Promise<void> => {
  await boss.send(JOB_NAMES.INGEST_DOCUMENT, { documentId }, { singletonKey: documentId });
};

export const enqueueSummary = async (chatId: string): Promise<void> => {
  await boss.send(JOB_NAMES.SUMMARIZE_CHAT, { chatId }, { singletonKey: chatId });
};
