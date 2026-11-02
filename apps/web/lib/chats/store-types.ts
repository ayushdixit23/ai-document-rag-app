import type { StoreApi } from 'zustand/vanilla';

import type { Chat, Message, MessagePageInfo, SendMessageInput } from '@/lib/chats/types';
import type { ChatDocument } from '@/lib/documents/types';

export type LoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  notFound?: boolean;
};

export type ChatState = {
  chats: Chat[];
  chatList: LoadState;
  threads: Record<string, LoadState>;
  paginationByChatId: Record<string, HistoryPageState>;
  messagesByChatId: Record<string, Message[]>;
  documentsById: Record<string, ChatDocument>;
  generatingChatId: string | null;
};

export type ChatActions = {
  loadChats: () => Promise<void>;
  loadThread: (chatId: string) => Promise<void>;
  loadOlderMessages: (chatId: string) => Promise<void>;
  createChat: (title?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  sendMessage: (chatId: string, input: SendMessageInput) => void;
  retryMessage: (chatId: string, messageId: string) => Promise<void>;
  stopGenerating: (chatId: string) => void;
  setDocument: (document: ChatDocument) => void;
  removeDocument: (id: string) => void;
  reset: () => void;
};

export type ChatStore = ChatState & ChatActions;
export type HistoryPageState = MessagePageInfo & { loading: boolean; error?: string };
export type ChatStoreApi = StoreApi<ChatStore>;
export type StoreAccess = Pick<ChatStoreApi, 'setState' | 'getState'>;

export type StoreRuntime = {
  controller: AbortController;
  streamController: AbortController | null;
  loads: Map<string, Promise<void>>;
  threadVersions: Map<string, number>;
  listVersion: number;
};
