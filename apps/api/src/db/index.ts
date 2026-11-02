import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { DATABASE_POOL_MAX, DATABASE_PREPARE_STATEMENTS, DATABASE_URL } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { enablePreparedQueries } from './prepared-queries.js';
import * as schema from './schema/index.js';

/** Enable only for a direct connection or a pooler with protocol preparation support. */
const client = postgres(DATABASE_URL, {
  max: DATABASE_POOL_MAX,
  prepare: DATABASE_PREPARE_STATEMENTS,
});
if (DATABASE_PREPARE_STATEMENTS) enablePreparedQueries(client);

export const db = drizzle(client, { schema });

export const connectDb = async (): Promise<void> => {
  try {
    await client`SELECT 1`;
    logger.info({ poolMax: DATABASE_POOL_MAX }, 'PostgreSQL connection established successfully');
  } catch (error) {
    logger.fatal({ err: error }, 'PostgreSQL connection failed');
    process.exit(1);
  }
};

export const disconnectDb = async (): Promise<void> => {
  try {
    await client.end({ timeout: 5 });
    logger.info('PostgreSQL disconnected');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting from PostgreSQL');
  }
};

export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};
