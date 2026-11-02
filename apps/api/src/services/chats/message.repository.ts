import { randomUUID } from 'node:crypto';

import { db } from '../../db/index.js';
import { messageDocument } from '../../db/schema/message.js';
import { messageCitation } from '../../db/schema/message-citation.js';
import type { Source } from '../rag/types.js';
import { insertMessageRow } from './message-writes.js';

export const saveUserMessage = async (
  chatId: string,
  content: string,
  documentIds: string[],
): Promise<string> => {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await insertMessageRow(tx, { id, chatId, role: 'user', content });
    if (documentIds.length)
      await tx
        .insert(messageDocument)
        .values(documentIds.map((documentId) => ({ messageId: id, documentId })));
  });
  return id;
};

export const saveAssistantMessage = async (
  chatId: string,
  content: string,
  citations: Source[],
): Promise<string> => {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await insertMessageRow(tx, { id, chatId, role: 'assistant', content });
    if (citations.length)
      await tx.insert(messageCitation).values(
        citations.map((source) => ({
          messageId: id,
          documentId: source.documentId,
          chunkId: source.chunkId,
          ordinal: source.n,
          page: source.page,
          snippet: source.snippet,
        })),
      );
  });
  return id;
};
