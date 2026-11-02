import { ApiError } from '@/lib/api';
import { fetchThread } from '@/lib/chats/api';
import { loadOlderMessages } from '@/lib/chats/older-message-actions';
import { errorMessage, upsertChat } from '@/lib/chats/store-helpers';
import type { ChatActions, StoreAccess, StoreRuntime } from '@/lib/chats/store-types';

export function threadActions(
  store: StoreAccess,
  runtime: StoreRuntime,
): Pick<ChatActions, 'loadThread' | 'loadOlderMessages'> {
  return {
    loadOlderMessages: (id) => loadOlderMessages(store, runtime, id),
    loadThread: (id) => {
      if (store.getState().generatingChatId === id) return Promise.resolve();
      const key = `thread:${id}`;
      const pending = runtime.loads.get(key);
      if (pending) return pending;
      const request = loadThread(store, runtime, id).finally(() => {
        if (runtime.loads.get(key) === request) runtime.loads.delete(key);
      });
      runtime.loads.set(key, request);
      return request;
    },
  };
}

async function loadThread(store: StoreAccess, runtime: StoreRuntime, id: string) {
  const signal = runtime.controller.signal;
  const version = runtime.threadVersions.get(id) ?? 0;
  const { setState: set, getState: get } = store;
  set({ threads: { ...get().threads, [id]: { status: 'loading' } } });
  try {
    const thread = await fetchThread(id, signal);
    if (signal.aborted || version !== (runtime.threadVersions.get(id) ?? 0)) return;
    set({
      chats: upsertChat(get().chats, thread.chat),
      messagesByChatId: { ...get().messagesByChatId, [id]: thread.messages },
      documentsById: {
        ...get().documentsById,
        ...Object.fromEntries(thread.documents.map((doc) => [doc.id, doc])),
      },
      threads: { ...get().threads, [id]: { status: 'ready' } },
      paginationByChatId: {
        ...get().paginationByChatId,
        [id]: { ...thread.pageInfo, loading: false },
      },
    });
  } catch (error) {
    if (signal.aborted || version !== (runtime.threadVersions.get(id) ?? 0)) return;
    set({
      threads: {
        ...get().threads,
        [id]: {
          status: 'error',
          error: errorMessage(error),
          notFound: error instanceof ApiError && error.status === 404,
        },
      },
    });
  }
}
