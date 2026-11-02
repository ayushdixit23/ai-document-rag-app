'use client';

import { useEffect, useRef } from 'react';

import type { ComposerFile } from '@/components/chats/composer-attachments';
import type { useUploadFiles } from '@/components/chats/use-upload-files';
import { useChatStore } from '@/lib/chats/store';
import { errorMessage } from '@/lib/chats/store-helpers';
import { pollDocument } from '@/lib/documents/poll';
import type { ChatDocument } from '@/lib/documents/types';
import { recoverUpload, uploadFile } from '@/lib/documents/upload';

export function useUploadRunner(state: ReturnType<typeof useUploadFiles>) {
  const controllers = useRef(new Map<string, AbortController>());
  const setDocument = useChatStore((store) => store.setDocument);
  useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach((controller) => {
        controller.abort();
      });
      active.clear();
    };
  }, []);

  const run = async (item: ComposerFile, retry = false) => {
    controllers.current.get(item.id)?.abort();
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    state.patch(item.id, { status: 'uploading', error: undefined });
    const accept = (document: ChatDocument) => {
      if (controller.signal.aborted) return;
      setDocument(document);
      state.patch(item.id, {
        document,
        status: document.status,
        error: document.errorMessage ?? undefined,
      });
    };
    try {
      const document = await (retry ? recoverUpload : uploadFile)(item.file, {
        signal: controller.signal,
        reservation: item.reservation,
        onReserved: (reservation) => {
          state.patch(item.id, { reservation });
        },
      });
      accept(document);
      await pollDocument(document, accept, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        state.patch(item.id, { status: 'failed', error: errorMessage(error) });
    } finally {
      if (controllers.current.get(item.id) === controller) controllers.current.delete(item.id);
    }
  };

  return { controllers, run };
}
