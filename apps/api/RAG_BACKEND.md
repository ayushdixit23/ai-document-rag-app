# RAG backend

Document ingestion, grounded chat, streaming, citations, and background memory. See
[hybrid retrieval and reranking](./RETRIEVAL.md) for search configuration and the local fallback.

## Setup

1. Run `pnpm install` at the repository root.
2. Configure `apps/api/.env` using `env.example`. PostgreSQL needs `vector`. Set `DATABASE_URL_DIRECT` to the direct connection for pg-boss; ordinary PostgreSQL can use the `DATABASE_URL` fallback.
3. Apply migrations with `pnpm --filter api db:migrate`. Migrations 0006–0009 add hybrid search, the atomic quota function, processing progress, and the embedding cache. Existing `db:push` users must also apply the custom function from migration 0007; it is not represented by a Drizzle table schema.
4. Configure private R2 bucket CORS: web origins, method `PUT`, allowed header `Content-Type`, exposed header `ETag`. The existing `configureBucketCors()` in `src/lib/storage/r2.ts` applies `ALLOWED_ORIGINS`.
5. Run `pnpm dev`. API port: **5001**. Startup registers ingestion, summary, and ten-minute cleanup workers. The database role must be able to create pg-boss's schema and tables.

No UI changes are included. Upload directly to the presigned R2 URL with the exact returned `Content-Type` and declared byte length. URLs expire in ten minutes.

## Responsibilities

| Layer              | Responsibility                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| Routes and schemas | Authentication, input constraints and HTTP wiring                              |
| Controllers        | Request parsing and standard JSON/SSE responses                                |
| Services           | Ownership, lifecycle and use-case coordination                                 |
| Repositories       | Scoped reads and transactional message writes                                  |
| Ingest modules     | File verification, loaders, splitting, embeddings and atomic chunk replacement |
| Query pipeline     | Routing, retrieval, prompt assembly, streaming and citations                   |
| SSE writer         | Framing, backpressure, heartbeat, cancellation and deadline                    |
| Summary modules    | Trigger, oldest-message fold, retained history and guarded cursor update       |

`query-pipeline.ts` accepts its I/O dependencies explicitly for testing without external services. `answer-turn.ts` binds the production integrations. The summary queue uses pg-boss's [stately policy](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md): one active and one waiting job per chat.

## HTTP contract

All routes require a Better Auth session cookie. JSON success and error envelopes follow the existing API conventions. IDs are UUIDs. Sending starts SSE only after input, ownership and attachment checks pass.

| Method | Path                          | Body / result in `data`                                              |
| ------ | ----------------------------- | -------------------------------------------------------------------- |
| POST   | `/api/documents/uploads`      | `{ files: [{ name, size, mimeType }] }` → `{ uploads }` (201)        |
| POST   | `/api/documents/:id/complete` | `{ document }` (202)                                                 |
| GET    | `/api/documents`              | `{ documents }`                                                      |
| GET    | `/api/documents/:id`          | `{ document }`                                                       |
| POST   | `/api/documents/:id/retry`    | Failed documents only → `{ document }` (202)                         |
| DELETE | `/api/documents/:id`          | Deletes object, chunks and links → `{}`                              |
| POST   | `/api/chats`                  | `{ title? }` → `{ chat }` (201)                                      |
| GET    | `/api/chats`                  | `{ chats }`, newest activity first                                   |
| PATCH  | `/api/chats/:id`              | `{ title }` → `{ chat }`                                             |
| DELETE | `/api/chats/:id`              | Deletes messages; documents survive → `{}`                           |
| GET    | `/api/chats/:id/messages`     | `{ chat, messages, documents }`, including citations and attachments |
| GET    | `/api/chats/:id/documents`    | `{ documents }`, union of message attachments                        |
| POST   | `/api/chats/:id/messages`     | `{ content?, documentIds? }` → SSE                                   |

Uploads accept 1–5 PDF, DOCX, UTF-8 TXT/MD/CSV, or XLSX files of at most 10 MiB each. Extensions and MIME types must match. Markdown and CSV also accept `text/plain`. The worker checks bytes again. Image-only PDFs fail with a no-text error; OCR is outside v1. XLSX reads cached cell values and sheet/row metadata without evaluating formulas.

