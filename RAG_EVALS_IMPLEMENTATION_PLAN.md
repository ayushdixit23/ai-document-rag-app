# RAG evaluation implementation plan

Status: proposed implementation; this document adds no evaluation code or runtime changes.
Prepared: 3 November 2026.

## 1. What we are building

Build a small, opt-in evaluation tool that answers four questions:

1. Did AskDocs search the right documents and find the evidence needed?
2. Did its answer correctly use that evidence and cite it?
3. Did it handle missing evidence, follow-up questions, and service failures correctly?
4. Did a proposed change improve quality without unacceptable latency or cost?

An **eval** is a repeatable example with an input, a definition of a good result, and a scoring
rule. A **dataset** groups these examples. A **baseline** records the current implementation's
results. A **regression** means a later implementation performs worse on comparable examples.
Some rules are ordinary code; others require a person or an AI model acting as a **judge**.
An AI judge provides a useful estimate, not a guarantee of correctness.

**Recommended approach:** repository-owned TypeScript tooling, versioned local datasets, local
JSON/Markdown reports, and isolated live-provider runs. Start with offline evaluation: running a
curated dataset outside user traffic. Offline does not necessarily mean no network; distinguish
the network-free fixture check from optional live-model benchmarks explicitly.

The first useful milestone is a trustworthy current baseline, not a higher score or a new RAG
architecture. Do not tune the pipeline while building its measuring tool.

## 2. Current repository findings

The plan is based on the implementation, including these useful integration points:

| Area                  | Existing implementation                                                                       | Implication for evals                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Turn execution        | `apps/api/src/services/rag/query-pipeline.ts`: `runQueryPipeline` accepts `QueryDependencies` | Exercise the real orchestration with controlled dependencies.                                                |
| Request preparation   | `prepare-turn.ts` loads user state and writes a user message                                  | Construct a fixture `PreparedTurn`; do not call this in the benchmark.                                       |
| Production wiring     | `answer-turn.ts` wires models, persistence, and summary jobs                                  | Supply eval wiring separately; do not import the production entry point.                                     |
| Routing               | `select-route.ts`, `router.ts`, `quick-route.ts`, `route-policy.ts`                           | Evaluate document/general choices, rewrites, and fallback behavior.                                          |
| Retrieval             | `retrieval.ts`, `search-candidates.ts`, `retrieval-query.ts`                                  | Reuse production retrieval and its ownership/readiness filters.                                              |
| Search modes          | `vector`, `hybrid`, `hybrid_rerank`                                                           | Compare existing modes without changing the live configuration.                                              |
| Evidence selection    | `config.ts`, `evidence.ts`                                                                    | Current defaults: 20 candidates per search branch, at most 8 sources, estimated 4,000-token evidence budget. |
| Reranking             | `rerank.ts`, `rerank-budget.ts`, `pinecone-rerank.ts`                                         | Hosted calls reserve database quota and can fall back to local BM25.                                         |
| Prompts and citations | `prompt.ts`, `citations.ts`                                                                   | Reuse answer prompts and citation parsing; score raw answer markers too.                                     |
| Ingestion             | `ingest/load-document.ts`, `split-document.ts`, `embed-chunks.ts`                             | Build fixtures with the actual loaders, splitter, and embedding preparation.                                 |
| Chunk provenance      | `ingest/embed-chunks.ts`                                                                      | Chunk IDs are random; metadata includes page, sheet, row, heading, source offsets, and chunk version.        |
| Caches                | `retrieval-cache.ts`, `embedding-cache.ts`                                                    | Separate cold/warm retrieval and account for corpus embedding reuse.                                         |
| Existing tests        | `query-pipeline.test.ts`, `retrieval.test.ts`, other `*.test.ts`                              | Reuse the established `node:test` + `tsx --test` approach.                                                   |
| Workspace tooling     | Root `package.json`, `turbo.json`, `apps/api/tsconfig.json`                                   | Package scripts belong to `api`; CLI files can stay outside the production `src` build.                      |

Important implementation details:

