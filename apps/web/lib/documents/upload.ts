import { ApiError } from '@/lib/api';
import {
  completeUpload,
  deleteDocument,
  fetchDocument,
  reserveUpload,
  retryDocument,
} from '@/lib/documents/api';
import { uploadMimeType } from '@/lib/documents/file-types';
import type { ChatDocument, UploadReservation } from '@/lib/documents/types';

type UploadOptions = {
  signal: AbortSignal;
  reservation?: UploadReservation;
  onReserved: (reservation: UploadReservation) => void;
};

export async function uploadFile(file: File, options: UploadOptions): Promise<ChatDocument> {
  const mimeType = uploadMimeType(file);
  if (!mimeType) throw new Error('This file type is not supported.');
  const reservation =
    options.reservation ?? (await reserveUpload(file, mimeType, options.signal)).uploads[0];
  if (!reservation) throw new Error('Could not reserve this upload. Please retry.');
  options.onReserved(reservation);
  options.signal.throwIfAborted();
  const result = await fetch(reservation.uploadUrl, {
    method: 'PUT',
    credentials: 'omit',
    headers: reservation.headers,
    body: file,
    signal: options.signal,
  });
  if (!result.ok) throw new Error('The file could not be uploaded. Please retry or remove it.');
  return (await completeUpload(reservation.documentId, options.signal)).document;
}

export async function recoverUpload(file: File, options: UploadOptions): Promise<ChatDocument> {
  const reservation = options.reservation;
  if (!reservation) return uploadFile(file, options);
  const document = await fetchDocument(reservation.documentId, options.signal)
    .then((result) => result.document)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
  if (!document) return uploadFile(file, { ...options, reservation: undefined });
  if (document.status === 'failed')
    return (await retryDocument(document.id, options.signal)).document;
  if (document.status !== 'uploading') return document;
  if (Date.parse(reservation.expiresAt) > Date.now()) return uploadFile(file, options);
  await deleteDocument(document.id, options.signal);
  return uploadFile(file, { ...options, reservation: undefined });
}
