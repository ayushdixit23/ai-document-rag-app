import { boss, JOB_NAMES } from '../../../lib/queue/boss.js';
import { summarizeChat } from './summarize-chat.js';

export const registerSummaryWorker = async (): Promise<void> => {
  // One active job and one waiting job per chat, even across API instances.
  await boss.createQueue(JOB_NAMES.SUMMARIZE_CHAT, {
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 30,
  });
  await boss.work<{ chatId: string }>(JOB_NAMES.SUMMARIZE_CHAT, async (jobs) => {
    for (const job of jobs) await summarizeChat(job.data.chatId);
  });
};
