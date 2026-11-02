import type { StoredChat, StoredMessage } from '../../chats/chat.repository.js';
import { estimateTokens } from '../history.js';
import { messagesToFold } from './fold.js';
import type { SummaryWrite } from './summary.repository.js';

export interface SummaryInput {
  previousSummary: string | null;
  messages: Pick<StoredMessage, 'role' | 'content'>[];
}
export interface SummaryEvent {
  chatId: string;
  outcome: 'skipped' | 'wrote' | 'conflict';
  reason?: 'chat-missing' | 'nothing-to-fold';
  unsummarizedTokens?: number;
  foldedMessages?: number;
  cursorId?: string;
}
export interface SummaryDependencies {
  loadChat: (chatId: string) => Promise<StoredChat | undefined>;
  loadMessages: (started: StoredChat) => Promise<StoredMessage[]>;
  generate: (input: SummaryInput) => Promise<string>;
  save: (write: SummaryWrite) => Promise<boolean>;
  log: (event: SummaryEvent) => void;
}

export const runSummaryPipeline = async (
  chatId: string,
  deps: SummaryDependencies,
): Promise<void> => {
  const started = await deps.loadChat(chatId);
  if (!started) {
    deps.log({ chatId, outcome: 'skipped', reason: 'chat-missing' });
    return;
  }
  const messages = await deps.loadMessages(started);
  const folded = messagesToFold(messages);
  const cursor = folded.at(-1);
  const unsummarizedTokens = messages.reduce(
    (sum, item) => sum + estimateTokens(item.content ?? ''),
    0,
  );
  if (!cursor) {
    deps.log({ chatId, outcome: 'skipped', reason: 'nothing-to-fold', unsummarizedTokens });
    return;
  }
  const summary = await deps.generate({
    previousSummary: started.summary,
    messages: folded.map(({ role, content }) => ({ role, content })),
  });
  if (!summary.trim()) throw new Error('Summary model returned no text.');
  const saved = await deps.save({ started, cursorId: cursor.id, summary });
  const event = { chatId, unsummarizedTokens, foldedMessages: folded.length, cursorId: cursor.id };
  if (!saved) {
    deps.log({ ...event, outcome: 'conflict' });
    throw new Error('Summary cursor changed before saving; retry with fresh conversation state.');
  }
  deps.log({ ...event, outcome: 'wrote' });
};