- Existing instructions say there is no test framework, but current package scripts and test files
  already use Node's built-in runner. Adding Jest, Vitest, or Python is unnecessary for this plan.
- `config/env.ts` validates several application credentials at import time; `db/index.ts` creates
  the database client at import time. Live adapters must bootstrap their environment before
  dynamically importing these modules. Network-free commands must avoid those imports entirely.
- `RAG_RETRIEVAL_MODE` is read at module initialization. Compare configurations in separate child
  processes rather than changing `process.env` inside an already imported module graph.
- The final source list contains selected evidence, not the complete candidate pool or every
  intermediate score. Initial retrieval metrics apply to that final evidence. Intermediate-stage
  diagnostics must not be claimed as available without additional instrumentation.
- `parseCitations` filters to known source numbers. An answer containing `[999]` can therefore
  leave no invalid entry in the parsed citations. Check raw answer markers independently.
- `apps/api/RETRIEVAL.md` documents custom SQL migrations, including `reserve_rerank_call`.
  Eval database setup must use migrations; `db:push` alone is insufficient.
- Record resolved model names explicitly. The embedding default in `config/env.ts` currently
  differs from `env.example`; never infer a benchmark's model from the example file.

## 3. Isolation rules: preserve the current pipeline

These are implementation acceptance criteria, not just intentions:

1. No eval imports, judge calls, report writes, or callbacks are added to production request paths.
2. No changes to current routing, prompts, models, chunk sizes, source limits, timeouts, streaming
   events, public response contracts, or user-facing UI are required for the initial implementation.
3. No production schema migration, document reindex, historical citation change, or live chat write.
4. Eval commands are explicit. They are not dependencies of `dev`, `start`, `build`, `validate`,
   pre-commit, or pre-push. Existing tests and checks retain their current behavior.
5. Live evals use a separate PostgreSQL database with its own credentials and the same migrations.
   A user ID, table prefix, or rerank scope in the production database is insufficient isolation.
6. Use separate provider projects/accounts or independently allocated quota for embeddings,
   answers, and hosted reranking. A different API key in the same project may share quota. A new
   database rerank counter cannot protect the production project's allowance. If dedicated
   capacity is unavailable, keep live-provider execution unavailable and use fixtures/replay.
7. The eval runner never imports `src/index.ts`, `app.ts`, `answer-turn.ts`, auth initialization,
   queues, workers, email sending, or the R2-backed `ingestDocument` entry point.
8. For full query runs, use an in-memory stream, capture assistant saves locally, and record summary
   scheduling as an event without enqueueing it. Document readiness comes from fixture state.
9. All eval setup/cleanup affects only the verified evaluation database and known fixture owners.
   Never invoke the repository's general database-clear scripts.

Separate processes alone do not isolate database load or provider quotas. Dedicated resources are
what protect production performance. The planned CLI has zero added work on the live answer path;
actual benchmark throughput still depends on the resources assigned to it.

## 4. Architecture and file layout

Keep the runner alongside the API, outside the production TypeScript source tree:

```text
apps/api/evals/
  README.md                    # setup, commands, interpreting reports
  tsconfig.json                # noEmit project for eval code and imported API types
  config/env.ts                # only eval environment parser/bootstrap mapping
  cli.ts                       # command dispatch; no eager live imports
  schema.ts                    # Zod schemas for cases, manifests, results
  datasets/
    smoke.jsonl
    development.jsonl
    holdout.jsonl
  fixtures/
    corpus/                    # small synthetic/public source files
    corpus-manifest.json       # source hashes, parser/chunker and embedding provenance
    replay/                    # small versioned, sanitized harness-check outputs
  adapters/
    fixture.ts                 # deterministic, no-network dependencies
    live.ts                    # real routing, retrieval, generation
    turn.ts                    # fixture-to-PreparedTurn conversion and capture wrappers
  corpus/
    seed.ts                    # controlled local fixture loading/embedding/insertion
    evidence-map.ts            # semantic evidence anchors -> runtime chunk IDs
  metrics/                     # retrieval, citations, rules, answer judge
  runner/                      # execution, limits, timeouts, manifests, comparison
  reports/                     # JSON, Markdown, failure details
  artifacts/                   # ignored local runs and judge cache
```

