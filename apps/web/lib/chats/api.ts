import { apiFetch } from '@/lib/api';
import type { Chat, Message, MessagePageInfo } from '@/lib/chats/types';
import type { ChatDocument } from '@/lib/documents/types';

export type ChatThread = {
  chat: Chat;
  messages: Message[];
  documents: ChatDocument[];
  pageInfo: MessagePageInfo;
};

const chatPath = (id: string) => `/api/chats/${encodeURIComponent(id)}`;

export const fetchChats = (signal: AbortSignal) =>
  apiFetch<{ chats: Chat[] }>('/api/chats', { signal });

export const createChat = (title: string | undefined, signal: AbortSignal) =>
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

export const generateChatTitle = (id: string, signal: AbortSignal) =>
  apiFetch<{ chat: Chat }>(`${chatPath(id)}/title`, { method: 'POST', signal });

export const deleteChat = (id: string, signal: AbortSignal) =>
  apiFetch(chatPath(id), { method: 'DELETE', signal });

export const fetchThread = (id: string, signal: AbortSignal, before?: string) =>
  apiFetch<ChatThread>(
    `${chatPath(id)}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    { signal, cache: 'no-store' },
  );
