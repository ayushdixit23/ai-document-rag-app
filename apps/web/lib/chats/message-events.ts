import { patchMessage } from '@/lib/chats/store-helpers';
import type { StoreAccess } from '@/lib/chats/store-types';
import type { StreamEvent } from '@/lib/chats/stream-events';
import type { Message } from '@/lib/chats/types';

export function applyMessageEvent(
  store: StoreAccess,
  chatId: string,
  ids: { user: string; assistant: string },
  event: StreamEvent,
) {
  const state = store.getState();
  let messages = state.messagesByChatId[chatId] ?? [];
  const patch = (value: Partial<Message>) => {
    messages = patchMessage(messages, ids.assistant, value);
  };
  switch (event.event) {
    case 'meta':
      messages = patchMessage(messages, ids.user, { id: event.data.userMessageId });
      for (const id of event.data.processingDocumentIds) {
        const doc = state.documentsById[id];
        if (doc && doc.status !== 'ready' && doc.status !== 'failed') {
          state.setDocument({ ...doc, status: 'processing' });
        }
      }
      break;
    case 'sources':
      patch({ citations: event.data });
      break;
    case 'token': {
      const current = messages.find((message) => message.id === ids.assistant);
      patch({ content: (current?.content ?? '') + event.data.text });
      break;
    }
    case 'done':
      patch({
        id: event.data.assistantMessageId,
        citations: event.data.citations,
        status: undefined,
        retryInput: undefined,
      });
      break;
    case 'error':
      break;
  }
  store.setState({
    messagesByChatId: { ...store.getState().messagesByChatId, [chatId]: messages },
  });
}
