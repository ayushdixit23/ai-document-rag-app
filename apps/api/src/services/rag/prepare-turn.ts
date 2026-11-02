import type { SendMessageInput } from '../../core/validation/schemas/chats.schema.js';
import { getOwnedChat, loadChatDocuments, loadRecentMessages } from '../chats/chat.repository.js';
import { saveUserMessage } from '../chats/message.repository.js';
import { getAttachments, publicDocument } from '../documents/document.repository.js';

export const prepareTurn = async (userId: string, chatId: string, input: SendMessageInput) => {
  const [chat, history, scope, attached] = await Promise.all([
    getOwnedChat(userId, chatId),
    loadRecentMessages(chatId),
    loadChatDocuments(userId, chatId),
    getAttachments(userId, input.documentIds),
  ]);
  const documents = [
    ...new Map([...scope, ...attached.map(publicDocument)].map((row) => [row.id, row])).values(),
  ];
  const userMessageId = await saveUserMessage(chatId, input.content, input.documentIds);
  return { userId, chat, history, documents, input, userMessageId };
};

export type PreparedTurn = Awaited<ReturnType<typeof prepareTurn>>;
