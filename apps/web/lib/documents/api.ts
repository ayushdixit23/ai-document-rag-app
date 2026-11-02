import { apiFetch } from '@/lib/api';
import type { ChatDocument, UploadReservation } from '@/lib/documents/types';

const documentPath = (id: string) => `/api/documents/${encodeURIComponent(id)}`;

export const reserveUpload = (file: File, mimeType: string, signal: AbortSignal) =>
  apiFetch<{ uploads: UploadReservation[] }>('/api/documents/uploads', {
    method: 'POST',
    body: JSON.stringify({ files: [{ name: file.name, size: file.size, mimeType }] }),
    signal,
  });

export const fetchDocument = (id: string, signal: AbortSignal) =>
  apiFetch<{ document: ChatDocument }>(documentPath(id), { signal, cache: 'no-store' });

export const completeUpload = (id: string, signal: AbortSignal) =>
  apiFetch<{ document: ChatDocument }>(`${documentPath(id)}/complete`, {
    method: 'POST',
    signal,
  });

export const retryDocument = (id: string, signal: AbortSignal) =>
  apiFetch<{ document: ChatDocument }>(`${documentPath(id)}/retry`, { method: 'POST', signal });

export const deleteDocument = (id: string, signal?: AbortSignal) =>
  apiFetch(documentPath(id), { method: 'DELETE', signal });
