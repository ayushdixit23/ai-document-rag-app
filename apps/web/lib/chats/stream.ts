import { ApiError, readApiResponse } from '@/lib/api';
import { readSse } from '@/lib/chats/sse-parser';
import type { StreamEvent } from '@/lib/chats/stream-events';
import { parseStreamEvent } from '@/lib/chats/stream-events';
import type { SendMessageInput } from '@/lib/chats/types';

export async function streamMessage(
  chatId: string,
  input: SendMessageInput,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) await readApiResponse(response);
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
    throw new ApiError('The server could not start the response. Please retry.', response.status);
  }
  const state = { finished: false };
  await readSse(
    response.body,
    (frame) => {
      const event = parseStreamEvent(frame.event, frame.data);
      if (!event) return true;
      if (event.event === 'error') throw new Error(event.data.message);
      onEvent(event);
      state.finished = event.event === 'done';
      return !state.finished;
    },
    signal,
  );
  if (!state.finished) throw new Error('Connection lost. Your partial answer is kept below.');
}
