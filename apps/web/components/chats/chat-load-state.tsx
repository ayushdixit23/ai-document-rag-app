import { Button } from '@repo/ui/components/button';

import { CHAT_COLUMN } from '@/lib/chats/layout';
import type { LoadState } from '@/lib/chats/store-types';

export function ChatLoadBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      role="status"
      className="border-border flex items-center justify-between gap-3 border-b px-6 py-2 text-xs"
    >
      <p className="text-muted-foreground">{error}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry loading
      </Button>
    </div>
  );
}

export function ChatLoadState({ state, onRetry }: { state?: LoadState; onRetry: () => void }) {
  if (state?.status === 'error') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
        role="status"
      >
        <h1 className="text-foreground text-xl font-semibold">
          {state.notFound ? 'Chat not found' : 'Could not load this chat'}
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {state.notFound
            ? 'This conversation was deleted or is not available to your account.'
            : state.error}
        </p>
        {!state.notFound ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div role="status" className={`${CHAT_COLUMN} flex flex-1 flex-col gap-6 py-10`}>
      <span className="sr-only">Loading conversation…</span>
      <div className="bg-muted ml-auto h-16 w-2/3 animate-pulse rounded-xl motion-reduce:animate-none" />
      <div className="bg-muted h-32 w-full animate-pulse rounded-xl motion-reduce:animate-none" />
    </div>
  );
}