This is a responsibility map; create modules when their implementation is needed. Keep functions
and files within repository size/complexity rules. Use ESM `.js` imports and existing Zod 4 APIs.
Do not copy production retrieval, prompt construction, or ranking algorithms into eval code.

Dependency direction: **eval CLI -> existing RAG exports**. Production modules never import evals.
Keep this inside `api` while it has one consumer; extract a workspace package only if another
application later needs the same tooling.

Add `evals/tsconfig.json` extending the API's configuration with `rootDir` covering the API
directory, `noEmit: true`, `incremental: false`, and eval source inclusion. Ensure ESLint's
project service recognizes this nearest TypeScript project. The existing production build
continues to include `src/**/*` only. Add a separate eval typecheck command.

### Four independently runnable profiles

| Profile                 | Executes                                                                             | Purpose                                                                         | External resources                                         |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Fixture smoke           | Real query orchestration with deterministic dependencies and real metric/report code | Check the harness and critical behavior quickly                                 | None                                                       |
| Routing                 | Existing `selectRoute`/router with labeled turns                                     | Check routing, bypass paths, and rewrite intent                                 | Dedicated Gemini quota when the model is needed            |
| Retrieval               | Real `retrieveSources` with a fixed standalone question and fixture scope            | Measure final evidence quality without generation noise                         | Eval DB, query embeddings, optional hosted rerank          |
| Generation / full query | Real prompt + model on fixed evidence, or real `runQueryPipeline` with live adapters | Separate answer quality from retrieval failures, then measure combined behavior | Dedicated model quota; full query also uses eval retrieval |

The generation-only variant uses gold evidence selected independently of current retrieval.
Full query runs use actual retrieved evidence. Label these separately in every report.
Neither fixture smoke nor replay proves current live-model quality. The in-memory stream does
not test HTTP transport, authentication, admission limits, browser rendering, or actual SSE
backpressure; keep existing integration checks and tests for those concerns.

### Environment bootstrap

Use an explicit ignored `apps/api/.env.evals` and a committed `.env.evals.example`. Proposed settings
include `EVAL_DATABASE_URL`, dedicated provider credentials, `EVAL_JUDGE_MODEL`, concurrency, call
and token caps, output directory, and optional versioned pricing configuration. Do not add required
eval variables to production `src/config/env.ts`.

The CLI validates configuration before importing live modules. Start a child process with an
allowlist of environment variables, mapping eval credentials into existing API variable names.
Run it from an isolated working directory without an application `.env`, because the existing
API configuration calls `dotenv.config()` automatically. Resolve fixture, script, and report paths
absolutely. Prevent fallback to developer/production `.env` values. Supply inert local values for
unrelated required auth/email configuration; never initialize those services.

Before any live import or write, verify an explicitly configured database identity and an
eval-only marker provisioned during database setup. Refuse production mode, an unrecognized
database, absent dedicated quota configuration, or a missing explicit `--live` flag. Setup itself
must use an explicit allowlisted eval database identity before creating the marker. Database and
provider credentials are never included in reports.

## 5. Dataset: the most important part

Start with **12 smoke cases and 40 reviewed quality cases** across about 8 small source files.
Use roughly 30 quality cases for development and 10 as a holdout, grouped by source document and
scenario family so paraphrases and near-duplicates do not cross the split. The holdout is a
sanity check at this size, not a statistically precise quality estimate. Grow toward 100+ reviewed
cases after the first baseline and actual failure analysis.

Use synthetic or redistributable documents initially. Include all supported formats over time:
PDF, DOCX, TXT, MD, CSV, and XLSX. Use deliberately conflicting and irrelevant documents so merely
finding a keyword does not count as success. Treat scanned PDFs as an expected unsupported-input
case; do not assume the current pipeline has OCR.

Required coverage, with overlapping tags allowed:

