import type { Message, SendMessageInput } from '@/lib/chats/types';

export function createPendingTurn(chatId: string, input: SendMessageInput): [Message, Message] {
  const base = { chatId, createdAt: new Date().toISOString(), citations: [] };
  const userId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  return [
    { ...base, id: userId, clientId: userId, role: 'user', ...input },
    {
      ...base,
      id: assistantId,
      clientId: assistantId,
      role: 'assistant',
      content: '',
      documentIds: [],
      status: 'streaming',
      retryInput: input,
    },
  ];
}
