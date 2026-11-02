---
name: RAG Part 3 — Web Frontend
overview: 'Wire the Next.js app to the Part 2 backend: replace the mock chat store, presigned upload flow with per-file status chips, SSE message streaming, and citation chips. Visual work follows apps/web/DESIGN.md.'
status: implemented
depends_on: rag-part-2-backend.plan.md
parent_plan: langchain-first_rag_682de98b.plan.md
todos:
  - id: store
    content: 'Replace mock store (apps/web/lib/chats/store.ts) with API-backed store'
    status: completed
  - id: upload
    content: 'Upload flow: presign reserve, direct PUT to R2, complete, per-file status on composer chips (limit 5)'
    status: completed
  - id: sse
    content: 'SSE client for POST /api/chats/:id/messages streaming'
    status: completed
  - id: citations
    content: 'Citation chips on assistant messages'
    status: completed
  - id: polish
    content: 'Processing/failed document states, retry affordances, DESIGN.md + validate gate'
    status: completed
---

# RAG Part 3: Web Frontend

Builds on [rag-part-2-backend.plan.md](rag-part-2-backend.plan.md). Before any UI work, read [apps/web/DESIGN.md](apps/web/DESIGN.md) (Notion warm-workspace visual system) and the web rules in `.cursor/rules/web-development.mdc`. Imports: `@repo/ui/components/*` primitives, `cn` from `@repo/ui/lib/utils`. Tailwind v4, class-based dark mode via `next-themes`.

## 1. Replace the mock store

[apps/web/lib/chats/store.ts](apps/web/lib/chats/store.ts) currently mocks chats. Replace with calls to the real endpoints:

- chats list/create/rename/delete
- thread fetch: `GET /api/chats/:id/messages` → messages with `documentIds` and `citations`, plus the chat's documents
- document list/status: `GET /api/documents/:id` and `GET /api/chats/:id/documents`

Keep the store's shape close to what existing components consume where possible; rename/adjust call sites rather than widening the store.

## 2. Upload flow

In [apps/web/components/chats/composer-attachments.ts](apps/web/components/chats/composer-attachments.ts) (limit 5 lives here) and the composer UI:

1. User picks up to 5 files (type + 10 MB validated client-side too, but the API is the authority)
2. `POST /api/documents/uploads` → get `documentId` + presigned URL per file
3. `PUT` each file **directly to R2** from the browser (no API hop); pass the signed `Content-Type` header
4. `POST /api/documents/:id/complete` → status `pending`, ingestion runs server-side while the user keeps typing
5. Attach `documentIds` to the send call

Per-file status on composer chips: `uploading → pending/processing (spinner) → ready (check) | failed (retry/delete)`. Poll `GET /api/documents/:id` per attached file until terminal status; stop polling on unmount.

## 3. SSE client

Reader for `POST /api/chats/:id/messages` (`fetch` + `ReadableStream`, not `EventSource` — we need POST with a JSON body):

- `meta` → record `userMessageId`, show "processing" badges for `processingDocumentIds`
- `sources` → render pending citation chips as soon as retrieval returns, before text arrives
- `token` → append to the in-flight assistant bubble
- `done` → finalize citations from the payload; reconcile with the saved thread on next fetch
- `error` → show error state on the bubble with a retry affordance
- Handle mid-stream connection drops: keep partial text, offer retry (the API saved what it saved; thread fetch is the source of truth)

## 4. Citation chips

Assistant messages render `[n]` markers as chips: `{ n, documentId, title, page }` from the `done` payload / thread fetch. Clicking a chip shows the source snippet (from `citations[].snippet`) — tooltip or small popover per DESIGN.md. Chips only appear for citations that exist; unmatched `[n]` text renders literally.

## 5. States and polish

- Empty chat: composer prominent, no documents yet
- Documents still processing while chatting: badge on the chip + system prompt already tells the model to mention it
- Failed document: error chip with retry (calls `POST /api/documents/:id/retry`) and delete
- Sidebar rename/delete wired to the real endpoints ([apps/web/components/chats/sidebar.tsx](apps/web/components/chats/sidebar.tsx))
- Loading and error skeletons consistent with DESIGN.md

## 6. Definition of done

- End-to-end in the browser: new chat → upload 2 files → watch chips go ready → ask a document question → streamed answer with citation chips → ask a general question (no retrieval) → ask a follow-up ("why did it grow?") that resolves via summary/history
- Long-conversation sanity: summary path doesn't break the UI (thread fetch always shows full history — the summary is server-side only)
- `pnpm validate` green; visual check against DESIGN.md in light and dark mode

## Implementation notes

The API-backed store, direct uploads, document lifecycle controls, POST SSE client and inline citation previews are implemented with separate transport, state, lifecycle and rendering responsibilities. Setup, recovery semantics and the live smoke checklist are in [apps/web/RAG_FRONTEND.md](apps/web/RAG_FRONTEND.md).

Automated tests use mocked HTTP responses and synthetic files. Live R2/Gemini and long-conversation summary verification remain environment-dependent; no database migration, bucket configuration or model call is performed by the frontend implementation.

Verified: `pnpm validate`, `pnpm test` (28 web + 19 API tests), and `pnpm --filter web build`. Synthetic browser QA covered citation previews, literal unmatched markers, document/error states, light/dark themes, and a 390 px mobile viewport without horizontal overflow. The temporary preview route was removed before the production build.
