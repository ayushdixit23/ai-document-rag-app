import { createHash } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { embeddingCache } from '../../db/schema/embedding-cache.js';
import { EMBEDDING_DIMENSIONS } from './config.js';

interface Entry {
  textHash: string;
  embedding: number[];
}
export interface EmbeddingCacheStore {
  load: (hashes: string[]) => Promise<Entry[]>;
  save: (entries: Entry[]) => Promise<void>;
}

export const embeddingCacheStore = (userId: string, model: string): EmbeddingCacheStore => ({
  load: (hashes) =>
    db
      .select({ textHash: embeddingCache.textHash, embedding: embeddingCache.embedding })
      .from(embeddingCache)
      .where(
        and(
          eq(embeddingCache.userId, userId),
          eq(embeddingCache.model, model),
          inArray(embeddingCache.textHash, hashes),
        ),
      ),
  save: async (entries) => {
    if (entries.length)
      await db
        .insert(embeddingCache)
        .values(
          entries.map((entry) => ({
            ...entry,
            userId,
            model,
          })),
        )
        .onConflictDoNothing();
  },
});

const validVector = (vector: number[]) =>
  vector.length === EMBEDDING_DIMENSIONS && vector.every(Number.isFinite);

/** Owner/model scoped; cache only verified vectors. Successful batches survive later quota failures. */
export const embedCached = async (
  texts: string[],
  embed: (values: string[]) => Promise<number[][]>,
  store: EmbeddingCacheStore,
): Promise<number[][]> => {
  if (!texts.length) return [];
  const keys = texts.map((text) =>
    createHash('sha256').update(text.replace(/\n/g, ' ')).digest('hex'),
  );
  const unique = new Map(keys.map((key, index) => [key, texts[index] ?? '']));
  const cached = await store.load([...unique.keys()]);
  const vectors = new Map(
    cached
      .filter((entry) => validVector(entry.embedding))
      .map((entry) => [entry.textHash, entry.embedding]),
  );
  const missing = [...unique].filter(([key]) => !vectors.has(key));
  if (missing.length) {
    const result = await embed(missing.map(([, text]) => text));
    if (result.length !== missing.length || !result.every(validVector))
      throw new Error('Invalid embedding response; no vectors were cached.');
    const entries = missing.map(([textHash], index) => {
      const embedding = result[index];
      if (!embedding) throw new Error('Incomplete embedding response.');
      vectors.set(textHash, embedding);
      return { textHash, embedding };
    });
    await store.save(entries);
  }
  return keys.map((key) => {
    const vector = vectors.get(key);
    if (!vector) throw new Error('Missing cached embedding.');
    return vector;
  });
};
