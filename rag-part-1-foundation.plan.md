---
name: RAG Part 1 — Foundation
overview: 'Infrastructure only: packages, env vars, pgvector, Drizzle schema changes, R2 client + bucket CORS, pg-boss boot. No feature endpoints, no UI. Deliverable: the API is ready to build upload/ingest/chat on top of.'
status: pending
depends_on: none
parent_plan: langchain-first_rag_682de98b.plan.md
todos:
  - id: packages
    content: 'Install LangChain, AWS SDK, pg-boss, file-type packages'
    status: pending
  - id: env
    content: 'New env vars in env.example + apps/api/src/config/env.ts'
    status: pending
  - id: pgvector
    content: 'Enable pgvector extension on Neon (one-time)'
    status: pending
  - id: schema
    content: 'Drizzle schema: document status fields, document_chunk, message_citation, chat.summarizedUntil'
    status: pending
  - id: r2
    content: 'R2 client (apps/api/src/lib/storage/r2.ts) + one-time bucket CORS'
    status: pending
  - id: pgboss
    content: 'pg-boss boot (apps/api/src/lib/queue/boss.ts) wired into src/index.ts with graceful shutdown'
    status: pending
  - id: rag-config
    content: 'apps/api/src/services/rag/config.ts constants + models.ts model instances'
    status: pending
---

# RAG Part 1: Foundation

Infrastructure only. At the end of this part nothing user-facing works, but every later part has what it needs. The original design lives in [langchain-first_rag_682de98b.plan.md](langchain-first_rag_682de98b.plan.md); this file is the execution plan for the foundation slice.

## 1. Packages

```bash
pnpm --filter api add @langchain/core @langchain/textsplitters @langchain/community @langchain/google @langchain/google-genai @aws-sdk/client-s3 @aws-sdk/s3-request-presigner pg-boss file-type
pnpm --filter api add pdf-parse mammoth d3-dsv   # loader peer deps
```

Gotcha: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days). If a freshly published LangChain minor is pinned, the install will refuse it — let pnpm resolve an aged version; do not bump `minimumReleaseAge`.

## 2. Env vars

`apps/api/.env` + `apps/api/env.example` + `apps/api/src/config/env.ts` (env.ts stays the only reader):

- Already set: `DATABASE_URL`, `GEMINI_API_KEY`
- New:
  - `DATABASE_URL_DIRECT` — Neon **direct** (non-pooler) host, used by the pg-boss client (PgBouncer transaction mode breaks pg-boss maintenance/polling)
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
  - `GEMINI_CHAT_MODEL` (default `gemini-2.5-flash`), `GEMINI_FAST_MODEL` (default `gemini-2.5-flash-lite`), `GEMINI_EMBED_MODEL` (default `gemini-embedding-001`)

## 3. pgvector on Neon (one-time)

Run once against the Neon database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Verify `\dx` shows `vector` before running `db:push`.

## 4. Drizzle schema changes

- [apps/api/src/db/schema/message.ts](apps/api/src/db/schema/message.ts) — `document` table: add `status` enum (`uploading | pending | processing | ready | failed`), nullable `errorMessage`, nullable `pageCount` / `chunkCount` ints.
- New [apps/api/src/db/schema/document-chunk.ts](apps/api/src/db/schema/document-chunk.ts):
  - `id`, `documentId` (FK cascade), `userId`, `chunkIndex`
  - `content` (text), `embedding` (`vector(768)`), `metadata` (jsonb)
  - HNSW index on `embedding vector_cosine_ops`; btree on `(user_id, document_id)`
- New [apps/api/src/db/schema/message-citation.ts](apps/api/src/db/schema/message-citation.ts): `messageId`, `documentId`, `chunkId`, `ordinal` (the `[n]`), `page`, `snippet`.
- [apps/api/src/db/schema/chats.ts](apps/api/src/db/schema/chats.ts): add `summarizedUntil` (timestamp, nullable). Marks which messages `chat.summary` already covers. Ordering rule for the cursor: always compare messages by `(createdAt, id)` so equal timestamps never skip a row.

Drizzle vector column: use Drizzle's native `vector` type helper if the installed version supports it; otherwise a minimal `customType`. Keep it in one place.

Apply with `pnpm db:push` from `apps/api`.

## 5. R2 client + bucket CORS

- New [apps/api/src/lib/storage/r2.ts](apps/api/src/lib/storage/r2.ts): `S3Client` pointed at the R2 S3 endpoint (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`) with `get`, `head`, `put` (presign via `@aws-sdk/s3-request-presigner`), `delete`. Object key format lives here too: `users/{userId}/documents/{documentId}/{safeFileName}` — the client never sends a raw key.
- One-time bucket CORS (Cloudflare dashboard or a small script): allow `PUT` from the web origins (`ALLOWED_ORIGINS`) with the `Content-Type` header.
- Smoke check: `headBucket`-equivalent (`HeadObject` on a temp key or list) succeeds with the env creds.

## 6. pg-boss boot

- New [apps/api/src/lib/queue/boss.ts](apps/api/src/lib/queue/boss.ts): creates the `PgBoss` instance on `DATABASE_URL_DIRECT`, exports `startBoss()` and the job-name constants (`ingest-document`, `summarize-chat`, `stale-upload-cleanup`).
- [apps/api/src/index.ts](apps/api/src/index.ts): start pg-boss during boot; register no handlers yet (those come in Part 2); stop it in the existing graceful-shutdown path.
- Log line on boot so it's obvious the queue is alive in dev.

## 7. RAG config + models

- New [apps/api/src/services/rag/config.ts](apps/api/src/services/rag/config.ts): `MAX_FILES_PER_MESSAGE = 5`, `MAX_FILE_BYTES = 10 MB`, `PRESIGN_TTL_SECONDS = 600`, `CHUNK_SIZE = 512`, `CHUNK_OVERLAP = 64`, `TOP_K = 8`, `HISTORY_TOKENS = 3000`, `SUMMARY_TRIGGER_TOKENS = 4000`.
- New [apps/api/src/services/rag/models.ts](apps/api/src/services/rag/models.ts): shared `ChatGoogle` (chat + fast/flash-lite instances) and `GoogleGenerativeAIEmbeddings` (768 dims) built from env; `maxRetries` with backoff for free-tier 429s.

## 8. Definition of done

- `pnpm install` resolves cleanly; `pnpm validate` passes (lint, format:check, check-types)
- `pnpm db:push` applies the new schema without error; pgvector extension confirmed
- API boots with a "pg-boss started" log and shuts down cleanly on SIGINT
- R2 smoke check succeeds; bucket CORS rule exists
- No routes added, no UI touched