- Direct fact lookup, exact identifiers, dates, quantities, units, and paraphrased questions.
- Questions needing two passages or two documents; conflicting facts with an explicit version/date.
- Follow-ups requiring conversation context, topic switches, returning to files, and upload-only turns.
- Missing answers, no documents, irrelevant documents, and partial evidence requiring qualification.
- Processing, failed, deleted, unselected, and other-user documents; two fixture owners minimum.
- Tables/spreadsheet rows, PDF page attribution, long questions, and Unicode/non-English text.
- Document text attempting to override instructions, fabricate citations, or reveal unrelated data.
- Embedding/search/rerank/router failures, timeout, cancellation, and local rerank fallback. Inject
  failures deterministically rather than repeatedly provoking provider outages.
- History containing old citations and summaries with unsupported facts. A summary is not evidence.

### Case schema

Each case stores input and expectations separately. Only input reaches AskDocs; reference answers,
required claims, and gold evidence are available only to evaluators or a generation-only fixture.

```json
{
  "id": "leave-policy-01",
  "schemaVersion": 1,
  "tags": ["direct-fact", "citations"],
  "split": "development",
  "input": {
    "owner": "employee-a",
    "documentKeys": ["leave-policy-v1"],
    "newAttachmentKeys": [],
    "question": "According to the leave policy, how many annual leave days are provided?",
    "history": [],
    "summary": null
  },
  "expected": {
    "route": "documents",
    "behavior": "answer",
    "requiredClaims": ["Employees receive 24 days of annual leave."],
    "referenceAnswer": "The policy provides 24 days of annual leave.",
    "requiredEvidenceGroups": [
      { "id": "annual-leave", "anyOf": ["leave-policy-v1:annual-leave-clause"] }
    ],
    "citationsRequired": true,
    "forbiddenDocumentKeys": ["other-owner-policy"]
  }
}
```

Validate the full schema: duplicate IDs, invalid document references, contradictory expectations,
missing gold for answerable cases, split leakage, and unresolved evidence are setup errors.
Store expected failure/abstention behavior explicitly. Never grade a missing-answer case as if
it were an answerable question. Review generated cases and labels against original source files;
unreviewed synthetic labels must not define a release gate.

### Stable evidence labels

Do not commit random database chunk IDs as the ground truth. Give each source a logical key and
content hash. Define human-readable evidence anchors with exact quotes and page/sheet/row plus
loader-local offsets where available. Map anchors to actual chunk IDs during fixture setup.

An evidence group represents one required fact; multiple overlapping chunks can satisfy it.
For multi-passage questions, require every evidence group. Count each group once, even if several
retrieved chunks overlap it. If offsets or text change, fail label validation and review the
mapping; do not silently remove unmatched labels from the metric denominator.

Use production `loadAndSplit` and `embedChunks` on local files, then insert fixture rows into the
eval database through a narrow seeder. This measures loaders/chunking without requiring R2 or
starting workers. Record source hashes, extraction/chunk versions, embedding model/dimensions,
and the resulting corpus manifest. Rebuild only when those inputs change. Record expected loader
failures separately. A future queue/R2 ingestion benchmark can be a separate project.

## 6. Metrics and how to read them

Report each metric with its numerator, denominator, applicable case count, and failed case IDs.
Avoid one combined "RAG score": good answer wording must not conceal missing evidence or a leak.

