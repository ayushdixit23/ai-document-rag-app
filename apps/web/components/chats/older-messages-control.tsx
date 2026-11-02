import { Button } from '@repo/ui/components/button';

import type { HistoryPageState } from '@/lib/chats/store-types';

export function OlderMessagesControl({
  page,
  onLoad,
}: {
  page?: HistoryPageState;
  onLoad: () => void;
}) {
  if (!page?.hasMore) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={page.loading} onClick={onLoad}>
        {page.loading ? (
          <span role="status">Loading earlier messages…</span>
        ) : page.error ? (
          'Retry earlier messages'
        ) : (
          'Load earlier messages'
        )}
      </Button>
      {page.error ? (
        <p role="alert" className="text-muted-foreground text-sm">
          {page.error}
        </p>
      ) : null}
    </div>
  );
}
