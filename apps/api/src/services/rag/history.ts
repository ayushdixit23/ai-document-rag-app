import { AIMessage, type BaseMessage, HumanMessage, trimMessages } from '@langchain/core/messages';
import { eq, gte, sql } from 'drizzle-orm';

import { message } from '../../db/schema/message.js';
import type { StoredChat, StoredMessage } from '../chats/chat.repository.js';
import { PROMPT_HISTORY_TOKENS } from './config.js';

export const estimateTokens = (text: string): number =>
  Math.ceil(Buffer.byteLength(text, 'utf8') / 3) + 4;

export const historyText = (item: Pick<StoredMessage, 'content' | 'documentNames'>): string =>
  (item.content ?? '') +
  (item.documentNames?.length ? `\nAttached documents: ${JSON.stringify(item.documentNames)}` : '');

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

export const recentHistory = async (
  messages: StoredMessage[],
  maxTokens = PROMPT_HISTORY_TOKENS,
): Promise<BaseMessage[]> => {
  const history = messages.map((item) =>
    item.role === 'user' ? new HumanMessage(historyText(item)) : new AIMessage(historyText(item)),
  );
  return trimMessages(history, {
    maxTokens,
    strategy: 'last',
    allowPartial: true,
    tokenCounter: (items) => items.reduce((sum, item) => sum + estimateTokens(item.text), 0),
  });
};