| Metric                          | Definition / interpretation                                                                    | Method                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Route accuracy                  | Correct document/general choice divided by applicable labeled turns                            | Deterministic comparison of actual route output                                       |
| Rewrite preservation            | The standalone question preserves the entity, question, and required conversational reference  | Human-reviewed rubric; judge-assisted later                                           |
| Evidence hit rate@8             | Fraction of answerable cases with at least one required evidence group in final sources        | Anchor matching                                                                       |
| Evidence coverage@8             | Required evidence groups found divided by all required groups, averaged per case               | Anchor matching; primary retrieval metric                                             |
| MRR@8                           | Mean reciprocal rank of the first relevant final source; zero when none is found               | Anchor matching; complements coverage                                                 |
| Relevant-source fraction        | Relevant selected sources divided by returned selected sources                                 | Only when relevance labels cover the evaluated corpus; otherwise report as incomplete |
| Citation validity               | Raw `[n]` markers that refer to a current source divided by all raw citation markers           | Inspect answer text independently of `parseCitations`                                 |
| Citation coverage               | Factual document claims with a supporting attached citation divided by factual document claims | Judge/human claim assessment                                                          |
| Citation support                | Cited claims actually supported by the cited passage                                           | Judge/human assessment, not marker matching                                           |
| Faithfulness                    | Factual document claims supported by provided evidence divided by factual document claims      | Judge/human assessment                                                                |
| Answer correctness/completeness | Required claims correctly answered without contradictions against reviewed references          | Exact checks for suitable facts; judge/human otherwise                                |
| Abstention behavior             | Correctly explains insufficient evidence, unavailable search, or unavailable files             | Behavior-specific rubric; phrases alone are insufficient                              |
| Scope violations                | Any returned/cited evidence from a forbidden owner/document or non-ready document              | Deterministic critical check plus real-database cases                                 |
| Reliability                     | Completed, failed, timed-out, cancelled, and degraded cases, including fallback rates          | Runner outcome records                                                                |
| Performance and cost            | Retrieval duration, first answer token, complete query duration, provider usage/calls          | Monotonic timings, available provider metadata, estimates clearly labeled             |

Here `@8` means at most eight final selected sources, matching today's `TOP_K`; store the resolved
value in the report. These are evidence-group metrics, not a claim to implement Ragas's exact
context-recall algorithm. Defer nDCG until graded relevance labels exist, and defer candidate-stage
recall until intermediate candidates are actually observable.

Scoring rules that prevent misleading results:

- No raw citation markers means citation validity is `not_applicable`, not 100%. If the case
  requires citations, missing citations still fail its citation requirement.
- No factual document claims means faithfulness is `not_applicable`; an empty answer or unnecessary
  refusal still fails answer correctness/completeness on an answerable case.
- Empty retrieval on an answerable case scores zero evidence coverage and reciprocal rank.
- Empty retrieval on an unanswerable case is not a retrieval-recall example; score its behavior.
- Infrastructure/model/judge failures are explicit outcomes, never silent passes. Report successful
  case quality separately from all-case completion and failure counts. Unexpected incomplete runs
  cannot pass a comparison gate.
- Compare selected evidence and citations against the case's allowed scope even if the answer is
  otherwise correct. Existing SQL-shape unit tests alone do not prove actual database isolation.
- Evaluate route choices in the routing profile through existing exports; do not make a second
  hidden routing call during a full query. Capture outputs when invoked and mark bypassed stages
  explicitly. Avoid parsing system-prompt text to recover internal state.

## 7. AI judge: optional and calibrated

Add the judge after deterministic metrics and the first retrieval report work. Use the existing
Gemini integration with a separately configured judge model and dedicated credentials; verify model
availability at implementation time. Keep the judge client separate from the answer model and its
settings. Prefer a different model where practical and record same-family evaluation bias.

Use short, versioned rubrics for correctness, faithfulness, citation support, and abstention.
Require structured output containing per-criterion results, relevant claim/passage references,
and brief evidence-based explanations. Do not request hidden reasoning. Treat candidate answers
and source documents as untrusted judge inputs, with no tools or execution permissions.

Human-label about 20 varied answer examples, including correct, wrong, unsupported, unnecessary
refusal, and adversarial answers. Measure agreement and false passes, inspect disagreements, and
repeat a subset to check stability. Low temperature reduces variability but does not make judging
deterministic. Keep judge scores advisory until this calibration is convincing; no universal
agreement percentage is assumed. A judge/rubric change requires re-scoring the saved baseline and
candidate answers with the same judge configuration.

