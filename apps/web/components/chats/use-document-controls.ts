'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useChatStore } from '@/lib/chats/store';
import { errorMessage } from '@/lib/chats/store-helpers';
import { deleteDocument, fetchDocument, retryDocument } from '@/lib/documents/api';
import { pollDocument } from '@/lib/documents/poll';
import { type ChatDocument, isDocumentProcessing } from '@/lib/documents/types';

export function useDocumentControls(document: ChatDocument) {
  const setDocument = useChatStore((state) => state.setDocument);
  const removeDocument = useChatStore((state) => state.removeDocument);
  const generating = useChatStore((state) => Boolean(state.generatingChatId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [watchVersion, setWatchVersion] = useState(0);
  const action = useRef<AbortController | null>(null);
  const snapshot = useRef(document);
  useEffect(() => {
    snapshot.current = document;
  }, [document]);
  useEffect(
    () => () => {
      action.current?.abort();
    },
    [],
  );
  const processing = isDocumentProcessing(document.status);
  useEffect(() => {
    if (!processing) return;
    const controller = new AbortController();
    void pollDocument(snapshot.current, setDocument, controller.signal).catch(
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      },
    );
    return () => {
      controller.abort();
    };
  }, [document.id, processing, setDocument, watchVersion]);

  const retry = async () => {
    if (action.current || generating) return;
    const controller = new AbortController();
    action.current = controller;
    setPending(true);
    try {
      const { document: latest } = await fetchDocument(document.id, controller.signal);
      const next =
        latest.status === 'failed'
          ? (await retryDocument(document.id, controller.signal)).document
          : latest;
      if (controller.signal.aborted) return;
      setDocument(next);
      setError(undefined);
      setWatchVersion((value) => value + 1);
    } catch (failure) {
      if (!controller.signal.aborted) toast.error(errorMessage(failure));
    } finally {
      action.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const remove = async () => {
    await deleteDocument(document.id);
    removeDocument(document.id);
  };
  return { pending: pending || generating, error, retry, remove };
}
