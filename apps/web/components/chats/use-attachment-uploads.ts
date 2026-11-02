'use client';

import { toast } from 'sonner';

import { selectComposerFiles } from '@/components/chats/composer-attachments';
import { useUploadFiles } from '@/components/chats/use-upload-files';
import { useUploadRunner } from '@/components/chats/use-upload-runner';
import { useChatStore } from '@/lib/chats/store';
import { deleteDocument } from '@/lib/documents/api';

export function useAttachmentUploads() {
  const state = useUploadFiles();
  const { controllers, run } = useUploadRunner(state);
  const forgetDocument = useChatStore((store) => store.removeDocument);

  const addFiles = (incoming: FileList | File[]) => {
    const { files: accepted, errors } = selectComposerFiles(
      state.filesRef.current.length,
      incoming,
    );
    errors.forEach((message) => {
      toast.error(message);
    });
    state.update((current) => [...current, ...accepted]);
    accepted.forEach((item) => {
      void run(item);
    });
  };

  const removeFile = (id: string) => {
    const item = state.filesRef.current.find((file) => file.id === id);
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    state.update((current) => current.filter((file) => file.id !== id));
    if (item?.reservation) {
      const documentId = item.reservation.documentId;
      void deleteDocument(documentId)
        .then(() => {
          forgetDocument(documentId);
        })
        .catch(() => {
          toast.error('Attachment removed, but the stored file could not be deleted.');
        });
    }
  };

  const retryFile = (id: string) => {
    const item = state.filesRef.current.find((file) => file.id === id);
    if (item) void run(item, true);
  };
  const clearFiles = () => {
    controllers.current.forEach((controller) => {
      controller.abort();
    });
    controllers.current.clear();
    state.update(() => []);
  };
  return { files: state.files, addFiles, removeFile, retryFile, clearFiles };
}
