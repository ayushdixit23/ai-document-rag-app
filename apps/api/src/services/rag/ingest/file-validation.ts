import { fileTypeFromBuffer } from 'file-type';

import { FILE_TYPES, type FileKind } from '../../documents/file-types.js';
import { MAX_FILE_BYTES } from '../config.js';
import { IngestError } from './ingest-error.js';

export const assertMagicBytes = async (bytes: Uint8Array, kind: FileKind): Promise<void> => {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new IngestError('File is empty or exceeds 10 MB.');
  const detected = await fileTypeFromBuffer(bytes);
  if (['pdf', 'docx', 'xlsx'].includes(kind)) {
    if (detected?.mime !== FILE_TYPES[kind])
      throw new IngestError('File contents do not match its type.');
    return;
  }
  if (detected) throw new IngestError('Expected a plain UTF-8 text file.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (Array.from(text).some((char) => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) {
    throw new IngestError('Text file contains binary data.');
  }
};