Cache **judge assessments**, keyed by case/reference hash, question/history, answer, evidence,
judge identity/settings, and rubric hash. Do not reuse generated answers when claiming to measure
a new pipeline/model configuration. A replay/re-score report must say it reused saved outputs and
cannot provide fresh runtime latency. Mask candidate/baseline names in comparative judging and
alternate answer order if pairwise judging is added later.

## 8. Performance, reproducibility, and budget controls

- Default fixture smoke target: finish in about 10 seconds with no credentials, database, provider
  calls, or API server. Measure this target after implementation; it is not a current result.
- Default live execution: one case at a time, bounded provider pacing, and at most one judge request
  concurrently. Increase throughput only within the dedicated projects' observed quota.
- Require an explicit live flag and print the planned case/call/token budget before dispatch.
  Start with a conservative configurable cap, such as USD 2 estimated per exploratory run, plus
  hard maximum calls and tokens. Dollar limits require an explicit dated pricing configuration;
  otherwise report cost as unknown and rely on hard usage caps. Reserve worst-case allowance for
  in-flight work before dispatch. A local estimate is not a guaranteed provider billing cap.
- Count embedding inputs, answer/router requests, rerank requests/units, judge requests, retries,
  and ingestion separately. Corpus preparation cost is outside query latency but still in run cost.
  Collect actual usage metadata when exposed; never label a token estimate as billed usage.
- Apply per-case and overall run deadlines. Preserve existing router/retrieval/model retry policies
  in measured live calls. Runner/judge-only retries are bounded and counted; do not retry until a
  bad answer becomes a good one. Always abort, flush partial results, and disconnect database
  clients on exit. Resource polling and document-wait tests use deterministic fixture clocks.
- Run each retrieval configuration in a clean child process. For cold-cache latency, use a fresh
  process per measured case and exclude process startup from the query timer. For warm-cache
  latency, explicitly repeat the identical case in one process and identify the priming call.
  Keep production cache behavior and document-version arguments intact.
- Record p50/p95 for retrieval, first answer token, and full query separately. First answer token
  means the first non-empty `token` event, not `meta` or `sources`. Exclude corpus setup and judge
  time from answer latency; show overall benchmark duration separately. Report sample counts;
  a tiny smoke set cannot establish a reliable p95 or production load capacity.
- Reuse a frozen corpus to compare retrieval modes. Changing the embedding model or chunking
  requires a separately built, versioned corpus; never mix embeddings from different models.
- Repeat stochastic baseline/candidate runs at least three times when investigating meaningful
  changes. Use matched cases, model settings, corpus, environment, cache policy, and judge/rubric.
  Interleave configurations to reduce time-of-day provider bias. Report variation and paired
  deltas; add confidence intervals when the dataset is large enough to make them useful.
- Separate clean success, search-branch degradation, and local rerank fallback. Never label a run
  as a hosted rerank result solely because `hybrid_rerank` was requested. Use existing isolated
  debug diagnostics where available; if the outcome cannot be established, label it unknown.
  Phase one does not require a production tracing/instrumentation refactor.

Every run manifest includes Git SHA and dirty status/content fingerprint, dataset and corpus
hashes, resolved model IDs/settings, source/prompt-code fingerprints, retrieval mode, actual
rerank path where observed, cache policy, runtime versions, timestamps, evaluator version, rubric
hash, limits, repetition count, and environment class. Do not record secrets or credential-bearing
URLs. Provider aliases may drift; model identity plus saved outputs is not perfect reproducibility.

## 9. Reports and comparison policy

Write one ignored artifact directory per run:

```text
artifacts/<run-id>/
  manifest.json
  cases.jsonl                  # incremental results; retained after interruption
  summary.json
  report.md                    # aggregate + category results + failures
  comparison.md                # optional compatible-baseline comparison
```

Each case records outcome, rewritten question if observed, allowed scope, returned evidence,
answer, raw and parsed citations, metric applicability/results, timings, usage, and sanitized
errors. Default console output is a brief summary with a report path. Render all source/answer
text safely as text in reports; it is untrusted content.

