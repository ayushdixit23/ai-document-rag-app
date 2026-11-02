import { randomUUID } from 'node:crypto';

import type { Document } from '@langchain/core/documents';

import type { documentChunk } from '../../../db/schema/document-chunk.js';
import type { StoredDocument } from '../../documents/document.repository.js';
import { EMBEDDING_DIMENSIONS } from '../config.js';
import { pageNumber } from './load-document.js';

const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_CONCURRENCY = 2;
type ChunkRow = typeof documentChunk.$inferInsert;

const embedBatch = async (
  row: Pick<StoredDocument, 'id' | 'userId'>,
  chunks: Document[],
  start: number,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<ChunkRow[]> => {
  const vectors = await embed(chunks.map((chunk) => chunk.pageContent));
  if (vectors.length !== chunks.length) throw new Error('Incomplete embedding response.');
  return chunks.map((chunk, index) => {
    const metadata: Record<string, unknown> = chunk.metadata;
    const embedding = vectors[index];
    if (embedding?.length !== EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite))
      throw new Error('Invalid embedding response.');
    return {
      id: randomUUID(),
      documentId: row.id,
      userId: row.userId,
      chunkIndex: start + index,
      content: chunk.pageContent,
      embedding,
      metadata: {
        page: pageNumber(metadata),
        sheet: metadata.sheet,
        row: metadata.row,
      },
    };
  });
};

export const embedChunks = async (
  row: Pick<StoredDocument, 'id' | 'userId'>,
  chunks: Document[],
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<ChunkRow[]> => {
  const values: ChunkRow[] = [];
  const window = EMBEDDING_BATCH_SIZE * EMBEDDING_CONCURRENCY;
  for (let start = 0; start < chunks.length; start += window) {
    const batches = [];
    for (
      let offset = start;
      offset < Math.min(start + window, chunks.length);
      offset += EMBEDDING_BATCH_SIZE
    )
      batches.push(
        embedBatch(row, chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE), offset, embed),
      );
    values.push(...(await Promise.all(batches)).flat());
  }
  return values;
};