Messages need text or attachments, with at most five distinct document IDs. Attachments must belong to the user and have completed uploading. Previously attached files remain in the chat scope. Pending/processing files appear in `meta`; failed files remain visible for retry/delete.

SSE order: `meta`, optional document `status` updates, `sources`, zero or more `token`, then `done` or `error`. `status` uses `reading_documents` / `answering`; readiness includes `documentVersions: [{ id, updatedAt }]` so delayed browser polls cannot regress file state. Every newly attached file must be `ready` before invoking the answer model, including for a general routing decision. Failed or missing new files stop the turn. The progress connection can stay open during indexing. `sources` is an array of `{ n, documentId, title, page }`. `done` contains `{ assistantMessageId, citations }`; citations also include snippets. Invalid citation ordinals are never persisted. Failed/disconnected generations keep the user message without saving a partial assistant message. Heartbeats run every 15 seconds; the stream deadline is five minutes.

Ingestion transitions `uploading → pending → processing → ready | failed`; retry uses `failed → pending`. Cleanup removes uploads older than one hour and requeues pending documents to recover a crash between status update and enqueue. Processing abandoned for over one hour is reclaimed; the original attempt cannot overwrite a newer attempt.

Above 4,000 estimated unsummarized tokens, summaries fold the oldest messages while retaining roughly 3,000 recent tokens. A single oversized latest message stays verbatim; prompt history is independently trimmed. Each rewrite replaces the summary, capped at 1,200 output tokens. A cursor compare-and-set uses the stable message ID and checks the returned row. A lost comparison fails the job so pg-boss retries with fresh state. The cursor timestamp is copied directly from the message in SQL, preserving microseconds without JavaScript Date parameters. Summary updates preserve chat activity timestamps. Jobs log `skipped`, `wrote` or `conflict` with cursor/token counts, without conversation text; enqueue diagnostics distinguish `queued` from `coalesced` (a waiting job already covers that chat).

## Validation

Run `pnpm test` for the Node.js test runner suite, `pnpm validate` for lint/format/types, and `pnpm --filter api build` for compilation. Automated tests use synthetic fixtures and injected dependencies and do not contact external services.

For a live smoke pass, sign in with a verified account and save its cookie jar as `/tmp/askdocs-cookies.txt`. Set `RAG_API=http://localhost:5001`, then copy returned IDs into `RAG_CHAT_ID` and `RAG_DOCUMENT_ID` and the returned presigned URL into `RAG_UPLOAD_URL`.

```sh
printf 'Annual revenue rose by 20%%.\n' > /tmp/report.txt
RAG_BYTES=$(wc -c < /tmp/report.txt | tr -d ' ')
curl -sS -b /tmp/askdocs-cookies.txt "$RAG_API/api/documents/uploads" \
  -H 'Content-Type: application/json' \
  -d "{\"files\":[{\"name\":\"report.txt\",\"size\":$RAG_BYTES,\"mimeType\":\"text/plain\"}]}"
curl -sS -X PUT "$RAG_UPLOAD_URL" -H 'Content-Type: text/plain' --data-binary @/tmp/report.txt
curl -sS -b /tmp/askdocs-cookies.txt -X POST "$RAG_API/api/documents/$RAG_DOCUMENT_ID/complete"
curl -sS -b /tmp/askdocs-cookies.txt "$RAG_API/api/documents/$RAG_DOCUMENT_ID"
curl -sS -b /tmp/askdocs-cookies.txt "$RAG_API/api/chats" \
  -H 'Content-Type: application/json' -d '{"title":"Smoke test"}'
curl -N -b /tmp/askdocs-cookies.txt "$RAG_API/api/chats/$RAG_CHAT_ID/messages" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"Summarize the report\",\"documentIds\":[\"$RAG_DOCUMENT_ID\"]}"
curl -sS -b /tmp/askdocs-cookies.txt "$RAG_API/api/chats/$RAG_CHAT_ID/messages"
```

Poll to `ready` before asking about the report. Also check a general question without attachments, a document follow-up without reattaching, an unrelated topic, and a return to the report. Upload invalid bytes under a PDF name to verify failure and retry/delete. Live summary verification requires enough conversation content to cross the threshold; automated tests cover three consecutive folds, rejected writes/retries, and the precision-safe SQL update. After restarting the API, a successful answer queues another summary attempt and includes any still-unsummarized messages above the threshold; no manual cursor reset is needed.
