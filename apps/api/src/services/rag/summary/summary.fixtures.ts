import type { StoredChat, StoredMessage } from '../../chats/chat.repository.js';
import type { SummaryDependencies, SummaryEvent, SummaryInput } from './summary-pipeline.js';

const initialChat = (): StoredChat => ({
  id: 'chat',
  userId: 'user',
  title: 'title',
  summary: null,
  summarizedUntil: null,
  summarizedUntilMessageId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

export const makeSummaryHarness = () => {
  let current = initialChat();
  const messages: StoredMessage[] = [];
  const inputs: SummaryInput[] = [];
  const events: SummaryEvent[] = [];
  const append = (count: number) => {
    for (let index = 0; index < count; index += 1) {
      const id = String(messages.length).padStart(3, '0');
      messages.push({
        id,
        chatId: 'chat',
        role: 'user',
        content: 'x'.repeat(1800),
        createdAt: new Date(messages.length),
        updatedAt: new Date(messages.length),
      });
    }
  };
  const dependencies: SummaryDependencies = {
    loadChat: () => Promise.resolve({ ...current }),
    loadMessages: (started) =>
      Promise.resolve(
        messages.filter(
          (item) => !started.summarizedUntilMessageId || item.id > started.summarizedUntilMessageId,
        ),
      ),
    generate: (input) => {
      inputs.push(input);
      return Promise.resolve(`Summary ${String(inputs.length)}`);
    },
    save: ({ started, cursorId, summary }) => {
      if (started.summarizedUntilMessageId !== current.summarizedUntilMessageId)
        return Promise.resolve(false);
      current = {
        ...current,
        summary,
        summarizedUntilMessageId: cursorId,
        summarizedUntil: messages.find((item) => item.id === cursorId)?.createdAt ?? null,
      };
      return Promise.resolve(true);
    },
    log: (event) => {
      events.push(event);
    },
  };
  return {
    append,
    inputs,
    events,
    dependencies,
    get current() {
      return current;
    },
  };
};
