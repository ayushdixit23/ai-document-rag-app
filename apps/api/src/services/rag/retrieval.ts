import { and, cosineDistance, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { documentChunk } from '../../db/schema/document-chunk.js';
import { document } from '../../db/schema/message.js';
import { EMBEDDING_DIMENSIONS, TOP_K } from './config.js';
import { embeddings } from './models.js';
import type { Source } from './types.js';

export const retrieveSources = async (
  userId: string,
  readyIds: string[],
  query: string,
): Promise<Source[]> => {
  if (!readyIds.length) return [];
  const vector = await embeddings.embedQuery(query);
  if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite))
    throw new Error('Invalid query embedding.');
  const rows = await db
    .select({
      chunkId: documentChunk.id,
      documentId: documentChunk.documentId,
      title: document.name,
      snippet: documentChunk.content,
      metadata: documentChunk.metadata,
    })
    .from(documentChunk)
    .innerJoin(document, eq(document.id, documentChunk.documentId))
    .where(
      and(
        eq(documentChunk.userId, userId),
        eq(document.userId, userId),
        eq(document.status, 'ready'),
        inArray(documentChunk.documentId, readyIds),
      ),
    )
    .orderBy(cosineDistance(documentChunk.embedding, vector))
    .limit(TOP_K);
  return rows.map(({ metadata, ...row }, index) => ({
    ...row,
    n: index + 1,
    page: typeof metadata.page === 'number' ? metadata.page : null,
  }));
};
