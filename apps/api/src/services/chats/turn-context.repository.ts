import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';
import {
  DEFAULT_PERSONALIZATION_PREFS,
  type PersonalizationPrefsInput,
  personalizationPrefsSchema,
} from '../../core/validation/schemas/personalization.schema.js';
import { db } from '../../db/index.js';
import { chat } from '../../db/schema/chats.js';
import { message } from '../../db/schema/message.js';
import { userPreferences } from '../../db/schema/user-preferences.js';
import { ownedChatFilter, type StoredMessage } from './chat.repository.js';
import { documentNamesSql } from './document-context.js';

const storedTimestamp = z
  .string()
  .transform((value) => new Date(`${value}Z`))
  .pipe(z.date());
const historySchema = z.array(
  z.object({
    id: z.string(),
    chatId: z.string(),
    content: z.string().nullable(),
    role: z.enum(['user', 'assistant']),
    createdAt: storedTimestamp,
    updatedAt: storedTimestamp,
    documentNames: z.array(z.string()).default([]),
    hasCitations: z.boolean().default(false),
  }),
);

// Keep literal column qualifiers: Drizzle unqualifies Column objects in single-table selections.
// Read the summary and its unsummarized tail in the same statement snapshot.
const history = (excludedId: string | null) =>
  sql<StoredMessage[]>`coalesce((
  select jsonb_agg(recent order by recent."createdAt", recent.id) from (
    select message.id, message.chat_id as "chatId", message.content,
      message.role, message.created_at as "createdAt", message.updated_at as "updatedAt",
      ${documentNamesSql} as "documentNames",
      exists(select 1 from message_citation where message_citation.message_id = message.id) as "hasCitations"
    from ${message} where message.chat_id = chat.id and message.id is distinct from ${excludedId} and case
      when chat.summarized_until_message_id is not null then
        (message.created_at, message.id) > (
          select cursor.created_at, cursor.id from message as cursor
          where cursor.id = chat.summarized_until_message_id and cursor.chat_id = chat.id
        )
      when chat.summarized_until is not null then message.created_at >= chat.summarized_until
      else true end
    order by message.created_at desc, message.id desc
  ) as recent
), '[]'::jsonb)`.mapWith((value: unknown) => historySchema.parse(value));

export const loadTurnContext = async (
  userId: string,
  chatId: string,
  excludedId: string | null = null,
  database: Pick<typeof db, 'select'> = db,
) => {
  const [row] = await database
    .select({
      chat,
      history: history(excludedId),
      preferences: sql<PersonalizationPrefsInput>`coalesce((
        select prefs from ${userPreferences} where user_id = chat.user_id
      ), ${JSON.stringify(DEFAULT_PERSONALIZATION_PREFS)}::jsonb)`.mapWith((value: unknown) =>
        personalizationPrefsSchema.parse(value ?? DEFAULT_PERSONALIZATION_PREFS),
      ),
    })
    .from(chat)
    .where(ownedChatFilter(userId, chatId));
  if (!row) throw new AppError('Chat not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  return row;
};
