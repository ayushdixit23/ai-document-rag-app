export interface Source {
  n: number;
  documentId: string;
  chunkId: string;
  title: string;
  page: number | null;
  snippet: string;
}

export type Citation = Omit<Source, 'chunkId'>;

export interface StreamEvents {
  meta: { userMessageId: string; processingDocumentIds: string[] };
  sources: { n: number; documentId: string; title: string; page: number | null }[];
  token: { text: string };
  done: { assistantMessageId: string; citations: Citation[] };
  error: { code: string; message: string };
}

export interface TurnStream {
  signal: AbortSignal;
  send: <K extends keyof StreamEvents>(event: K, data: StreamEvents[K]) => Promise<void>;
}
