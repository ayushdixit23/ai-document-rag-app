import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { canAttachFiles, selectComposerFiles } from '@/components/chats/composer-attachments';
import { MAX_FILE_BYTES, uploadMimeType, validateFile } from '@/lib/documents/file-types';
import { pollDocument } from '@/lib/documents/poll';
import { recoverUpload, uploadFile } from '@/lib/documents/upload';

import { document, jsonResponse, mockFetch, requestJson, reservation } from './fixtures';

afterEach(() => {
  mock.restoreAll();
});

void test('selection rejects unsupported, empty, oversized or mismatched files and caps attachments at five', () => {
  const valid = new File(['Annual revenue grew 20%.'], 'report.txt', { type: 'text/plain' });
  const invalid = [
    new File(['x'], 'slides.pptx'),
    new File([], 'empty.txt'),
    new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.pdf', { type: 'application/pdf' }),
    new File(['x'], 'spoof.pdf', { type: 'image/png' }),
  ];
  invalid.forEach((file) => {
    assert.ok(validateFile(file));
  });
  const selected = selectComposerFiles(3, [...invalid, valid, valid, valid]);
  assert.equal(selected.files.length, 2);
  assert.equal(selected.errors.length, 5);
  assert.equal(canAttachFiles(selected.files), false);
  assert.equal(
    canAttachFiles(selected.files.map((file) => ({ ...file, status: 'pending', document }))),
    true,
  );
});

void test('MIME normalization handles empty OS types and CSV/Markdown aliases', () => {
  assert.equal(uploadMimeType({ name: 'notes.MD', type: '' }), 'text/markdown');
  assert.equal(
    uploadMimeType({ name: 'report.csv', type: 'application/vnd.ms-excel' }),
    'text/csv',
  );
  assert.equal(uploadMimeType({ name: 'notes.md', type: 'text/plain' }), 'text/plain');
  assert.equal(uploadMimeType({ name: 'pdf', type: 'application/pdf' }), undefined);
  assert.equal(uploadMimeType({ name: '.md', type: 'text/markdown' }), undefined);
});

void test('upload reserves, PUTs directly with the signed headers and no cookies, then completes', async () => {
  const file = new File(['Annual revenue grew 20%.'], 'report.txt', { type: 'text/plain' });
  const calls: string[] = [];
  mockFetch((url, init) => {
    calls.push(url);
    if (url === '/api/documents/uploads') {
      assert.deepEqual(requestJson(init), {
        files: [{ name: file.name, size: file.size, mimeType: file.type }],
      });
      return jsonResponse({ uploads: [reservation] });
    }
    if (url === reservation.uploadUrl) {
      assert.equal(init?.method, 'PUT');
      assert.equal(init.credentials, 'omit');
      assert.deepEqual(init.headers, reservation.headers);
      assert.equal(init.body, file);
      return new Response(null, { status: 200 });
    }
    return jsonResponse({ document }, 202);
  });
  const reserved: string[] = [];
  const result = await uploadFile(file, {
    signal: new AbortController().signal,
    onReserved: (value) => {
      reserved.push(value.documentId);
    },
  });
  assert.equal(result.status, 'pending');
  assert.deepEqual(reserved, [document.id]);
  assert.deepEqual(calls, [
    '/api/documents/uploads',
    reservation.uploadUrl,
    `/api/documents/${document.id}/complete`,
  ]);
});

void test('a failed PUT is not completed and preserves a reservation for retry', async () => {
  const fetch = mockFetch((url) =>
    url === '/api/documents/uploads'
      ? jsonResponse({ uploads: [reservation] })
      : new Response(null, { status: 403 }),
  );
  await assert.rejects(
    uploadFile(new File(['x'], 'report.txt'), {
      signal: new AbortController().signal,
      onReserved: () => undefined,
    }),
    /could not be uploaded/,
  );
  assert.equal(fetch.mock.callCount(), 2);
});

void test('cancelling after reservation prevents PUT and completion', async () => {
  const fetch = mockFetch(() => jsonResponse({ uploads: [reservation] }));
  const controller = new AbortController();
  await assert.rejects(
    uploadFile(new File(['x'], 'report.txt'), {
      signal: controller.signal,
      onReserved: () => {
        controller.abort();
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(fetch.mock.callCount(), 1);
});

void test('retry replaces a reservation already removed by stale-upload cleanup', async () => {
  const calls: string[] = [];
  mockFetch((url) => {
    calls.push(url);
    if (url === `/api/documents/${document.id}`)
      return Response.json({ success: false, message: 'Not found' }, { status: 404 });
    if (url === '/api/documents/uploads') return jsonResponse({ uploads: [reservation] });
    if (url === reservation.uploadUrl) return new Response(null, { status: 200 });
    return jsonResponse({ document });
  });
  await recoverUpload(new File(['x'], 'report.txt'), {
    reservation,
    signal: new AbortController().signal,
    onReserved: () => undefined,
  });
  assert.deepEqual(calls, [
    `/api/documents/${document.id}`,
    '/api/documents/uploads',
    reservation.uploadUrl,
    `/api/documents/${document.id}/complete`,
  ]);
});

void test('failed ingestion retries the existing document without uploading again', async () => {
  const urls: string[] = [];
  mockFetch((url) => {
    urls.push(url);
    return jsonResponse({
      document: { ...document, status: url.endsWith('/retry') ? 'pending' : 'failed' },
    });
  });
  const result = await recoverUpload(new File(['x'], 'report.txt'), {
    reservation,
    signal: new AbortController().signal,
    onReserved: () => undefined,
  });
  assert.equal(result.status, 'pending');
  assert.deepEqual(urls, [`/api/documents/${document.id}`, `/api/documents/${document.id}/retry`]);
});

void test('retry replaces an expired upload reservation and removes the old document', async () => {
  const calls: string[] = [];
  mockFetch((url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === '/api/documents/uploads') return jsonResponse({ uploads: [reservation] });
    if (url === reservation.uploadUrl) return new Response(null, { status: 200 });
    return jsonResponse({
      document: { ...document, status: url.endsWith('/complete') ? 'pending' : 'uploading' },
    });
  });
  await recoverUpload(new File(['x'], 'report.txt'), {
    reservation: { ...reservation, expiresAt: '2000-01-01T00:00:00.000Z' },
    signal: new AbortController().signal,
    onReserved: () => undefined,
  });
  assert.deepEqual(calls, [
    `GET /api/documents/${document.id}`,
    `DELETE /api/documents/${document.id}`,
    'POST /api/documents/uploads',
    `PUT ${reservation.uploadUrl}`,
    `POST /api/documents/${document.id}/complete`,
  ]);
});

void test('polling stops at a terminal state and aborting cancels a scheduled poll', async () => {
  const fetch = mockFetch(() => jsonResponse({ document: { ...document, status: 'ready' } }));
  const updates: string[] = [];
  await pollDocument(
    document,
    (value) => {
      updates.push(value.status);
    },
    new AbortController().signal,
  );
  assert.deepEqual(updates, ['ready']);
  assert.equal(fetch.mock.callCount(), 1);
  const controller = new AbortController();
  const polling = pollDocument(document, () => undefined, controller.signal);
  controller.abort();
  await assert.rejects(polling, { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);
});
