export type DocumentStatus = 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';

export type ProcessingProgress = {
  stage: 'embedding' | 'waiting' | 'saving';
  completed: number;
  total: number;
  retryAt?: string;
};

export type ChatDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number | null;
  processingProgress?: ProcessingProgress | null;
  updatedAt?: string;
};

export type UploadReservation = {
  documentId: string;
  uploadUrl: string;
  headers: { 'Content-Type': string };
  expiresAt: string;
};

export const isDocumentProcessing = (status: DocumentStatus): boolean =>
  status === 'pending' || status === 'processing';
