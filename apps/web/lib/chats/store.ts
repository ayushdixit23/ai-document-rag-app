'use client';

import { createContext, use } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { chatActions } from '@/lib/chats/chat-actions';
import { messageActions } from '@/lib/chats/message-actions';
import { initialChatState, withoutKey } from '@/lib/chats/store-helpers';
import type { ChatStore, ChatStoreApi, StoreRuntime } from '@/lib/chats/store-types';
import { threadActions } from '@/lib/chats/thread-actions';
import { reconcileDocument } from '@/lib/documents/reconcile';

export function createChatStore() {
  const runtime: StoreRuntime = {
    controller: new AbortController(),
    streamController: null,
    loads: new Map(),
    threadVersions: new Map(),
    listVersion: 0,
  };
  return createStore<ChatStore>()((set, get) => {
    const access = { setState: set, getState: get };
    return {
      ...initialChatState(),
      ...chatActions(access, runtime),
      ...threadActions(access, runtime),
      ...messageActions(access, runtime),
      setDocument: (document) => {
        const documents = get().documentsById;
        const next = reconcileDocument(documents[document.id], document);
        if (next !== documents[document.id])
          set({ documentsById: { ...documents, [document.id]: next } });
      },
      removeDocument: (id) => {
        set({
          documentsById: withoutKey(get().documentsById, id),
          messagesByChatId: Object.fromEntries(
            Object.entries(get().messagesByChatId).map(([chatId, messages]) => [
              chatId,
              messages.map((message) => ({
                ...message,
                documentIds: message.documentIds.filter((value) => value !== id),
                citations: message.citations.filter((citation) => citation.documentId !== id),
              })),
            ]),
          ),
        });
      },
      reset: () => {
        runtime.controller.abort();
        runtime.streamController?.abort();
        runtime.streamController = null;
        runtime.controller = new AbortController();
        runtime.loads.clear();
        runtime.threadVersions.clear();
        runtime.listVersion = 0;
        set(initialChatState());
      },
    };
  });
}

export const ChatStoreContext = createContext<ChatStoreApi | null>(null);

export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const store = use(ChatStoreContext);
  if (!store) throw new Error('ChatStoreProvider is missing');
  return useStore(store, selector);
}
