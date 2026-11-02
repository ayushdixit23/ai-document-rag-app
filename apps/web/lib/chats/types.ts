export type Citation = {
  n: number;
  documentId: string;
  title: string;
  page: number | null;
  snippet?: string;
};

export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  clientId?: string;
  chatId: string;
  role: MessageRole;
  content: string | null;
  createdAt: string;
  documentIds: string[];
  citations: Citation[];
  sourceCandidates?: Citation[];
  status?: 'streaming' | 'error' | 'stopped';
  phase?: 'reading_documents' | 'answering';
  error?: string;
  retryInput?: SendMessageInput;
};

export type Chat = {
  id: string;
  title: string;
  titlePending?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SendMessageInput = { content: string; documentIds: string[] };

export type MessagePageInfo = { hasMore: boolean; nextCursor: string | null };
