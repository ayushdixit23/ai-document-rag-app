import { z } from 'zod';

const source = z.object({
  n: z.number().int().positive(),
  documentId: z.string(),
  title: z.string(),
  page: z.number().int().positive().nullable(),
});

const eventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('meta'),
    data: z.object({ userMessageId: z.string(), processingDocumentIds: z.array(z.string()) }),
  }),
  z.object({ event: z.literal('sources'), data: z.array(source) }),
  z.object({ event: z.literal('token'), data: z.object({ text: z.string() }) }),
  z.object({
    event: z.literal('done'),
    data: z.object({
      assistantMessageId: z.string(),
      citations: z.array(source.extend({ snippet: z.string() })),
    }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({ code: z.string(), message: z.string() }),
  }),
]);

export type StreamEvent = z.infer<typeof eventSchema>;

export function parseStreamEvent(event: string, data: string): StreamEvent | null {
  if (!['meta', 'sources', 'token', 'done', 'error'].includes(event)) return null;
  try {
    return eventSchema.parse({ event, data: JSON.parse(data) as unknown });
  } catch {
    throw new Error('The server sent an invalid response. Please retry.');
  }
}
