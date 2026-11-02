'use client';

import { type DragEvent, useRef, useState } from 'react';

export function useFileDrag(disabled: boolean, onDropFiles: (files: FileList) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  return {
    isDragging,
    onDragEnter: (event: DragEvent) => {
      event.preventDefault();
      if (disabled || !event.dataTransfer.types.includes('Files')) return;
      dragDepth.current += 1;
      setIsDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setIsDragging(false);
    },
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      if (!disabled && event.dataTransfer.files.length) onDropFiles(event.dataTransfer.files);
    },
  };
}
