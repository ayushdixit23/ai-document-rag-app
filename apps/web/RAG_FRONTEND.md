# RAG web frontend

Implements [Part 3](../../rag-part-3-web.plan.md). Product behavior follows [RAG.md](../../RAG.md); visual tokens come from [DESIGN.md](DESIGN.md).

## Setup

1. Run `pnpm install` at the repository root.
2. Complete the [backend setup](../api/RAG_BACKEND.md), including the schema/summary cursor migration, R2 credentials, model credentials and ingestion workers.
3. Configure R2 bucket CORS for the frontend origin (development: `http://localhost:3000`), method `PUT` and allowed header `Content-Type`. A successful API request alone does not verify browser-to-R2 CORS.
4. The web app defaults to the API at `http://localhost:5001`. For another API host, set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` and restart Next.js. Browser API requests use the existing same-origin `/api/*` rewrite so session cookies stay on the web host.
5. Run `pnpm dev` and sign in with a verified account.

No additional database change is introduced by Part 3. The Part 2 schema must already be applied. Avoid enabling proxy/CDN response buffering for `text/event-stream` responses.

## Responsibilities

| Layer                                                      | Responsibility                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `lib/chats/api.ts`, `lib/documents/api.ts`                 | Authenticated JSON HTTP requests                                                           |
| `lib/chats/sse-parser.ts`, `stream-events.ts`, `stream.ts` | Chunk-safe SSE framing, event validation, POST transport and cancellation                  |
| `lib/chats/*-actions.ts`                                   | Chat mutations, thread loading and streamed message state                                  |
| `ChatStoreProvider`                                        | A separate in-memory cache per authenticated shell; abort outstanding requests on disposal |
| `lib/documents/upload.ts`, `poll.ts`                       | Presigned uploads, recovery and cancellable status polling                                 |
| Composer hooks                                             | File selection, draft ownership and upload lifetimes                                       |
| Message/document/citation components                       | Accessible rendering, source previews and retry/delete controls                            |

Uploads support up to five PDF, DOCX, TXT, MD, CSV or XLSX files per message, each up to 10 MiB. Empty files and unsupported types are rejected before reservation. Files go directly to R2 with the returned signed headers and without session cookies. Send becomes available after upload completion; ingestion may still be pending. Text is optional when attaching files. Previously sent documents stay in the chat scope without reattaching them.

Removing an unsent attachment cancels its requests and attempts to delete its reserved document. Sending clears the draft without deleting the documents. Unmounting cancels upload/poll requests. An interrupted reservation whose response never reached the browser is handled by the backend's stale-upload cleanup.

Ingestion failures retry the existing document. Upload failures reuse an unexpired reservation; expired/missing reservations are replaced. Network failures during polling offer a status refresh. Deleting a sent document requires confirmation because it removes that file from the whole workspace, including other conversations.

The client shows retrieval sources before the answer finishes, then replaces them with finalized citations. Only actual citation ordinals become inline chips. Clicking or focusing a chip shows the source excerpt; unknown markers remain plain text.

A disconnected response preserves its partial text. **Retry message** refreshes saved history first and sends a new turn with the same content and attachment IDs. The API has no resume/idempotency endpoint; the earlier user turn can already be saved. A later thread fetch reconciles to server history. The web app displays the complete returned history; rolling summaries stay on the server.

## Chat responsiveness

Sending shows the user turn and animated waiting dots immediately, including while a new chat is being created. A failed create restores the draft and desktop keyboard focus. Text input stays available during generation. **Stop response** aborts the stream and preserves partial text; sending again refreshes saved history first.

The first token renders immediately. Later token bursts are combined over 32 ms, and pending text is flushed before completion, errors or user cancellation. Stable client keys keep message bubbles mounted when saved IDs arrive. The transcript subscribes to message changes separately from the composer, and unchanged message components are memoized.

Scroll following uses one animation that tracks content size. Scrolling up pauses following, **Jump to latest** resumes it, and sending a new question returns to the latest turn. Reduced-motion preferences use direct scrolling. Thread loading fetches documents with the existing thread response, without a second document-scope request.

## Answer formatting

Assistant responses render streaming Markdown: headings, emphasis, nested lists, quotes, links, tables, inline code and fenced code with a copy button. Typography uses the workspace theme in both light and dark mode. Wide tables and code scroll within the answer on narrow screens.

`MessageContent` delegates block parsing and memoization to Streamdown. Stable renderer options and component identities let completed blocks stay cached while the active block grows. Citation data uses a separate context so finalized source metadata can update existing chips without reparsing prose. The citation transform skips code and link labels; unknown markers remain literal.

Raw HTML is disabled, links accept only HTTP, HTTPS, email or local anchors, and model-provided images render their alt text without fetching remote assets. Optional syntax-highlighting, math and diagram plugins are not loaded.

## Verification

- `pnpm --filter web test` runs Node.js regression tests through `tsx`, without contacting R2, Gemini or the database.
- `pnpm test` runs frontend and backend suites.
- `pnpm validate` runs the repository's lint, read-only formatting and type checks.
- `pnpm --filter web build` checks the production bundle.

Live smoke check: create a chat, upload two text-bearing documents, watch them reach Ready, ask a document question and open its citation, then ask a general question and a document follow-up without attaching again. Reload the page and verify full history and citations. Also check a corrupt document's failure/retry/delete flow and a dropped stream's partial-answer/retry flow.

Automated checks use synthetic data. Visual QA uses a temporary synthetic preview that is removed afterward. A live R2/Gemini/summary smoke check still requires a configured backend and verified user session.
