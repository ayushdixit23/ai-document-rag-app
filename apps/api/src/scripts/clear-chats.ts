/**
 * Wipe chat/RAG rows (keeps schema, indexes, and auth).
 *
 * Truncates chats, messages, documents, chunks, citations, and rerank usage.
 * Index definitions stay; only the rows they pointed at are removed.
 * Does not touch user, session, account, verification, or user_preferences.
 *
 * Usage:
 *   pnpm db:clear:chats
 *   pnpm db:clear:chats -- --force   # required when NODE_ENV=production
 */
import { getTableName, sql } from 'drizzle-orm';

import { NODE_ENV } from '../config/env.js';
import { db, disconnectDb } from '../db/index.js';
import {
  chat,
  document,
  documentChunk,
  message,
  messageCitation,
  messageDocument,
  rerankUsage,
} from '../db/schema/index.js';
import { logger } from '../utils/logger.js';

const TABLES = [
  messageCitation,
  messageDocument,
  documentChunk,
  message,
  document,
  chat,
  rerankUsage,
] as const;

const clearChats = async (): Promise<void> => {
  const force = process.argv.includes('--force');

  if (NODE_ENV === 'production' && !force) {
    throw new Error('Refusing to clear chats in production. Pass --force to override.');
  }

  const tableNames = TABLES.map((table) => `"${getTableName(table)}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY`));

  logger.info(
    { tables: TABLES.map((table) => getTableName(table)) },
    'Chat data cleared (auth unchanged)',
  );
};

clearChats()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'Failed to clear chat data');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