Commit reviewed datasets, synthetic fixtures, rubrics, and a small baseline summary when useful.
Ignore `.env.evals`, full run artifacts, downloaded/private documents, and judge caches. Sanitize
any future real-user example before dataset inclusion. Do not automatically export documents,
answers, or traces to an external dashboard.

The comparison command checks compatibility before computing paired changes. Dataset/corpus,
metric/rubric version, and cache/environment class must match; explicitly identify which pipeline
variable changed. Judge changes require common re-scoring. Missing cases, mismatched references,
or unrecognized configurations produce an invalid comparison rather than an apparent improvement.

Initial policy:

- Fixture contract checks, label validity, and real-database scope checks must pass completely.
- Any observed scope leak is critical, regardless of aggregate quality. Flag fabricated citation
  markers and unsupported material answers per case for review.
- First live quality runs are **report-only**. Establish the current baseline before declaring
  floors for evidence coverage, answer quality, or latency. Do not invent a universal pass score.
- After several stable runs, store approved absolute floors and allowed paired regressions in a
  versioned gate configuration. Start with deterministic checks; keep judge scores advisory until
  calibrated. Small datasets require inspecting individual changed cases, not just percentages.
- Baselines are promoted deliberately with a short reason. Never auto-replace a baseline after a
  failing run. A quality problem discovered by evals becomes a separate pipeline change.

CLI outcomes should distinguish success, a valid quality-gate failure, and an invalid/incomplete
run with separate exit codes. Report-only runs may exit successfully with quality warnings but
must still fail on setup errors or unexpected incomplete execution.

## 10. Commands and monorepo integration

Proposed commands below are a future interface, not commands available in the repository today:

```bash
pnpm --filter api run evals:check
pnpm --filter api run evals:smoke
pnpm --filter api run evals:check-types
pnpm --filter api run evals:seed --env-file .env.evals --live
pnpm --filter api run evals:run --profile routing --dataset development --live
pnpm --filter api run evals:run --profile retrieval --dataset development --live
pnpm --filter api run evals:run --profile generation --dataset development --live
pnpm --filter api run evals:run --profile full --dataset holdout --live
pnpm --filter api run evals:compare --baseline <baseline-path> --candidate <run-path>
```

`evals:check` validates committed cases and labels against prepared fixture metadata without
calling providers. `evals:smoke` executes the deterministic harness, scoring, and report checks.
`evals:seed` prepares only the allowlisted eval database and is independently budgeted. Live runs
default to report-only unless an explicit versioned gate configuration is supplied.

Define scripts in `apps/api/package.json`, using existing `tsx` and Node's test runner. Register
opt-in tasks in `turbo.json`; optional root convenience scripts only delegate through
`turbo run <task> --filter=api`. All evaluation execution, seed, replay/report, and comparison tasks
use `cache: false` initially so a previous run cannot be mistaken for fresh execution. Declare
eval-specific environment access at the task level under Turbo strict environment mode; do not
put eval secrets into `globalEnv` or use a loose environment fallback.

Do not add live evals to hooks or the current read-only validation gate. Include the separate eval
typecheck and deterministic checks in implementation review instructions. There is currently no
`.github` workflow directory; introduce a small manual/CI workflow only after local runs are stable.
Network-free smoke can later run on pull requests. Live runs remain manual or scheduled with
dedicated secrets and explicit budgets; do not expose credentials to untrusted PR code.

## 11. Implementation sequence and definition of done

### Phase 1 — Foundation and zero-network smoke

- Add eval schemas, isolated CLI/config bootstrap, fixture adapters, JSONL result writer, and
  Markdown report generation. Keep all production source files unchanged.
- Add the 12 smoke cases and deterministic metric tests, including deliberately wrong answers,
  `[999]`, missing citations, evidence-group deduplication, and malformed/unresolved labels.
- Use existing pipeline exports with locally captured saves and summary events. Verify no network,
  database access, queue activity, or production server startup occurs.
- Add eval TypeScript/ESLint coverage and opt-in package/Turbo tasks.

