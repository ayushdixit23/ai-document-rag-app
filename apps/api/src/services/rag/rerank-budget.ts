import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db/index.js';

// Sliding 31 days is deliberately stricter than a calendar month, without guessing billing resets.
export const reserveRerankCall = async (
  scope: string,
  database: Pick<typeof db, 'execute'> = db,
): Promise<string | null> => {
  // Locking, pruning, and counting happen atomically in one database round trip.
  const rows = await database.execute<{ id: string | null }>(sql`
    select public.reserve_rerank_call(${scope}, ${randomUUID()}) as id
  `);
  return rows[0]?.id ?? null;
};

export const blockRerankCalls = async (
  id: string,
  monthly: boolean,
  database: Pick<typeof db, 'execute'> = db,
): Promise<void> => {
  await database.execute(sql`update rerank_usage set blocked_until = now() +
    ${monthly ? '31 days' : '1 minute'}::interval where id = ${id}`);
};
