# Hybrid retrieval and reranking

Document questions now use two concurrent candidate searches: exact pgvector cosine ranking
inside the authorized document scope, and PostgreSQL full-text search (`ts_rank_cd`, not BM25).
Each branch returns up to 20 chunks. Reciprocal rank fusion combines their positions with equal
weights and a constant of 60; cosine and lexical scores are retained separately. Stable chunk-ID
tie-breaking makes results deterministic. Both branches check the chunk owner, document owner,
selected document IDs, and `ready` status. A failed embedding or lexical query preserves results
from the surviving branch. Complete search failure retains the existing honest failure response.

The lexical branch uses the `simple` configuration, which preserves unstemmed words and identifiers
without assuming an English-only corpus. Query glue is removed, up to 32 distinct terms are ORed
for recall, and quoted phrases are also searched. Language-specific stemming, CJK word segmentation,
and corpus-specific relevance tuning remain possible follow-ups. All query values are SQL parameters.

## Setup and migration

1. Run `pnpm --filter api db:migrate`. Migration 0006 adds hybrid search, 0007 adds the single-call
   quota reservation function, 0008 adds ingestion progress, and 0009 adds the embedding cache.
   `db:push` alone does not create the custom function in migration 0007.
2. Add `PINECONE_API_KEY` to `apps/api/.env` to enable hosted reranking.
3. Restart the API. `RAG_RETRIEVAL_MODE` defaults to `hybrid_rerank`; alternatives are `hybrid`
   (fusion only) and `vector` (vector only). Invalid modes fail configuration validation.

The expression index covers existing chunk text immediately after index creation. It requires no
text backfill, embedding regeneration, chunk-ID replacement, or changes to historical citations.
Index creation takes PostgreSQL's normal migration locks; schedule it appropriately on a busy database.

## Hosted reranking and local fallback

Pinecone's standalone `bge-reranker-v2-m3` endpoint reranks at most 40 fused candidates, using
stable chunk IDs and response indices. Returned text is never trusted as evidence. Missing,
duplicate, out-of-range, or invalid response scores/indices trigger fallback. All candidates must
appear exactly once. Scores order evidence; they do not represent answer confidence.

Hosted work, including reserving quota, has a two-second deadline and inherits cancellation from
the eight-second retrieval deadline. Search branches each have a 5.5-second deadline. Query
embeddings and reranking have no automatic provider retries. At most eight nonduplicate evidence
chunks are selected within a 4,000-token estimate (the existing UTF-8 byte-based estimator).
Different pages, sheets, and rows retain distinct evidence. General-topic routing, indexing waits,
streaming, and final citation validation continue through the existing pipeline.

Rerank inputs are NFKC-normalized and conservatively clipped to 1,000 combined UTF-8 bytes per
query/passage pair, including a maximum 256-byte question. This deliberately favors bounded inputs
over maximizing the model's 1,024-token allowance; it is not a model tokenizer. The provider also
receives `truncate: END`. Debug diagnostics record whether input was shortened. Answer generation
and citations use the original stored passage, never this shortened provider input. The candidate
heading and filename are included when preparing reranker text.

If credentials, quota, database budget coordination, or Pinecone are unavailable—or the response
times out or fails validation—the local reranker runs instead. It computes BM25 on the current
candidate pool and blends normalized BM25 (65%) with fusion rank (35%) to retain semantic retrieval
signals. With no lexical matches, it preserves fusion order. This is a deterministic CPU-only
fallback, not a neural cross-encoder; it requires no separate server, downloads, or paid provider.
Successful hosted requests use the hosted ordering directly.

## Repeated-question evidence cache

The API keeps at most 100 final evidence results per process for two minutes. Keys include the
owner, selected document IDs and update versions, rewritten question, embedding/rerank models,
and retrieval mode. No answer text is cached. Before returning a hit, PostgreSQL rechecks every
selected document's ownership, `ready` status, and version. Deleted, retried, or changed documents
cannot reuse the old result. Misses make no extra database call and retain normal hybrid retrieval.
Empty results are not cached. This also avoids another hosted rerank request for a valid repeat.

## Shared free-tier budget

`rerank_usage` stores reservation IDs, timestamps, and provider circuit breakers, without user text.
A PostgreSQL transaction advisory lock serializes reservations per
`PINECONE_RERANK_BUDGET_SCOPE`. Keep this value stable across API processes and key rotations using
the same Pinecone project. All such processes must use the same database to share the allowance.
The VOLATILE `reserve_rerank_call` function performs locking, pruning, counting, and insertion
in one round trip, with a fresh snapshot after the lock. It retains concurrency protection without
spending most of the two-second reranker deadline on transaction round trips.

The application permits at most **500 dispatched/reserved calls in a sliding 31-day window** and
60 in a sliding minute. The 501st call uses local fallback. The 31-day window is deliberately more
conservative than a calendar-month reset; the application does not guess Pinecone's billing reset.
Expired entries are pruned during reservation. Failed, timed-out, or cancelled reservations still
consume local allowance, avoiding uncertain retries that could exceed the cap. Calls made outside
this database are not included in its counter; provider limits still apply.

