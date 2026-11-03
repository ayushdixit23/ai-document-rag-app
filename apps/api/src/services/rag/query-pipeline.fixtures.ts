import assert from 'node:assert/strict';

import type { PreparedTurn } from './prepare-turn.js';
import type { QueryDependencies } from './query-pipeline.js';
import type { Source, StreamEvents, TurnStream } from './types.js';

export const source: Source = {
  n: 1,
  documentId: 'doc',
  chunkId: 'chunk',
  title: 'Report',
  page: 2,
  snippet: 'Revenue rose.',
};
export const makeTurn = (): PreparedTurn => ({
  userId: 'owner',
  chat: {
    id: 'chat',
    userId: 'owner',
    title: 'Chat',
    titlePending: false,
    summary: null,
    summarizedUntil: null,
    summarizedUntilMessageId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  history: [],
  documents: [],
  input: { content: 'why?', documentIds: [] },
  userMessageId: 'user-message',
});

export const makeHarness = (route: 'documents' | 'general' = 'documents') => {
  const calls = {
    routed: 0,
    retrieved: 0,
    saved: 0,
    summary: 0,
    citations: [] as Source[],
    query: '',
  };
  const events: { event: keyof StreamEvents; data: StreamEvents[keyof StreamEvents] }[] = [];
  const controller = new AbortController();
  const stream: TurnStream = {
    signal: controller.signal,
    send: (event, data) => {
      events.push({ event, data });
      return Promise.resolve();
    },
  };
  const dependencies: QueryDependencies = {
    documents: {
      load: (_userId, ids) => Promise.resolve(ids.map((id) => ({ ...makeDocument('ready'), id }))),
      pause: () => Promise.resolve(),
    },
    routeQuestion: () => {
      calls.routed += 1;
      return Promise.resolve({ route, standaloneQuery: 'standalone question' });
    },
    retrieveSources: (userId, ids, query) => {
      assert.equal(userId, 'owner');
      assert.deepEqual(ids, ['doc']);
      calls.retrieved += 1;
      calls.query = query;
      return Promise.resolve([source]);
    },
    saveAssistantMessage: (_chatId, _content, citations) => {
      calls.saved += 1;
      calls.citations = citations;
      return Promise.resolve('assistant-message');
    },
    streamAnswer: () =>
      Promise.resolve(
        (async function* () {
          yield await Promise.resolve({ text: 'Answer [1] [999]' });
        })(),
      ),
    scheduleSummary: () => {
      calls.summary += 1;
    },
  };
  return { calls, events, stream, dependencies, controller };
};

export const addDocument = (
  turn: PreparedTurn,
  status: PreparedTurn['documents'][number]['status'],
) => {
  turn.documents.push(makeDocument(status));
};

export const makeDocument = (
  status: PreparedTurn['documents'][number]['status'],
): PreparedTurn['documents'][number] => ({
  id: 'doc',
  name: 'Report',
  mimeType: 'text/plain',
  size: 100,
  status,
  errorMessage: null,
  pageCount: null,
  chunkCount: 1,
  processingProgress: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