Done when smoke runs without secrets, reports useful failures, and current application build and
tests still work. The no-network guarantee should be checked with denied network access or
explicit failing network/provider test doubles, not just absence of credentials.

### Phase 2 — Reviewed corpus and retrieval baseline

- Create the small multi-format corpus, 40 reviewed quality cases, holdout split, and evidence maps.
- Provision a dedicated database/provider quota; apply existing migrations, verify isolation, and
  seed fixture users/documents/chunks with provenance.
- Run `vector`, `hybrid`, and `hybrid_rerank` separately on the same corpus. Distinguish hosted
  reranking from local fallback. Add real-database cross-owner/unselected/non-ready cases.
- Save retrieval coverage, hit rate, MRR, category failures, cold/warm latency, and usage.

Done when the real retriever has a reproducible report, all labels resolve, the database scope
checks pass, and hosted/fallback results are honestly identified. No retrieval tuning is included.

### Phase 3 — Routing, answers, and calibrated judges

- Add labeled routing/rewrite cases, generation on gold evidence, and full query runs through
  `runQueryPipeline` with real routing/retrieval/model dependencies and in-memory persistence.
- Add raw citation checks, reviewed claim rules, optional judge rubrics, judge-result caching,
  human calibration, and explicit incomplete-run handling.
- Record first-token/full-query latency and case-level fallback behavior. Cover summary/history
  grounding, insufficient evidence, prompt injection, and cancellation.

Done when failures can be localized to routing, retrieval, or generation and judge reliability is
documented. Quality results may still reveal weaknesses in the current pipeline; that is expected.

### Phase 4 — Stable comparisons and developer workflow

- Add compatibility-checked baseline comparison and deliberate baseline promotion.
- Repeat live runs to measure variation; select evidence-backed thresholds and document them.
- Document a short workflow: change one variable, run the matching profile, inspect failures,
  compare against baseline, and run the holdout before accepting the change.
- Optionally add network-free PR checks and budgeted manual/scheduled quality runs.

Done when another contributor can run evals from the README, interpret a failure, and compare a
candidate without relying on production resources or changing application behavior.

### Verification required during implementation

1. Run existing `pnpm --filter api test`, `pnpm validate`, and `pnpm --filter api build`.
2. Run the new eval typecheck, dataset check, metric/harness tests, and network-free smoke.
3. Prove live startup refuses an unmarked/wrong database, inherited production credentials,
   absent live opt-in, and exhausted budgets before dispatching work.
4. Verify timeout/cancellation leaves a readable partial report and closes clients without
   persisting live chat messages or queueing jobs.
5. Inspect the production build/import graph: eval code is excluded and has no production importers.
6. Run isolated real-database scope cases and one small live baseline only after resource setup.
   These are future implementation checks; none is claimed to have run for this planning document.

## 12. Explicitly deferred

Do not begin with a dashboard, a tracing-platform migration, online judging of user requests,
automatic prompt/model tuning, a new vector database, a Python evaluation service, mass dataset
generation, or production reindexing. These add operational scope before there is trustworthy
evaluation data. LangSmith or Ragas can be considered later through exported results if they solve
a concrete need; neither is required in the API runtime for this initial design.

Also defer optional production telemetry and intermediate retrieval traces. If those become
necessary, propose a separate small change with its overhead measured. The initial plan remains
implementable through existing dependency seams and isolated CLI code.

## References and rationale

- [LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
  distinguishes curated offline experiments, production monitoring, and code/human/model
  evaluators. This plan adopts the dataset/experiment approach; it does not require the service.
- [Ragas faithfulness definition](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/faithfulness/)
  evaluates whether answer claims are supported by retrieved context. This motivates separating
  grounding from answer correctness and citation-marker validity.
- [Google: evaluate a judge model](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluate-judge-model?hl=en)
  describes comparing model judgments with human-labeled ratings. This motivates calibration
  before using judge scores as blocking gates, without adopting its SDK or managed service.

The chosen architecture, corpus sizes, budgets, and phases are repository-specific design
recommendations, not guarantees or thresholds prescribed by these sources.
