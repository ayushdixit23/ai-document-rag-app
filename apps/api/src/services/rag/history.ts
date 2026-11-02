import { AIMessage, type BaseMessage, HumanMessage, trimMessages } from '@langchain/core/messages';
import { eq, gte, sql } from 'drizzle-orm';

import { message } from '../../db/schema/message.js';
import type { StoredChat, StoredMessage } from '../chats/chat.repository.js';
import { HISTORY_TOKENS } from './config.js';

export const estimateTokens = (text: string): number =>
  Math.ceil(Buffer.byteLength(text, 'utf8') / 3) + 4;

export const afterSummaryCursor = (chat: StoredChat) => {
  if (chat.summarizedUntilMessageId) {
    // Read the original timestamp in SQL to retain PostgreSQL's microsecond precision.
    return sql`(${message.createdAt}, ${message.id}) > (
      select created_at, id from message where id = ${chat.summarizedUntilMessageId}
      and chat_id = ${chat.id}
    )`;
  }
  return chat.summarizedUntil
    ? gte(message.createdAt, chat.summarizedUntil)
    : eq(message.chatId, chat.id);
};

export const recentHistory = async (messages: StoredMessage[]): Promise<BaseMessage[]> => {
  const history = messages.map((item) =>
    item.role === 'user' ? new HumanMessage(item.content ?? '') : new AIMessage(item.content ?? ''),
  );
  return trimMessages(history, {
    maxTokens: HISTORY_TOKENS,
    strategy: 'last',
    allowPartial: true,
    tokenCounter: (items) => items.reduce((sum, item) => sum + estimateTokens(item.text), 0),
  });
};
