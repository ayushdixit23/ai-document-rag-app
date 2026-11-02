# RAG — Product Behavior

A user can ask questions **with documents or without documents**. Documents are optional context attached to a message, not a requirement for chat.

Schema (`apps/api/src/db/schema/message.ts`, `apps/api/src/db/schema/chats.ts`):

- `chat` — a conversation owned by a user. `summary` exists for long-conversation handling.
- `message` — a turn in a chat (`user` or `assistant`). `content` may be empty when the turn is only an upload.
- `document` — a file owned by a user (`userId`). Access is per user.
- `message_document` — links one message to one or more documents. A message can have zero documents.

## 1. User chats without uploading a document

**Expected behavior**

- Normal chatbot functionality.
- Maintain conversation context across messages.
- Understand follow-up questions and references to previous messages.

**Potential problems**

- Long conversations exceeding context limits.
- Missing or misinterpreting follow-up questions.
- Confusion when users refer to previous topics using words like "that" or "it".

## 2. User uploads a document and asks questions

**Expected behavior**

- Document is chunked into smaller sections.
- Chunks are converted into embeddings and stored.
- Relevant chunks are retrieved based on the user's query.
- Answers are generated using retrieved document content.
- Responses include citations to the source document.
- Retrieved sources are evidence candidates. The sources list appears only after
  the answer's actual citations are validated; unused retrieved chunks are never
  displayed as citations. Inline citations can appear as the answer references them.

A single message may attach more than one document (`message_document`).

If the question needs documents that are still indexing, keep the same turn open
and show “Reading documents…” until those files are ready. Refresh their state
before retrieval, then answer the original question with sources. Do not save a
premature clarification or a “files are processing” answer. Waiting is cancellable;
indexing failures and timeouts show an actionable error. Unrelated general questions
can still proceed without waiting for previously attached files.

**Potential problems**

- Retrieval of irrelevant chunks.
- Conflicting information across multiple documents.
- Embedding generation or storage failures.

## 3. User previously uploaded a document and continues chatting

Documents stay available for the chat after the upload turn. Later messages do not have to re-attach the file.

### Scenario A: Follow-up related to the document

**Expected behavior**

- Recognize that the question refers to a previously uploaded document.
- Retrieve relevant information from that document.
- Maintain document context and provide citations where appropriate.

### Scenario B: Question unrelated to the document

**Expected behavior**

- Recognize that the user has switched topics.
- Respond using normal chatbot functionality.
- Avoid unnecessary document retrieval.
- Preserve previously uploaded document context for future relevant questions.

## 4. Cross-cutting concerns

These apply to every scenario above.

- **Conversation history management.** Handle long conversations and context-window limitations. `chat.summary` is the place for a compacted history when the full transcript no longer fits.
- **Visible history pagination.** Load the latest 15 messages first and fetch older
  messages in cursor-based pages of 15. Preserve the reader's scroll position when
  prepending history. Pagination of the UI does not restrict the server's conversation
  memory or the documents available to the chat.
- **Ambiguous reference resolution.** Correctly interpret references such as "it", "that", or "the previous one" — whether they point at an earlier message or at a document.
- **Topic switching.** Detect when users change topics or return to earlier discussions, including a return from general chat back to a previously uploaded document.
- **Document access permissions.** A user can only retrieve information from documents they own (`document.userId`). Never retrieve another user's documents.
- **Retrieval failure handling.** Gracefully handle missing documents, failed embeddings, irrelevant results, or retrieval errors. Fall back to a normal answer when retrieval should not run, and say when a document answer cannot be produced.
