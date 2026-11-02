import { generateChatTitle } from '@/lib/chats/api';
import { upsertChat } from '@/lib/chats/store-helpers';
import type { StoreAccess, StoreRuntime } from '@/lib/chats/store-types';

/** This request has its own lifetime and never holds the answer stream open. */
export function requestChatTitle(store: StoreAccess, runtime: StoreRuntime, id: string) {
  const key = `title:${id}`;
  if (
    !store.getState().chats.find((chat) => chat.id === id)?.titlePending ||
    runtime.loads.has(key)
  )
    return;
  const lifetime = runtime.controller.signal;
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(15_000)]);
  const request = generateChatTitle(id, signal)
    .then(({ chat }) => {
      const current = store.getState().chats.find((chat) => chat.id === id);
      if (lifetime.aborted || !current?.titlePending) return;
      runtime.listVersion += 1;
      store.setState({
        chats: upsertChat(store.getState().chats, {
          ...current,
          title: chat.title,
          titlePending: chat.titlePending,
        }),
      });
    })
    .catch(() => {
      // Naming is optional. Keep the chat usable and retry after a later turn.
    })
    .finally(() => {
      if (runtime.loads.get(key) === request) runtime.loads.delete(key);
    });
  runtime.loads.set(key, request);
}
