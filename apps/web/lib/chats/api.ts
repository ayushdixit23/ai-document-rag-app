import { apiFetch } from '@/lib/api';
import type { Chat, Message } from '@/lib/chats/types';
import type { ChatDocument } from '@/lib/documents/types';

export type ChatThread = { chat: Chat; messages: Message[]; documents: ChatDocument[] };

const chatPath = (id: string) => `/api/chats/${encodeURIComponent(id)}`;

export const fetchChats = (signal: AbortSignal) =>
  apiFetch<{ chats: Chat[] }>('/api/chats', { signal });

export const createChat = (title: string, signal: AbortSignal) =>
  apiFetch<{ chat: Chat }>('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ title }),
    signal,
  });

export const renameChat = (id: string, title: string, signal: AbortSignal) =>
  apiFetch<{ chat: Chat }>(chatPath(id), {
    method: 'PATCH',
    body: JSON.stringify({ title }),
    signal,
  });

export const deleteChat = (id: string, signal: AbortSignal) =>
  apiFetch(chatPath(id), { method: 'DELETE', signal });

export const fetchThread = (id: string, signal: AbortSignal) =>
  apiFetch<ChatThread>(`${chatPath(id)}/messages`, { signal, cache: 'no-store' });
