import { sql } from 'drizzle-orm';

import { documentChunk } from '../../db/schema/document-chunk.js';
import { document } from '../../db/schema/message.js';
import { CANDIDATES_PER_BRANCH } from './config.js';
import type { SearchScope } from './retrieval-types.js';

export const authorizedChunks = ({ userId, documentIds }: SearchScope) => sql`
  ${documentChunk.userId} = ${userId} and ${document.userId} = ${userId}
  and ${document.status} = 'ready'
  and ${documentChunk.documentId} in (
    select jsonb_array_elements_text(${JSON.stringify(documentIds)}::jsonb)
  )
`;

export const retrievalQuery = (userId: string, readyIds: string[], vector: number[]) => sql`
  with scoped as materialized (
    select ${documentChunk.id} as "chunkId", ${documentChunk.documentId} as "documentId",
      ${document.name} as title, ${documentChunk.content} as snippet,
      ${documentChunk.metadata} as metadata, ${documentChunk.embedding} as embedding
    from ${documentChunk} inner join ${document} on ${document.id} = ${documentChunk.documentId}
    where ${authorizedChunks({ userId, documentIds: readyIds })}
  ), ranked as (
    select "chunkId", "documentId", title, snippet, metadata,
      embedding <=> ${JSON.stringify(vector)}::vector as distance from scoped
  )
  select "chunkId", "documentId", title, snippet, metadata, 1 - distance as score from ranked
  order by distance, "chunkId"
  limit ${CANDIDATES_PER_BRANCH}
`;

// Expression GIN index supports old and new chunks without rewriting rows or IDs.
export const lexicalRetrievalQuery = (scope: SearchScope, query: string) => sql`
  select ${documentChunk.id} as "chunkId", ${documentChunk.documentId} as "documentId",
    ${document.name} as title, ${documentChunk.content} as snippet,
    ${documentChunk.metadata} as metadata,
    ts_rank_cd(to_tsvector('simple', ${documentChunk.content}),
      websearch_to_tsquery('simple', ${query}), 32) as score
  from ${documentChunk} inner join ${document} on ${document.id} = ${documentChunk.documentId}
  where ${authorizedChunks(scope)}
    and to_tsvector('simple', ${documentChunk.content}) @@ websearch_to_tsquery('simple', ${query})
  order by score desc, ${documentChunk.id} limit ${CANDIDATES_PER_BRANCH}
`;
