import { fetchThread } from '@/lib/chats/api';
import { errorMessage } from '@/lib/chats/store-helpers';
import type { StoreAccess, StoreRuntime } from '@/lib/chats/store-types';

export function loadOlderMessages(
  store: StoreAccess,
  runtime: StoreRuntime,
  id: string,
): Promise<void> {
  const key = `older:${id}`;
  const pending = runtime.loads.get(key);
  if (pending) return pending;
  const page = store.getState().paginationByChatId[id];
  if (!page?.hasMore || !page.nextCursor) return Promise.resolve();
  const request = fetchOlderMessages(store, runtime, id, page.nextCursor).finally(() => {
    if (runtime.loads.get(key) === request) runtime.loads.delete(key);
  });
  runtime.loads.set(key, request);
  return request;
}

async function fetchOlderMessages(
  store: StoreAccess,
  runtime: StoreRuntime,
  id: string,
  cursor: string,
) {
  const signal = runtime.controller.signal;
  const version = runtime.threadVersions.get(id) ?? 0;
  const current = () => store.getState().paginationByChatId[id];
  const update = (patch: Partial<NonNullable<ReturnType<typeof current>>>) => {
    const page = current();
    if (page?.nextCursor !== cursor || signal.aborted) return;
    store.setState({
      paginationByChatId: { ...store.getState().paginationByChatId, [id]: { ...page, ...patch } },
    });
  };
  update({ loading: true, error: undefined });
  try {
    const thread = await fetchThread(id, signal, cursor);
    if (
      signal.aborted ||
      current()?.nextCursor !== cursor ||
      version !== (runtime.threadVersions.get(id) ?? 0)
    )
      return;
    const state = store.getState();
    const existing = state.messagesByChatId[id] ?? [];
    const known = new Set(existing.map((message) => message.id));
    store.setState({
      messagesByChatId: {
        ...state.messagesByChatId,
        [id]: [...thread.messages.filter((message) => !known.has(message.id)), ...existing],
      },
      documentsById: {
        ...Object.fromEntries(thread.documents.map((document) => [document.id, document])),
        ...state.documentsById,
      },
      paginationByChatId: {
        ...state.paginationByChatId,
        [id]: { ...thread.pageInfo, loading: false },
      },
    });
  } catch (error) {
    update({ error: errorMessage(error) });
  } finally {
    update({ loading: false });
  }
}
