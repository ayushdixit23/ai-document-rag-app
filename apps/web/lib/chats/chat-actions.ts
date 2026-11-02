import * as api from '@/lib/chats/api';
import { errorMessage, upsertChat, withoutKey } from '@/lib/chats/store-helpers';
import type { ChatActions, StoreAccess, StoreRuntime } from '@/lib/chats/store-types';

export function chatActions(
  store: StoreAccess,
  runtime: StoreRuntime,
): Pick<ChatActions, 'loadChats' | 'createChat' | 'renameChat' | 'deleteChat'> {
  const { setState: set, getState: get } = store;
  return {
    loadChats: () => {
      const pending = runtime.loads.get('chats');
      if (pending) return pending;
      const signal = runtime.controller.signal;
      set({ chatList: { status: 'loading' } });
      const request = loadChatList(store, runtime, signal).finally(() => {
        if (runtime.loads.get('chats') === request) runtime.loads.delete('chats');
      });
      runtime.loads.set('chats', request);
      return request;
    },
    createChat: async (title) => {
      const signal = runtime.controller.signal;
      const { chat } = await api.createChat(title, signal);
      signal.throwIfAborted();
      runtime.listVersion += 1;
      set({ chats: upsertChat(get().chats, chat) });
      return chat.id;
    },
    renameChat: async (id, title) => {
      const signal = runtime.controller.signal;
      const { chat } = await api.renameChat(id, title.trim(), signal);
      signal.throwIfAborted();
      runtime.listVersion += 1;
      set({ chats: upsertChat(get().chats, chat) });
    },
    deleteChat: async (id) => {
      if (get().generatingChatId === id)
        throw new Error('Wait for the answer before deleting this chat.');
      const signal = runtime.controller.signal;
      await api.deleteChat(id, signal);
      signal.throwIfAborted();
      runtime.listVersion += 1;
      runtime.threadVersions.set(id, (runtime.threadVersions.get(id) ?? 0) + 1);
      set({
        chats: get().chats.filter((chat) => chat.id !== id),
        messagesByChatId: withoutKey(get().messagesByChatId, id),
        threads: withoutKey(get().threads, id),
        paginationByChatId: withoutKey(get().paginationByChatId, id),
      });
    },
  };
}

async function loadChatList(store: StoreAccess, runtime: StoreRuntime, signal: AbortSignal) {
  try {
    let version: number;
    let result: Awaited<ReturnType<typeof api.fetchChats>>;
    do {
      version = runtime.listVersion;
      result = await api.fetchChats(signal);
      signal.throwIfAborted();
    } while (version !== runtime.listVersion);
    store.setState({ chats: result.chats, chatList: { status: 'ready' } });
  } catch (error) {
    if (!signal.aborted)
      store.setState({ chatList: { status: 'error', error: errorMessage(error) } });
  }
}
