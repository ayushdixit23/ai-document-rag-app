import { PgBoss } from 'pg-boss';

import { DATABASE_URL_DIRECT } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const JOB_NAMES = {
  INGEST_DOCUMENT: 'ingest-document',
  SUMMARIZE_CHAT: 'summarize-chat',
  STALE_UPLOAD_CLEANUP: 'stale-upload-cleanup',
} as const;

export const boss = new PgBoss({ connectionString: DATABASE_URL_DIRECT });
boss.on('error', (error) => {
  logger.error({ err: error }, 'pg-boss error');
});

let started = false;

export const startBoss = async (): Promise<void> => {
  await boss.start();
  started = true;
  logger.info('pg-boss started');
};

export const stopBoss = async (): Promise<void> => {
  if (!started) return;
  await boss.stop({ graceful: true, timeout: 5_000 });
  started = false;
  logger.info('pg-boss stopped');
};
