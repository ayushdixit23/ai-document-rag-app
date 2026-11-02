import { z } from 'zod';

export const messagePageSchema = z.object({ before: z.uuid().optional() });
