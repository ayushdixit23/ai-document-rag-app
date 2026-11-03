import type { StoreAccess } from '@/lib/chats/store-types';

export function setDocumentStatus(
  store: StoreAccess,
  ids: string[],
  status: 'processing' | 'ready',
  versions: { id: string; updatedAt: string }[] = [],
) {
  for (const id of ids) {
    const document = store.getState().documentsById[id];
    if (!document) continue;
    if (status === 'processing' && ['ready', 'failed'].includes(document.status)) continue;
    store.getState().setDocument({
      ...document,
      status,
      errorMessage: status === 'ready' ? null : document.errorMessage,
      processingProgress: status === 'ready' ? null : document.processingProgress,
      updatedAt: versions.find((row) => row.id === id)?.updatedAt ?? document.updatedAt,
    });
  }
}
