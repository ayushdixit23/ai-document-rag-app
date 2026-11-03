import { setDocumentStatus } from '@/lib/chats/document-events';
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
      setDocumentStatus(store, event.data.processingDocumentIds, 'processing');
      break;
    case 'sources':
      patch({ sourceCandidates: event.data, phase: 'answering' });
      break;
    case 'status':
      patch({ phase: event.data.phase });
      if (event.data.phase === 'answering')
        setDocumentStatus(store, event.data.documentIds, 'ready', event.data.documentVersions);
      break;
    case 'token': {
      const current = messages.find((message) => message.id === ids.assistant);
      patch({ content: (current?.content ?? '') + event.data.text, phase: 'answering' });
      break;
    }
    case 'done':
      patch({
        id: event.data.assistantMessageId,
        citations: event.data.citations,
        sourceCandidates: undefined,
        status: undefined,
        phase: undefined,
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
