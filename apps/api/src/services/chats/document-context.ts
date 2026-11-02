import { sql } from 'drizzle-orm';
import { z } from 'zod';

/** Literal qualifiers preserve correlation when Drizzle builds a single-table selection. */
export const documentNamesSql = sql<string[]>`coalesce((
  select jsonb_agg(files.name order by files.id)
  from message_document as links inner join document as files on files.id = links.document_id
  inner join chat as owner_chat on owner_chat.id = message.chat_id
  where links.message_id = message.id and files.user_id = owner_chat.user_id
), '[]'::jsonb)`.mapWith((value: unknown) => z.array(z.string()).parse(value));
