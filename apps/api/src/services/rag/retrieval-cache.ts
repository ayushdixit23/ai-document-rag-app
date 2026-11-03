import { createHash } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { GEMINI_EMBED_MODEL, RAG_RETRIEVAL_MODE } from '../../config/env.js';
import { db } from '../../db/index.js';
import { document } from '../../db/schema/message.js';
import { RERANK_MODEL } from './config.js';
import type { Source } from './types.js';

const EVIDENCE_CACHE_TTL_MS = 120_000;

export interface DocumentVersion {
  id: string;
  updatedAt: Date;
}

export const sourceCacheKey = (userId: string, versions: DocumentVersion[], query: string) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        userId,
        versions: versions.map((row) => [row.id, row.updatedAt.toISOString()]).sort(),
        query: query.normalize('NFKC').trim().replace(/\s+/gu, ' '),
        embeddingModel: GEMINI_EMBED_MODEL,
        rerankModel: RERANK_MODEL,
        mode: RAG_RETRIEVAL_MODE,
      }),
    )
    .digest('hex');

export class SourceCache {
  private readonly entries = new Map<string, { expires: number; sources: Source[] }>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly maximum = 100,
  ) {}

  get(key: string): Source[] | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= this.now()) return undefined;
    this.entries.set(key, entry);
    return entry.sources.map((source) => ({ ...source }));
  }

  set(key: string, sources: Source[]) {
    if (!sources.length) return;
    this.entries.delete(key);
    this.entries.set(key, {
      expires: this.now() + EVIDENCE_CACHE_TTL_MS,
      sources: sources.map((source) => ({ ...source })),
    });
    if (this.entries.size > this.maximum) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
  }
}

export const sourceCache = new SourceCache();

/** A cache hit still refreshes ownership, readiness and content versions from PostgreSQL. */
export const authorizedCacheHit = async (
  userId: string,
  versions: DocumentVersion[],
  key: string,
) => {
  const cached = sourceCache.get(key);
  if (!cached || !versions.length) return undefined;
  const rows = await db
    .select({ id: document.id, updatedAt: document.updatedAt })
    .from(document)
    .where(
      and(
        eq(document.userId, userId),
        eq(document.status, 'ready'),
        inArray(
          document.id,
          versions.map((row) => row.id),
        ),
      ),
    );
  return sourceCacheKey(userId, rows, '') === sourceCacheKey(userId, versions, '')
    ? cached
    : undefined;
};
