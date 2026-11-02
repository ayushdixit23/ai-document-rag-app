export type SseFrame = { event: string; data: string };

/** Network chunks may split UTF-8, CRLF, fields, or several events at any byte. */
export function createSseParser(onFrame: (frame: SseFrame) => boolean) {
  let line = '';
  let event = '';
  let data: string[] = [];
  let skipLf = false;
  let active = true;

  const consumeLine = () => {
    if (!line) {
      if (data.length) active = onFrame({ event: event || 'message', data: data.join('\n') });
      event = '';
      data = [];
      return;
    }
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
    line = '';
  };

  return {
    push(text: string): boolean {
      for (const character of text) {
        if (!active) break;
        if (character === '\n' && skipLf) {
          skipLf = false;
          continue;
        }
        skipLf = character === '\r';
        if (character === '\n' || character === '\r') consumeLine();
        else line += character;
      }
      return active;
    },
  };
}

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => boolean,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onFrame);
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        parser.push(decoder.decode());
        break;
      }
      if (!parser.push(decoder.decode(value, { stream: true }))) break;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
