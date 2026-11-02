'use client';

import { useRef, useState } from 'react';

import type { ComposerFile } from '@/components/chats/composer-attachments';

export function useUploadFiles() {
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const filesRef = useRef(files);
  const update = (transform: (current: ComposerFile[]) => ComposerFile[]) => {
    filesRef.current = transform(filesRef.current);
    setFiles(filesRef.current);
  };
  const patch = (id: string, value: Partial<ComposerFile>) => {
    update((current) => current.map((item) => (item.id === id ? { ...item, ...value } : item)));
  };
  return { files, filesRef, update, patch };
}
