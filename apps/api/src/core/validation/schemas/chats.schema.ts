import { z } from 'zod';

import { MAX_FILES_PER_MESSAGE } from '../../../services/rag/config.js';

const titleSchema = z.string().trim().min(1).max(200);
export const createChatSchema = z.object({ title: titleSchema.optional() });
export const renameChatSchema = z.object({ title: titleSchema });
export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(32_000).default(''),
    documentIds: z.array(z.uuid()).max(MAX_FILES_PER_MESSAGE).default([]),
  })
  .refine((input) => input.content.length > 0 || input.documentIds.length > 0, {
    message: 'A message needs content or at least one document',
  })
  .refine((input) => new Set(input.documentIds).size === input.documentIds.length, {
    message: 'Document IDs must be unique',
    path: ['documentIds'],
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
