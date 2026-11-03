import { randomUUID } from 'node:crypto';

import type { Document } from '@langchain/core/documents';

import type { documentChunk } from '../../../db/schema/document-chunk.js';
import type { StoredDocument } from '../../documents/document.repository.js';
import { EMBEDDING_DIMENSIONS } from '../config.js';
import { pageNumber } from './load-document.js';

const EMBEDDING_BATCH_SIZE = 48;
const EMBEDDING_CONCURRENCY = 2;
type ChunkRow = typeof documentChunk.$inferInsert;

const embedBatch = async (
  row: Pick<StoredDocument, 'id' | 'userId'>,
  chunks: Document[],
  start: number,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<ChunkRow[]> => {
  const vectors = await embed(
    chunks.map((chunk) =>
      typeof chunk.metadata.heading === 'string' && chunk.metadata.heading
        ? `${chunk.metadata.heading}\n\n${chunk.pageContent}`
        : chunk.pageContent,
    ),
  );
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
        heading: metadata.heading,
        sourceStart: metadata.sourceStart,
        sourceEnd: metadata.sourceEnd,
        chunkVersion: metadata.chunkVersion,
      },
    };
  });
};

export const embedChunks = async (
  row: Pick<StoredDocument, 'id' | 'userId'>,
  chunks: Document[],
  embed: (texts: string[]) => Promise<number[][]>,
  options: { signal?: AbortSignal; onProgress?: (completed: number) => Promise<void> } = {},
): Promise<ChunkRow[]> => {
  const values: ChunkRow[] = [];
  const window = EMBEDDING_BATCH_SIZE * EMBEDDING_CONCURRENCY;
  let completed = 0;
  for (let start = 0; start < chunks.length; start += window) {
    options.signal?.throwIfAborted();
    const batches = [];
    for (
      let offset = start;
      offset < Math.min(start + window, chunks.length);
      offset += EMBEDDING_BATCH_SIZE
    )
      batches.push(
        embedBatch(row, chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE), offset, embed).then(
          async (rows) => {
            options.signal?.throwIfAborted();
            completed += rows.length;
            await options.onProgress?.(completed);
            return rows;
          },
        ),
      );
    values.push(...(await Promise.all(batches)).flat());
  }
  return values;
};
