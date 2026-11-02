import type { StoredMessage } from '../../chats/chat.repository.js';
import { HISTORY_TOKENS, SUMMARY_TRIGGER_TOKENS } from '../config.js';
import { estimateTokens, historyText } from '../history.js';

export const messagesToFold = (
  messages: StoredMessage[],
  trigger = SUMMARY_TRIGGER_TOKENS,
  keep = HISTORY_TOKENS,
): StoredMessage[] => {
  const costs = messages.map((item) => estimateTokens(historyText(item)));
  if (costs.reduce((sum, cost) => sum + cost, 0) <= trigger) return [];
  let retained = 0;
  let boundary = messages.length;
  while (boundary > 0) {
    const cost = costs[boundary - 1] ?? 0;
    if (retained > 0 && retained + cost > keep) break;
    retained += cost;
    boundary -= 1;
  }
  // Keep a user question with its assistant answer across the fold boundary.
  while (boundary > 0 && messages[boundary]?.role === 'assistant') boundary -= 1;
  return messages.slice(0, boundary);
};
