# Chat and document latency

Document retrieval now runs lexical search alongside query embedding and exact vector search,
then fuses up to 40 candidates. Optional Pinecone reranking has a two-second deadline and a shared
500-call sliding 31-day budget, with a local BM25 fallback. The overall retrieval response deadline
remains eight seconds. New chunks use recursive structure boundaries with the requested 512/64
character settings. See [retrieval configuration and validation](./RETRIEVAL.md). Measurements are
dated by the behavior they describe; earlier samples used different retrieval paths.

The later 94-second indexing report exposed a 100-inputs/minute Gemini embedding allowance for the
configured project. Two 64-input requests could exceed that allowance. Background ingestion now uses
48-input batches, two concurrent slots, per-process pacing at 96 inputs/minute, and an owner/model-scoped
embedding cache. A replay of the same 25-page/162-chunk file took 67.0 seconds on its first pass and
2.66 seconds from cache with zero Gemini calls. Progress distinguishes completed sections, service
waits, and saving. The first free-tier pass still needs to cross a quota reset.

Migration 0007 moves quota reservation into one atomic PostgreSQL function. A live retrieval over the
document reranked 30 candidates through Pinecone in 1.44 seconds (647 ms reservation, 789 ms provider).
Migrations 0008/0009 add progress and the embedding cache. These are service samples; cold connections,
provider variation, other project traffic, and larger files can take longer. Answer generation now
uses the model's existing low-latency thinking settings as well as routing.

The supplied slowest turn spent 107.5 seconds routing and about 2 seconds on each
message save. Retrieval and answer generation were much smaller contributors.

## Changes

- Routing uses native JSON output, minimal thinking, no provider retries, and an
  8-second deadline. Router history keeps the last two messages, each capped at 600 characters;
  the summary is capped at 800 characters. A stable instruction plus one JSON data message
  replaces multiple conversation messages. Already standalone questions return a null rewrite;
  only unresolved references need a short rewritten query. If routing
  fails, retrieval supplies optional evidence and the answer model can still
  handle unrelated questions normally. No-document turns skip routing entirely.
- Clear file requests, cited follow-ups, and explicit topic switches resolve locally.
  Ambiguous questions still use model classification. Topical follow-ups need stored citations
  and shared topic terms; citation-shaped text alone is insufficient.
- Final evidence has a bounded, two-minute process cache keyed by owner, document versions,
  question, and retrieval models/mode. Hits refresh ownership, readiness, and versions in
  PostgreSQL before reuse. Misses retain normal hybrid search and hosted reranking.
- Startup warms up to four configured database connections. Vector search binds the query
  vector once. Foreground answer generation avoids hidden provider retries, and logs include
  the configured model and estimated prompt size without logging prompt content.
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
- Ingestion schedules bounded embedding batches and inserts up to 500 chunks per
  statement. A conditional version check prevents stale workers from replacing
  newer results; readiness and chunks commit together.
  Background Gemini calls share two concurrency slots per API process, with input-rate pacing.
- Short conversations no longer enqueue summary jobs that immediately skip.
- Authentication forwards Better Auth's refreshed cookies so the existing
  signed session cache can renew. Its cache policy and lifetime are unchanged.
- Debug logs report authentication, context loading, persistence, routing,
  retrieval, first token, model streaming, and ingestion stages.

## Chat names

Creating a chat without a title leaves `title_pending` enabled. After the first
user message is saved, the browser starts `POST /api/chats/:id/title` independently
of the answer stream. Naming uses the first sentence of the first user message, capped at
nine words and 80 characters, or attachment filenames for an upload-only message. It makes
zero model requests. Chat, first message, and filenames load in one database statement.
Pending requests deduplicate, manual renames win, and late responses
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
The earlier structured routing probe completed in 1,272 ms under the former
3-second deadline. A later 1-second cutoff repeatedly discarded normal responses in user logs.
The current shorter router prompt allows up to 8 seconds to complete, as requested.
Fresh synthetic checks on the unchanged configured `gemini-3.5-flash-lite` routed an unrelated
question in 893 ms and rewrote a document follow-up in 754 ms, both without fallback. A clear
cited follow-up took 1 ms locally. These individual samples are not latency guarantees.
Set the same value in a separate deployment if desired; the example environment
remains configurable. Restart the API after changing model environment values.

Run `pnpm validate`, `pnpm --filter api test`, and `pnpm --filter web test` to
check the implementation. Apply the new migration before deploying the API.
The configured local database has migration 0005 applied. Its missing 0004
history entry was reconciled after verifying that the exact column already existed.

## Latest ready-document measurements

The latest supplied logs showed repeated 3-second routing timeouts, 3–6.4 seconds until answer
text inside the model, and a separate title request timing out after five seconds. Titles now
make no model call; the configured chat model is unchanged.

Warm service probes used the existing conversation's 12-message history and actual ready-file
evidence, with eight sources and about 4,300 estimated prompt tokens for document questions.

| Question path                         | First answer text | Generation complete |
| ------------------------------------- | ----------------- | ------------------- |
| New Boolean-retrieval question        | 4,890 ms          | 5,084 ms            |
| New vector-space retrieval question   | 4,900 ms          | 5,080 ms            |
| Repeated question with cached sources | 2,183 ms          | 2,381 ms            |
| General question                      | 1,192 ms          | 1,337 ms            |

These probes include context loading, routing, retrieval, and answer generation, but exclude
HTTP/authentication, user/assistant persistence, browser rendering, and initial document indexing.
They do not establish an end-to-end five-second guarantee. The uncached rows used Pinecone;
the cache-hit row revalidated documents in PostgreSQL and skipped embedding/search/reranking.
One title-context read plus local title computation took 625 ms, excluding the title update.
The chat model and 512/64 chunk settings were preserved. Provider latency, long answers,
ambiguous routing, cold connections, and first-upload quota pacing can exceed five seconds.

## Indexing, memory, and warm-query follow-up

- Document questions now keep the original turn open while indexing, emit a
  `reading_documents` status, reload the owned documents, then retrieve and answer.
  The browser shows “Reading documents…” and resumes streaming automatically.
  Cancellation, deletion, failure, and a four-minute wait deadline stop generation;
  no premature assistant answer is saved. Every newly attached file gates answer generation,
  even when classification chooses a general answer; failed new files stop the turn. General
  topic switches without new attachments do not wait for historical processing files.
- Readiness events include committed document versions, including when a new attachment was
  already ready on the server. The browser rejects older polling snapshots, so a delayed
  `processing` response cannot overwrite a newer `ready` state. A genuine later retry still
  advances the version and can return the file to `pending`.
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
