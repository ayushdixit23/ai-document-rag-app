import { randomUUID } from 'node:crypto';

import { eq, lt, sql } from 'drizzle-orm';

import {
  AI_CHAT_CONCURRENT_REQUESTS,
  AI_CHAT_REQUESTS_PER_DAY,
  AI_CHAT_REQUESTS_PER_MINUTE,
} from '../../config/env.js';
import { db } from '../../db/index.js';
import { aiChatRequest } from '../../db/schema/ai-chat-request.js';

export type ChatAdmission = {
  request_id: string | null;
  reason: 'day' | 'minute' | 'concurrent' | null;
  retry_after: number;
};

/** One atomic database call covers all windows and active turns across API instances. */
export const reserveChatRequest = async (userId: string): Promise<ChatAdmission> => {
  const [result] = await db.execute<ChatAdmission>(sql`
    select * from public.reserve_ai_chat_request(${userId}, ${randomUUID()},
      ${AI_CHAT_REQUESTS_PER_MINUTE}, ${AI_CHAT_REQUESTS_PER_DAY}, ${AI_CHAT_CONCURRENT_REQUESTS})
  `);
  if (!result) throw new Error('AI request admission unavailable.');
  return result;
};

export const releaseChatRequest = async (id: string): Promise<void> => {
  await db.update(aiChatRequest).set({ activeUntil: null }).where(eq(aiChatRequest.id, id));
};

export const pruneChatRequests = async (): Promise<void> => {
  await db
    .delete(aiChatRequest)
    .where(lt(aiChatRequest.startedAt, sql`now() - interval '24 hours'`));
};
