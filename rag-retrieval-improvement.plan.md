# RAG retrieval and chunking improvement plan

Date: 2026-11-03. Status: planned; application implementation has not started.

## 1. Objective and agreed decisions

Improve document answer accuracy through hybrid retrieval and Pinecone reranking. Measure the
contribution of each change before deciding whether to replace the current chunking strategy.

| Decision             | Agreed direction                                                                     |
| -------------------- | ------------------------------------------------------------------------------------ |
| Reranker             | Pinecone Inference, `bge-reranker-v2-m3`, on the free Starter plan                   |
| Allowance            | 500 reranking requests per month is sufficient for the current low-traffic stage     |
| Retrieval storage    | Keep PostgreSQL and pgvector; use Pinecone only for standalone reranking             |
| Latency              | Allow 1–2 additional seconds to first answer text when quality improves meaningfully |
| Evaluation files     | Existing uploaded documents plus public examples with verifiable answers             |
| Developer visibility | Local comparison reports and traces, outside the customer chat interface             |
| Chunking             | Keep existing chunks initially; evaluate alternatives on isolated copies             |
| Implementation scope | This document is the plan; no application changes or live reindexing yet             |

Pinecone currently documents 500 monthly Starter requests and 60 requests per minute for this
model. Its input limit is 100 passages per request and 1,024 tokens per query/passage pair.
Recheck these limits when implementing. See the [plan limits][limits] and [model specification][model].

An account on Starter and a server-side API key are implementation prerequisites. No paid upgrade,
Pinecone vector index, embedding migration, or CPU-hosted reranker is needed for the first release.

## 2. Verified baseline

- `apps/api/src/services/rag/config.ts`: 512-character chunks, 64-character overlap, top 8 sources,
  and 768-dimensional embeddings. These chunk sizes are characters, not tokens.
- `ingest/load-document.ts`: PDFs load page by page; Markdown uses a Markdown splitter; other
  formats use recursive character splitting. Scanned PDFs without usable text require unsupported OCR.
- `ingest/embed-chunks.ts`: stored metadata retains PDF page, spreadsheet sheet, and row.
- `retrieval.ts` and `retrieval-query.ts`: query embedding followed by exact cosine ranking over
  ready documents in the authorized user/document scope. No lexical branch, fusion, or reranker.
- The router chooses general/document questions and rewrites ambiguous follow-ups. It does not
  produce document-specific page or section lookup plans.
- Indexing waits, streaming, citation validation, background memory, and 15-message UI pagination
  already exist. Preserve optional-file chat, general-topic switches, and later document follow-ups.
  Conversation summaries provide memory, not document evidence. Display only actually referenced,
  validated citations; retrieving a candidate must not create a provisional source footer.
- `message-citation.ts` references chunk IDs with cascading deletion. `ingest/save-chunks.ts`
  replaces document chunks; reusing that path for experiments could remove historical citations.

## 3. Intended request path

```text
Authenticate -> load conversation/documents and persist user message
  -> determine question intent and authorized document scope
  -> wait for required documents if indexing
  -> choose retrieval path:
       general question -> existing general answer path
       explicit page/range -> ordered page lookup, optionally search within that scope
       topical document question -> vector candidates + lexical candidates
         -> deduplicate -> reciprocal rank fusion -> Pinecone reranker
  -> select evidence within a token budget -> grounded streamed answer
  -> validate citations -> persist answer -> existing asynchronous title/summary work
```

Broad summaries and comparisons need document/section coverage. Reranking a few topical passages
does not establish coverage of an entire document; evaluate these tasks separately.

## 4. Phase 1 — Establish evaluation data and baseline

- [ ] Inspect the agreed files to establish actual formats, languages, lengths, and extraction quality.
      Do not assume an English-only corpus or a specific distribution of document types.
- [ ] Prepare an initial 50-question set: proposed split of 30 development questions and 20 held-out
      questions. Increase the set if important formats or failure cases lack coverage.
