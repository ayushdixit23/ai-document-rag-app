export type DocumentStatus = 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';

export type ChatDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number | null;
};

export type UploadReservation = {
  documentId: string;
  uploadUrl: string;
  headers: { 'Content-Type': string };
  expiresAt: string;
};

export const isDocumentProcessing = (status: DocumentStatus): boolean =>
  status === 'pending' || status === 'processing';
