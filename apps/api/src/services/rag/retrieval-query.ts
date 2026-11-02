import { sql } from 'drizzle-orm';

import { documentChunk } from '../../db/schema/document-chunk.js';
import { document } from '../../db/schema/message.js';
import { TOP_K } from './config.js';

export const retrievalQuery = (userId: string, readyIds: string[], vector: number[]) => sql`
  with scoped as materialized (
    select ${documentChunk.id} as "chunkId", ${documentChunk.documentId} as "documentId",
      ${document.name} as title, ${documentChunk.content} as snippet,
      ${documentChunk.metadata} as metadata, ${documentChunk.embedding} as embedding
    from ${documentChunk} inner join ${document} on ${document.id} = ${documentChunk.documentId}
    where ${documentChunk.userId} = ${userId} and ${document.userId} = ${userId}
      and ${document.status} = 'ready'
      and ${documentChunk.documentId} in (
        select jsonb_array_elements_text(${JSON.stringify(readyIds)}::jsonb)
      )
  )
  select "chunkId", "documentId", title, snippet, metadata from scoped
  order by embedding <=> ${JSON.stringify(vector)}::vector limit ${TOP_K}
`;
