import { sql } from 'drizzle-orm';

import { chat } from '../../db/schema/chats.js';
import { document } from '../../db/schema/message.js';

/** Validate ownership and completed uploads inside the write statement itself. */
export const userMessageGuard = (userId: string, chatId: string, documentIds: string[]) => sql`
  from ${chat} where ${chat.id} = ${chatId} and ${chat.userId} = ${userId}
  and (select count(*) from ${document}
    where ${document.userId} = ${userId} and ${document.status} <> 'uploading'
      and ${document.id} in (select jsonb_array_elements_text(${JSON.stringify(documentIds)}::jsonb))
  ) = ${documentIds.length}
`;
