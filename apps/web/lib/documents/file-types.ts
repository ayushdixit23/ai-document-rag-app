const FILE_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const DOCUMENT_ACCEPT = Object.keys(FILE_MIME_TYPES)
  .map((type) => `.${type}`)
  .join(',');
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Browser MIME reporting varies; the API verifies extensions and file bytes too. */
export function uploadMimeType(file: Pick<File, 'name' | 'type'>): string | undefined {
  const dot = file.name.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const extension = file.name.slice(dot + 1).toLowerCase();
  const expected = FILE_MIME_TYPES[extension];
  if (!expected) return undefined;
  if (!file.type || file.type === 'application/octet-stream') return expected;
  if (['md', 'csv'].includes(extension) && file.type === 'text/plain') return file.type;
  // CSV/XLSX are sometimes reported as legacy Excel by the OS file picker.
  if (['csv', 'xlsx'].includes(extension) && file.type === 'application/vnd.ms-excel')
    return expected;
  return file.type === expected ? expected : undefined;
}

export function validateFile(file: File): string | null {
  if (!uploadMimeType(file)) return `${file.name}: use PDF, DOCX, TXT, MD, CSV, or XLSX.`;
  if (!file.size) return `${file.name}: empty files cannot be uploaded.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: files must be 10 MB or smaller.`;
  if (
    file.name.length > 255 ||
    file.name.includes('/') ||
    file.name.includes('\\') ||
    Array.from(file.name).some((character) => character.charCodeAt(0) < 32)
  )
    return 'This file name is not supported.';
  return null;
}
