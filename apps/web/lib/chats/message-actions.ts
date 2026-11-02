import { applyMessageEvent } from '@/lib/chats/message-events';
import { createPendingTurn } from '@/lib/chats/pending-turn';
import { errorMessage, patchMessage, upsertChat } from '@/lib/chats/store-helpers';
import type { ChatActions, StoreAccess, StoreRuntime } from '@/lib/chats/store-types';
import { streamMessage } from '@/lib/chats/stream';
import { createTokenBuffer } from '@/lib/chats/token-buffer';
import type { SendMessageInput } from '@/lib/chats/types';

function beginTurn(store: StoreAccess, id: string, input: SendMessageInput) {
  const [user, assistant] = createPendingTurn(id, input);
  const state = store.getState();
  store.setState({
    generatingChatId: id,
    threads: { ...state.threads, [id]: { status: 'ready' } },
    messagesByChatId: {
      ...state.messagesByChatId,
      [id]: [...(state.messagesByChatId[id] ?? []), user, assistant],
    },
  });
  return { user: user.id, assistant: assistant.id };
}

async function runTurn(
  store: StoreAccess,
  runtime: StoreRuntime,
  id: string,
  input: SendMessageInput,
) {
  const lifetime = runtime.controller.signal;
  const controller = new AbortController();
  runtime.streamController = controller;
  const signal = controller.signal;
  runtime.threadVersions.set(id, (runtime.threadVersions.get(id) ?? 0) + 1);
  runtime.listVersion += 1;
  const ids = beginTurn(store, id, input);
  const tokens = createTokenBuffer((text) => {
    if (!lifetime.aborted) applyMessageEvent(store, id, ids, { event: 'token', data: { text } });
  });
  try {
    await streamMessage(
      id,
      input,
      (event) => {
        if (signal.aborted) return;
        if (event.event === 'token') tokens.append(event.data.text);
        else {
          tokens.flush();
          applyMessageEvent(store, id, ids, event);
        }
      },
      signal,
    );
    if (lifetime.aborted) return;
    const chat = store.getState().chats.find((chat) => chat.id === id);
    if (chat)
      store.setState({
        chats: upsertChat(store.getState().chats, { ...chat, updatedAt: new Date().toISOString() }),
      });
  } catch (error) {
    if (lifetime.aborted) return;
    tokens.flush();
    const state = store.getState();
    store.setState({
      messagesByChatId: {
        ...state.messagesByChatId,
        [id]: patchMessage(state.messagesByChatId[id] ?? [], ids.assistant, {
          status: signal.aborted ? 'stopped' : 'error',
          error: signal.aborted ? 'Response stopped.' : errorMessage(error),
        }),
      },
    });
  } finally {
    tokens.dispose();
    if (runtime.streamController === controller) {
      runtime.streamController = null;
      if (!lifetime.aborted) store.setState({ generatingChatId: null });
    }
  }
}

export function messageActions(
  store: StoreAccess,
  runtime: StoreRuntime,
): Pick<ChatActions, 'sendMessage' | 'retryMessage' | 'stopGenerating'> {
  return {
    stopGenerating: (id) => {
      if (store.getState().generatingChatId === id) runtime.streamController?.abort();
    },
    sendMessage: (id, input) => {
      if (store.getState().generatingChatId || (!input.content.trim() && !input.documentIds.length))
        return;
      void runTurn(store, runtime, id, { ...input, content: input.content.trim() });
    },
    retryMessage: async (id, messageId) => {
      if (store.getState().generatingChatId) return;
      const input = store
        .getState()
        .messagesByChatId[id]?.find((message) => message.id === messageId)?.retryInput;
      if (!input) return;
      // A retry starts a new turn; first reconcile anything persisted before a disconnect.
      await store.getState().loadThread(id);
      if (store.getState().threads[id]?.status !== 'ready')
        throw new Error('Could not refresh the conversation. Please retry.');
      store.getState().sendMessage(id, input);
    },
  };
}
