import { z } from 'zod';

import { matchesFileType } from '../../../services/documents/file-types.js';
import { MAX_FILE_BYTES, MAX_FILES_PER_MESSAGE } from '../../../services/rag/config.js';

export const resourceParamsSchema = z.object({ id: z.uuid() });

const uploadFileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(
        (name) =>
          !name.includes('/') &&
          !name.includes('\\') &&
          !Array.from(name).some((char) => char.charCodeAt(0) < 32),
        'Invalid file name',
      ),
    size: z.number().int().positive().max(MAX_FILE_BYTES),
    mimeType: z.string().trim().toLowerCase(),
  })
  .refine((file) => matchesFileType(file.name, file.mimeType), {
    message: 'Supported files: PDF, DOCX, TXT, MD, CSV, XLSX with matching MIME types',
    path: ['mimeType'],
  });

export const uploadsSchema = z.object({
  files: z.array(uploadFileSchema).min(1).max(MAX_FILES_PER_MESSAGE),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
