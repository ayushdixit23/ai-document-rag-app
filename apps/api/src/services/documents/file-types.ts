import { extname } from 'node:path';

export const FILE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export type FileKind = keyof typeof FILE_TYPES;

export const getFileKind = (name: string): FileKind | undefined => {
  const extension = extname(name).slice(1).toLowerCase();
  return Object.hasOwn(FILE_TYPES, extension) ? (extension as FileKind) : undefined;
};

export const matchesFileType = (name: string, mimeType: string): boolean => {
  const kind = getFileKind(name);
  if (!kind) return false;
  // Browsers commonly report Markdown and CSV as plain text.
  return (
    FILE_TYPES[kind] === mimeType || (['md', 'csv'].includes(kind) && mimeType === 'text/plain')
  );
};
