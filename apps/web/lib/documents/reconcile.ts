import { type ChatDocument, isDocumentProcessing } from '@/lib/documents/types';

/** Polls that started before indexing finished must not regress a newer stream update. */
export function reconcileDocument(current: ChatDocument | undefined, incoming: ChatDocument) {
  if (!current?.updatedAt || !incoming.updatedAt) return incoming;
  const currentVersion = Date.parse(current.updatedAt);
  const incomingVersion = Date.parse(incoming.updatedAt);
  if (incomingVersion < currentVersion) return current;
  if (
    incomingVersion === currentVersion &&
    ['ready', 'failed'].includes(current.status) &&
    isDocumentProcessing(incoming.status)
  )
    return current;
  return incoming;
}
