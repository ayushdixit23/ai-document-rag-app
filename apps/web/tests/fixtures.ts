import { mock } from 'node:test';

import type { ChatStoreApi } from '@/lib/chats/store-types';
import type { Chat, Message } from '@/lib/chats/types';
import type { ChatDocument, UploadReservation } from '@/lib/documents/types';

export const chat: Chat = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Revenue report',
  createdAt: '2026-11-01T12:00:00.000Z',
  updatedAt: '2026-11-01T12:00:00.000Z',
};
export const document: ChatDocument = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'report.txt',
  mimeType: 'text/plain',
  size: 24,
  status: 'pending',
  errorMessage: null,
  pageCount: null,
  chunkCount: null,
};
export const citation = {
  n: 1,
  documentId: document.id,
  title: document.name,
  page: 2,
  snippet: 'Revenue rose by 20%.',
};
export const reservation: UploadReservation = {
  documentId: document.id,
  uploadUrl: 'https://storage.example.test/signed',
  headers: { 'Content-Type': 'text/plain' },
  expiresAt: '2099-01-01T00:00:00.000Z',
};
export const savedUser: Message = {
  id: 'saved-user',
  chatId: chat.id,
  role: 'user',
  content: 'Why did it grow?',
  createdAt: chat.createdAt,
  documentIds: [document.id],
  citations: [],
};

export const jsonResponse = (data: unknown, status = 200) =>
  Response.json({ success: true, data }, { status });

export const sseFrame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
export const sseResponse = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });

export function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { mock: { callCount: () => number } } {
  return mock.method(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      handler(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        init,
      ),
    ),
  );
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

export function waitForIdle(store: ChatStoreApi): Promise<void> {
  if (!store.getState().generatingChatId) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Stream did not finish'));
    }, 2000);
    const unsubscribe = store.subscribe((state) => {
      if (state.generatingChatId) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

export function requestJson(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body');
  return JSON.parse(init.body) as unknown;
}
