'use client';

import { type ChangeEvent, useRef } from 'react';

import { useAttachmentUploads } from '@/components/chats/use-attachment-uploads';
import { useFileDrag } from '@/components/chats/use-file-drag';

export function useComposerAttachments(disabled: boolean) {
  const uploads = useAttachmentUploads();
  const inputRef = useRef<HTMLInputElement>(null);
  const addFiles = (files: FileList) => {
    if (!disabled) uploads.addFiles(files);
  };
  const drag = useFileDrag(disabled, addFiles);
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  };
  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };
  return { ...uploads, inputRef, onInputChange, openPicker, ...drag };
}
