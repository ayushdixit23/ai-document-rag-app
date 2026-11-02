import { sql } from 'drizzle-orm';

import { chat } from '../../db/schema/chats.js';
import { message, messageDocument } from '../../db/schema/message.js';
import { messageCitation } from '../../db/schema/message-citation.js';
import type { Source } from '../rag/types.js';
import { userMessageGuard } from './user-message-guard.js';

interface MessageWrite {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  userId?: string;
  documentIds?: string[];
  citations?: Source[];
}

/** Data-modifying CTEs commit together with one database round trip. */
export const messageWriteQuery = (write: MessageWrite) => {
  const attachments = write.documentIds?.length
    ? sql`, attachments as (
        insert into ${messageDocument} (message_id, document_id)
        select saved.id, files.id from saved
        cross join jsonb_array_elements_text(${JSON.stringify(write.documentIds)}::jsonb) as files(id)
      )`
    : sql``;
  const citations = write.citations?.length
    ? sql`, citations as (
        insert into ${messageCitation} (message_id, document_id, chunk_id, ordinal, page, snippet)
        select saved.id, refs.document_id, refs.chunk_id, refs.ordinal, refs.page, refs.snippet
        from saved cross join jsonb_to_recordset(${JSON.stringify(
          write.citations.map((source) => ({
            document_id: source.documentId,
            chunk_id: source.chunkId,
            ordinal: source.n,
            page: source.page,
            snippet: source.snippet,
          })),
        )}::jsonb) as refs(document_id text, chunk_id text, ordinal integer, page integer, snippet text)
      )`
    : sql``;
  return sql`with saved as (
    insert into ${message} (id, chat_id, role, content)
    select ${write.id}, ${write.chatId}, ${write.role}::role, ${write.content}
    ${write.userId ? userMessageGuard(write.userId, write.chatId, write.documentIds ?? []) : sql``}
    returning id, chat_id
  ) ${attachments} ${citations}
  update ${chat} set updated_at = greatest(${chat.updatedAt}, clock_timestamp())
  from saved where ${chat.id} = saved.chat_id returning saved.id`;
};