A provider 429 naming monthly/quota exhaustion persists a 31-day circuit breaker; other 429s
persist a one-minute breaker. If the breaker write fails, diagnostics record it and the current
request still uses fallback. In-flight calls can finish while another request records a breaker.
Pinecone currently documents [500 monthly Starter requests and 60/minute for this model][limits].

## Recursive chunking

New ingestion keeps the requested **512-character maximum / 64-character overlap target**.
Explicit Markdown ATX headings start separate sections in MD/TXT, with heading ancestry retained
on continuation chunks. Within each section, recursive splitting prefers paragraphs, sentences
(`Intl.Segmenter`), lines, words, and finally Unicode code points. Overlap retains whole boundary
units where they fit; it can be smaller than 64 characters when retaining a unit would exceed the
target. Fenced code is not mistaken for a section heading. PDF typography and DOCX heading styles
are not exposed by the text loaders, so those headings are not inferred.

Chunks never cross loader-provided PDF pages or spreadsheet rows. Page, sheet, row, heading,
extracted-text UTF-16 offsets, and `recursive-sections-v2` metadata survive embedding/storage.
Offsets are local to the loader document (a PDF page or spreadsheet row, rather than the raw file).
Heading context is included in embeddings while stored passage text stays verbatim. Empty/image-only
PDFs still require OCR; splitting cannot recover layout or text absent from extraction.

Existing ready documents are not rechunked. Reuploading as a new document applies the new splitter
without deleting old citation targets. There is no destructive live reindex operation in this change.

## Verification

Document embedding batches use a server adapter that propagates Gemini HTTP status and safe error
codes to the retry policy. The installed LangChain batch implementation otherwise replaces rejected
requests with empty vectors, hiding the failure behind `Invalid embedding response`. Transient
failures can now retry; terminal provider errors appear on failed uploads without exposing request
text or credentials. Query embeddings and the configured embedding model/dimensions are unchanged.
Google `RetryInfo` body delays are forwarded to the retry policy even when `Retry-After` is absent.
Unknown 429s use a bounded two-second retry delay; reported daily/zero allowances stop immediately.
Background batches contain up to 48 texts and share two provider concurrency slots per API process.
`GEMINI_EMBED_INPUTS_PER_MINUTE` defaults to 96, leaving headroom under the observed 100-input quota.
The limiter counts individual input texts, not HTTP batch requests, and waits before exceeding its
rolling-minute allowance. Provider 429s refund the rejected reservation and share a cooldown; explicit
provider delays are respected. This pacing is per API process; other processes/project clients can
still consume quota, so provider 429 handling remains necessary. Configure a larger allowance only
when your actual project quota supports it. Error logs
retain safe quota identifiers/values under `quotaLimits`, without the raw provider message. Check
[the key's project limits in AI Studio](https://aistudio.google.com/rate-limit) for the embedding
model's RPM, TPM, and daily allowance. Retries cannot increase an exhausted quota.

Each batch has a 15-second transport timeout and one automatic retry. Whole-document embedding has
a two-minute deadline that cancels outstanding calls and queued work. The document row exposes actual
completed/total sections, service waits, and saving progress; version guards reject stale or regressing
updates. The file becomes `ready` only after all chunks commit. The browser and server gradually back
off status polling rather than issuing one read every second indefinitely.

Verified vectors are cached by owner, configured model, and SHA-256 of the exact newline-normalized
embedding text. Cache entries contain hashes/vectors, not source text. Cache hits do not spend Gemini
quota; duplicate texts within a batch are embedded once and restored to their source order. Successful
batches survive a later failure, so retrying can resume from cache. New uploads still get their own
chunk IDs and citations. Cached vectors are never retrieved directly as document evidence. The cache
adds storage and is removed with its owning account. It does not assume that old chunks without model
provenance were generated by the currently configured model.

For the reported 25-page, 162-chunk PDF, a live replay completed paced embedding in 67,011 ms with no
429s; immediately replaying via cache took 2,659 ms and made zero provider calls. An actual document
retrieval successfully reranked 30 candidates with Pinecone: reservation 647 ms, provider 789 ms,
total reranking 1,437 ms. These are individual service-level measurements, not latency guarantees.
The first indexing pass still crosses a minute boundary under the observed free-tier quota. Keep
512/64 chunking as requested; increase provider quota for higher first-upload throughput.

`pnpm --filter api test` covers fusion, parameterized scope filters, one-branch failure, cancellation,
provider response validation, rate-limit fallback, hosted timeout, evidence budgets, and recursive
chunk source fidelity. Tests inject synthetic provider responses and make no live provider calls.
Run `pnpm validate` and `pnpm --filter api build` for the repository gate and compilation.

An isolated PostgreSQL 14 check also verified GIN-backed lexical SQL, ownership/readiness filters,
concurrent reservations at 499/500 and 59/60, provider circuit breakers, and expiration. No live
Pinecone quality comparison or labeled corpus evaluation is claimed. Exact page lookup,
evaluation reports, and versioned live rechunking remain separate work.

[limits]: https://docs.pinecone.io/reference/api/database-limits/rate-limits
