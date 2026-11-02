# Chat and document latency

The supplied slowest turn spent 107.5 seconds routing and about 2 seconds on each
message save. Retrieval and answer generation were much smaller contributors.

## Changes

- Routing uses native JSON output, minimal thinking, no provider retries, and a
  3-second deadline. Router history has a separate 1,000-token budget. If routing
  fails, retrieval supplies optional evidence and the answer model can still
  handle unrelated questions normally. No-document turns skip routing entirely.
- Message, attachment/citation, and chat timestamp writes commit in one SQL
  statement. Invalid links roll back the whole statement.
- Summary and unsummarized history load in one statement snapshot. Summary
  cursors retain PostgreSQL microsecond precision and message-ID ordering.
- Migration `0005_chat_latency_indexes.sql` adds seven indexes for user lists,
  chat history, document status, attachments, and citation foreign keys. It also
  adds `chat.title_pending`; existing titles stay finalized.
- Document search uses the user/document index to filter before exact vector
  ranking. This avoids the loss of results that can occur when a global HNSW
  scan applies ownership/document filters after scanning. Retrieval has an
  8-second response deadline and reports unavailable evidence honestly.
- Ingestion embeds two batches concurrently and inserts up to 500 chunks per
  statement. A conditional version check prevents stale workers from replacing
  newer results; readiness and chunks commit together.
- Short conversations no longer enqueue summary jobs that immediately skip.
- Authentication forwards Better Auth's refreshed cookies so the existing
  signed session cache can renew. Its cache policy and lifetime are unchanged.
- Debug logs report authentication, context loading, persistence, routing,
  retrieval, first token, model streaming, and ingestion stages.

## Chat names

Creating a chat without a title leaves `title_pending` enabled. After the first
user message is saved, the browser starts `POST /api/chats/:id/title` independently
of the answer stream. Naming has a 5-second model deadline and a prompt-based
fallback. Pending requests deduplicate, manual renames win, and late responses
cannot restore deleted chats or a previous session's state. Supplying a title
when creating a chat opts out of automatic naming.

## Measurements and remaining latency

An isolated PostgreSQL check using temporary tables measured the previous
message-write path at 1,553 ms and the new write with an attachment at 621 ms.
It verified atomic rollback, citation writes, ownership, eight scoped retrieval
results, exact summary cursors, and stale ingestion protection. All temporary
changes rolled back. These are samples, not end-to-end latency guarantees.

The database probe measured about 307 ms per warm round trip and 2.9 seconds for
an initial connection. Indexes cannot eliminate connection or network latency.

A tiny direct generation request measured 4,211 ms on the configured
`gemini-3.1-flash-lite` and 654 ms on `gemini-3.5-flash-lite`. The local API's
`GEMINI_FAST_MODEL` was changed to the latter, which was already the chat model.
The structured routing probe then completed successfully in 1,272 ms, within
the 3-second production deadline.
Set the same value in a separate deployment if desired; the example environment
remains configurable. Restart the API after changing model environment values.

Run `pnpm validate`, `pnpm --filter api test`, and `pnpm --filter web test` to
check the implementation. Apply the new migration before deploying the API.
The configured local database has migration 0005 applied. Its missing 0004
history entry was reconciled after verifying that the exact column already existed.

## Indexing, memory, and warm-query follow-up

- Document questions now keep the original turn open while indexing, emit a
  `reading_documents` status, reload the owned documents, then retrieve and answer.
  The browser shows “Reading documents…” and resumes streaming automatically.
  Cancellation, deletion, failure, and a four-minute wait deadline stop generation;
  no premature assistant answer is saved. General topic switches do not wait.
- Clear file requests and citation-backed follow-ups bypass the routing model.
  Ambiguous requests still use classification and standalone-query rewriting.
- User-message persistence runs alongside context reads. The write independently
  validates chat ownership, document ownership, and upload completion in SQL.
  Context explicitly excludes the newly saved message to avoid repeating it.
- `DATABASE_PREPARE_STATEMENTS` defaults to false for compatibility. It is enabled
  in the verified local Neon configuration. A driver adapter opts Drizzle's
  `unsafe()` calls into protocol preparation; merely setting the client's flag
  does not override that method's default. Repeated parameterized probe queries
  measured about 307 ms prepared versus 655 ms unprepared. First uses on each
  connection still pay the preparation cost.
- Summary folding still targets a 3,000-token retained tail and triggers above
  4,000 tokens. Answer prompts have a 12,000-token history buffer so a pending
  summary does not immediately discard the overflow. Attachment names now appear
  in history and summary input, and folding keeps user/assistant pairs together.
  Summary generation has a 30-second deadline and rejects truncated output before
  advancing the cursor. Existing cursor conflict and precision protections remain.

Six service-level measurements of a short, cited document answer returned first
tokens in 3,188 / 2,422 / 2,540 / 2,046 / 2,011 / 2,322 ms and completed in
3,896 / 3,094 / 2,920 / 2,426 / 2,691 / 2,663 ms. Each included context loading,
user persistence, query embedding, retrieval, model generation, assistant
persistence, and citation validation. HTTP/authentication and initial indexing
were outside this diagnostic. The last three warm samples completed under three
seconds; long answers, new query shapes/connections, ambiguous routing, provider
variation, and indexing waits can exceed that target.

Two real model summary folds preserved a synthetic project name, database choice,
numeric budget, and attachment filename while advancing the cursor and retaining
four recent messages. All synthetic users, chats, documents, chunks, and messages
were deleted afterward. This checks a concrete example, not perfect semantic
recall for every conversation.

Restart the API after changing the preparation setting. Other deployments must
verify their pooler's support before opting in. See
[Neon's protocol-level prepared statements](https://neon.com/docs/connect/connection-pooling#protocol-level-prepared-statements).

References: [Gemini thinking controls](https://ai.google.dev/gemini-api/docs/thinking),
[pgvector filtering](https://github.com/pgvector/pgvector#filtering), and
[Better Auth response headers](https://www.better-auth.com/docs/concepts/api#getting-headers).
