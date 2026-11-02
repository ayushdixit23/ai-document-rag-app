'use client';

import { useRouter } from 'nextjs-toploader/app';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { createPendingTurn } from '@/lib/chats/pending-turn';
import { useChatStore } from '@/lib/chats/store';
import { errorMessage } from '@/lib/chats/store-helpers';
import type { Message, SendMessageInput } from '@/lib/chats/types';

export function useChatSend(chatId?: string) {
  const router = useRouter();
  const createChat = useChatStore((state) => state.createChat);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const generatingId = useChatStore((state) => state.generatingChatId);
  const stopGenerating = useChatStore((state) => state.stopGenerating);
  const generating = Boolean(generatingId);
  const [createdId, setCreatedId] = useState<string>();
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const [creating, setCreating] = useState(false);
  const locked = useRef(false);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current += 1;
    },
    [chatId],
  );
  const activeId = chatId ?? createdId;

  const onSend = async (input: SendMessageInput): Promise<boolean> => {
    if (locked.current || generating) return false;
    locked.current = true;
    const current = revision.current;
    setCreating(true);
    if (!activeId) setPendingMessages(createPendingTurn('draft', input));
    try {
      const id = activeId ?? (await createChat());
      if (revision.current !== current) return false;
      sendMessage(id, input);
      if (!activeId) {
        setCreatedId(id);
        router.push(`/chats/${id}`);
      }
      return true;
    } catch (error) {
      if (revision.current === current) toast.error(errorMessage(error));
      return false;
    } finally {
      locked.current = false;
      if (revision.current === current) {
        setCreating(false);
        setPendingMessages([]);
      }
    }
  };
  const onStop =
    activeId && generatingId === activeId
      ? () => {
          stopGenerating(activeId);
        }
      : undefined;
  return { activeId, pendingMessages, disabled: creating || generating, onSend, onStop };
}