- [ ] Include paraphrases, literal names/codes/dates, numbers, page/range lookups, tables, multiple
      files, follow-ups, unrelated general questions, broad summaries, and unanswerable questions.
- [ ] Label supporting document IDs, physical pages, and source spans in the original extracted text.
      Avoid labels tied only to chunk IDs, since chunk boundaries may change later.
- [ ] Record baseline evidence, answer support, first-token latency, completion latency, and retrieval
      timings. Separate warm/cold connections and indexing waits from ready-document request timings.
- [ ] Keep an immutable run manifest with question set, extraction/chunk versions, model IDs, query
      rewrite, retrieval settings, and environment. Review labels manually; do not fabricate relevance labels.

Deliverable: reproducible baseline results and a categorized list of current failures. Reserve held-out
questions for the final comparison; do not inject missing correct passages into candidate sets.

## 5. Phase 2 — Resolve documents and page addresses

- [ ] Introduce an internal retrieval plan containing mode, standalone question, selected document IDs,
      and explicit page constraints. Use deterministic parsing for clear locators; preserve the bounded
      model router for ambiguous intent and follow-up resolution.
- [ ] Prefer an explicitly named file or clearly referenced attachment. Use conversation context only
      when it identifies the file confidently; ask which file when several remain plausible.
- [ ] For “what is on page 2?”, fetch all page-2 chunks ordered by `chunkIndex`, removing overlapping
      duplicate text. Skip embeddings and reranking for this direct lookup.
- [ ] For “what does page 2 say about revenue?”, restrict both retrieval branches to that page.
      Explicit file/page restrictions are hard constraints; fallback must never broaden them silently.
- [ ] Cover page ranges, nonexistent pages, missing page metadata, and empty or image-only pages.
      Default to physical PDF pages and make the convention explicit. Printed page-label mapping needs
      extraction support; do not infer it from the physical page number or invent pages for DOCX/TXT.
- [ ] Bound range size and evidence tokens. If an addressed page/range exceeds the budget, summarize
      it in ordered batches or request a narrower range; do not silently drop most of the requested content.
- [ ] Add a page lookup index if query plans justify it, scoped by user, document, page, and chunk order.
      Refresh readiness before retrieval; wait for selected pending files rather than unrelated old uploads.

Deliverable: exact page lookup tests, including the reported page-2 failure and ambiguous file references.

## 6. Phase 3 — Add hybrid retrieval on existing chunks

- [ ] Add a PostgreSQL full-text representation and GIN index. Populate it from existing chunk text
      without regenerating embeddings or replacing chunk IDs. Use a bounded, resumable backfill.
- [ ] Select text-search configurations from observed languages. Preserve literal identifiers and
      quoted phrases; test punctuation, codes, and stopword-only questions explicitly.
- [ ] Treat built-in `ts_rank`/`ts_rank_cd` as PostgreSQL full-text ranking, not BM25. Do not add a
      separate search service or database extension without evidence that built-in search is inadequate.
- [ ] Derive a concise lexical query instead of AND-matching every word of a long standalone rewrite.
      Parameterize search input and define empty-query and no-match behavior.
- [ ] Start with 20 vector candidates and 20 lexical candidates. Schedule lexical retrieval alongside
      query embedding where practical; measure connection contention and avoid unnecessary serial reads.
- [ ] Apply ownership, selected documents, readiness, and page restrictions to both branches. Keep
      exact vector ranking within the indexed scope until larger-scale measurements justify another method.
- [ ] Deduplicate identical chunk IDs and fuse ranks with reciprocal rank fusion. Start with equal
      branch weights and an RRF constant of 60; tune on development questions only. Never directly add
      cosine similarity and lexical scores as though they have the same scale.
- [ ] Retain branch scores, ranks, and provenance internally, with deterministic tie-breaking. Deduplicate
      overlapping passages without losing distinct supporting evidence from different pages/documents.

Deliverable: vector-only, lexical-only, and hybrid results on identical existing chunks, plus query-plan
checks confirming the indexes and filters work under realistic document scopes.

