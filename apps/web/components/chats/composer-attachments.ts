import { DOCUMENT_ACCEPT, MAX_FILE_BYTES } from '@/lib/documents/file-types';
import { validateFile } from '@/lib/documents/file-types';
import type { ChatDocument, DocumentStatus, UploadReservation } from '@/lib/documents/types';

export const COMPOSER_ACCEPT = DOCUMENT_ACCEPT;
export const COMPOSER_MAX_FILES = 5;
export const COMPOSER_MAX_FILE_BYTES = MAX_FILE_BYTES;

export type ComposerFile = {
  id: string;
  file: File;
  status: DocumentStatus;
  reservation?: UploadReservation;
  document?: ChatDocument;
  error?: string;
};

export const canAttachFiles = (files: ComposerFile[]): boolean =>
  files.every(
    (file) => Boolean(file.document) && file.status !== 'uploading' && file.status !== 'failed',
  );

export function selectComposerFiles(currentCount: number, incoming: FileList | File[]) {
  const files: ComposerFile[] = [];
  const errors: string[] = [];
  for (const file of Array.from(incoming)) {
    const error = validateFile(file);
    if (error) {
      errors.push(error);
      continue;
    }
    if (currentCount + files.length >= COMPOSER_MAX_FILES) {
      errors.push('You can attach up to 5 documents per message.');
      break;
    }
    files.push({ id: crypto.randomUUID(), file, status: 'uploading' });
  }
  return { files, errors };
}
