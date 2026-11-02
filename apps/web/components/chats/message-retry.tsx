'use client';

import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';

import { useChatStore } from '@/lib/chats/store';
import { errorMessage } from '@/lib/chats/store-helpers';
import type { Message } from '@/lib/chats/types';

export function MessageRetry({ message }: { message: Message }) {
  const stopped = message.status === 'stopped';
  const retryMessage = useChatStore((state) => state.retryMessage);
  const generating = useChatStore((state) => Boolean(state.generatingChatId));
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await retryMessage(message.chatId, message.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div
      className={cn(
        'mt-4 rounded-lg border p-3',
        stopped ? 'border-border' : 'border-destructive/30',
      )}
    >
      <p
        role="status"
        className={cn('text-sm', stopped ? 'text-muted-foreground' : 'text-destructive')}
      >
        {message.error}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Sending again starts a new turn. Saved history will be refreshed first.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={retrying || generating}
        onClick={() => {
          void retry();
        }}
      >
        {retrying ? 'Refreshing…' : stopped ? 'Send again' : 'Retry message'}
      </Button>
    </div>
  );
}
