import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import type { Document } from '@langchain/core/documents';
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import type { FileKind } from '../../documents/file-types.js';
import { CHUNK_OVERLAP, CHUNK_SIZE } from '../config.js';
import { loadExcel } from './excel-loader.js';
import { IngestError } from './ingest-error.js';

const loaders: Record<FileKind, (blob: Blob) => Promise<Document[]>> = {
  pdf: (blob) => new PDFLoader(blob, { splitPages: true }).load(),
  docx: (blob) => new DocxLoader(blob).load(),
  txt: (blob) => new TextLoader(blob).load(),
  md: (blob) => new TextLoader(blob).load(),
  csv: (blob) => new CSVLoader(blob).load(),
  xlsx: async (blob) => loadExcel(new Uint8Array(await blob.arrayBuffer())),
};

export const pageNumber = (metadata: Record<string, unknown>): number | null => {
  const location: unknown = metadata.loc;
  if (!location || typeof location !== 'object' || !('pageNumber' in location)) return null;
  return typeof location.pageNumber === 'number' ? location.pageNumber : null;
};

const pdfPageCount = (documents: Document[]): number => {
  const pdf: unknown = documents[0]?.metadata.pdf;
  if (pdf && typeof pdf === 'object' && 'totalPages' in pdf && typeof pdf.totalPages === 'number')
    return pdf.totalPages;
  return documents.length;
};

export const loadAndSplit = async (bytes: Uint8Array, kind: FileKind) => {
  const documents = await loaders[kind](new Blob([Uint8Array.from(bytes)]));
  const pageCount = kind === 'pdf' ? pdfPageCount(documents) : null;
  const characters = documents.reduce((sum, item) => sum + item.pageContent.trim().length, 0);
  if (!characters || (pageCount !== null && characters / Math.max(pageCount, 1) < 50)) {
    throw new IngestError(
      'No usable text found. Scanned PDFs require OCR, which is not supported yet.',
    );
  }
  const options = { chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP };
  const splitter =
    kind === 'md' ? new MarkdownTextSplitter(options) : new RecursiveCharacterTextSplitter(options);
  const chunks = (await splitter.splitDocuments(documents)).filter((item) =>
    item.pageContent.trim(),
  );
  return { chunks, pageCount };
};