## 7. Phase 4 — Integrate Pinecone reranking

- [ ] Create a server-only adapter for Pinecone's standalone rerank endpoint using `bge-reranker-v2-m3`.
      Send the question and selected candidate text with stable chunk IDs; PostgreSQL remains authoritative.
- [ ] Begin with at most 40 fused candidates, below the 100-passage limit. Fit the question, useful
      heading context, and each passage within the model's 1,024-token pair limit. Use an appropriate
      tokenizer and explicit handling of long inputs; record any shortening rather than silently truncating.
- [ ] Map response indices back to the original authorized candidates. Validate finite scores, indices,
      duplicates, and output shape; reject unknown candidates instead of trusting returned document text.
- [ ] Select up to 8 evidence chunks within a fixed token budget. Reranker scores are ordering signals,
      not answer-confidence percentages. Calibrate evidence sufficiency on labeled data; allow fewer or
      zero sources, rather than forcing eight weak matches into every answer.
- [ ] Use a maximum additional reranking deadline of 2 seconds, inherited request cancellation, and no
      automatic provider retries on the answer path. Return fused hybrid ranking on timeout, unavailable
      credentials, malformed responses, rate limiting, provider errors, or quota exhaustion.
- [ ] Preserve successful lexical retrieval if embedding fails, and successful vector retrieval if lexical
      search fails. When all retrieval fails, retain the existing honest document-search failure behavior.
- [ ] Cache by owner, authorized document set and content version, normalized question, candidate
      IDs/text hashes, model, and parameters. Recheck authorization/readiness and invalidate on changes.
- [ ] Track dispatched calls, returned usage, cache hits, and fallback reasons. Budget evaluation calls
      as part of the same 500 monthly requests; stop calls on reported monthly exhaustion. Coordinate any
      counters across API processes and verify the provider's reset period instead of guessing it.
- [ ] Keep full candidate traces out of ordinary production logs; send only the selected candidate
      text to Pinecone. Secrets stay in API environment configuration and never reach the browser.

Deliverable: live Pinecone smoke results, deterministic adapter/fallback tests, and measured added latency.
Self-hosted CPU inference remains a future option if the accepted free allowance later becomes inadequate.

## 8. Phase 5 — Generate developer-only comparison results

- [ ] Add a local evaluation command that writes an HTML report and machine-readable JSON outside
      public web assets. It must not add customer controls, SSE debugging payloads, or public debug routes.
- [ ] Compare five arms: current vector-only; lexical-only; hybrid; vector + reranker; hybrid + reranker.
      Hold chunks, embedding model, document scope, standalone question, answer model, and evidence-token
      budget constant. Use the same vector candidate pool for hybrid and vector-reranker comparisons.
- [ ] Show original and rewritten questions, selected files/pages, passage text, branch ranks/scores,
      fusion rank, reranker score, final rank, supporting source labels, timings, and fallback reasons.
- [ ] Explain provenance through fields and rank movement, not invented model explanations. Highlight
      both improvements and regressions, including cases where the correct passage was never retrieved.
- [ ] Measure candidate recall at the configured pool size (up to 40), final evidence Recall@8 and
      nDCG@8, page/document selection,
      answer support, citation faithfulness, and correct abstention. Report task-specific breakdowns.
- [ ] Ground relevance in original document spans. Across different chunkings, count a supporting span
      once rather than rewarding many overlapping chunks that repeat the same answer.
- [ ] Measure p50/p95 time to first text and completion, plus stage timings and provider call counts.
      Use repeatable offline/cache runs for logic checks; distinguish these from live provider latency.
- [ ] Estimate the call budget before each live run. With 50 questions and two reranked arms, one
      uncached pass uses up to 100 requests; repeated chunking/model experiments also consume allowance.
      Cache reusable outputs and permit explicit query subsets instead of automatically spending the quota.
- [ ] Keep real documents, private passages, credentials, and generated reports out of source control.

