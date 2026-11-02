import type { ChatState } from '@/lib/chats/store-types';
import type { Chat, Message } from '@/lib/chats/types';

export const initialChatState = (): ChatState => ({
  chats: [],
  chatList: { status: 'idle' },
  threads: {},
  messagesByChatId: {},
  documentsById: {},
  generatingChatId: null,
});

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please retry.';

export const upsertChat = (chats: Chat[], chat: Chat): Chat[] =>
  [...chats.filter((item) => item.id !== chat.id), chat].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id),
  );

export const withoutKey = <T>(record: Record<string, T>, id: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== id));

export const patchMessage = (messages: Message[], id: string, patch: Partial<Message>): Message[] =>
  messages.map((message) => (message.id === id ? { ...message, ...patch } : message));