Deliverable: a report showing whether hybrid + Pinecone improves actual evidence and answers. A reranker
can only reorder its input; analyze candidate recall separately from final ranking quality.

## 9. Phase 6 — Evaluate chunking changes only where needed

- [ ] Inspect failures for broken paragraphs, missing headings, split tables, extraction errors, excessive
      overlap, or missing neighboring context before choosing a remedy.
- [ ] On isolated copies, compare the current 512-character/64-character splitter against paragraph-aware
      targets of 256 tokens with 32-token overlap and 384 tokens with 48-token overlap. These are
      experimental settings, not predetermined production defaults. Record the tokenizer used.
- [ ] Preserve PDF page boundaries, original source offsets, ordered chunk positions, section headings
      when available, and spreadsheet sheet/row metadata. Do not assume headings exist in plain PDF text.
- [ ] Test table-aware blocks that repeat headers with row groups. Diagnose extraction separately:
      chunking cannot reconstruct tables, formulas, images, or OCR text that the loader never extracted.
- [ ] Test limited adjacent-chunk expansion after reranking. Keep expansion within the selected file/page
      constraints and evidence budget, deduplicate overlap, and cite the actual expanded supporting chunks.
- [ ] Compare alternatives with the winning retriever held constant, using the same source-span labels
      and evidence-token budget. Measure accuracy, token cost, chunk count, indexing time, and storage.
- [ ] Evaluate broad summaries through document/section coverage. Hierarchical summaries, OCR,
      printed page labels, and advanced layout parsing are follow-up work if the failure analysis warrants them.

Deliverable: keep current chunking or select an alternative with documented gains and tradeoffs. Live
reindexing is a separate rollout decision; a chunking change is not required to ship hybrid retrieval.

## 10. Phase 7 — Validate and roll out

- [ ] Add a retrieval mode switch: baseline vector, hybrid, or hybrid + Pinecone. Keep experimental
      chunk settings and private evaluation options separate from customer-facing configuration.
- [ ] Run the held-out comparison after tuning. Require a measurable improvement in evidence ranking
      and supported answers, no ownership/page-scope regressions, and no increase in unsupported claims.
      Define the numerical quality gate from the baseline before tuning, then freeze it for the final run.
- [ ] Target p95 added latency of at most 2 seconds for ready-document questions relative to the
      matched baseline. Report sample sizes, cold requests, failures, and concurrent load separately.
- [ ] Test indexing waits/cancellation, general-topic switches, later document follow-ups, failed files,
      insufficient evidence, provider failures, quota exhaustion, citation rendering, and history pagination.
- [ ] Run meaningful Node test-runner checks and `pnpm validate`; use live calls only for selected
      quality/latency checks. Never make provider calls part of routine automated test execution.
- [ ] Keep historical chunks/citations intact. If rechunking is selected, design versioned storage and
      adjust the current `(document_id, chunk_index)` uniqueness before enabling multiple generations.
      Switch active retrieval versions atomically; retain referenced old chunks and provide rollback.
      Do not use the current delete-and-replace ingestion path to backfill live documents.
- [ ] Update backend/frontend documentation, configuration examples, and performance notes to match
      the shipped behavior. Enable the winning mode after reviewing the actual developer report.

Completion means the report exists, page questions work, hybrid + Pinecone has measured value, and
the normal chat experience retains its grounding, streaming, indexing, and citation guarantees.

## References

- [Pinecone Starter pricing](https://www.pinecone.io/pricing/)
- [Pinecone monthly and per-minute limits][limits]
- [Pinecone BGE reranker model and input limits][model]
- [Pinecone standalone rerank API](https://docs.pinecone.io/reference/api/latest/inference/rerank)
- [PostgreSQL text search ranking](https://www.postgresql.org/docs/current/textsearch-controls.html)
- [PostgreSQL GIN indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html)
- [Reciprocal rank fusion paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)

[limits]: https://docs.pinecone.io/reference/api/database-limits/rate-limits
[model]: https://docs.pinecone.io/models/bge-reranker-v2-m3
