'use client';

import type { ComposerFile } from '@/components/chats/composer-attachments';
import { DocumentChip } from '@/components/chats/document-chip';

type ComposerFileListProps = {
  files: ComposerFile[];
  disabled?: boolean;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
};

export function ComposerFileList({ files, disabled, onRemove, onRetry }: ComposerFileListProps) {
  if (!files.length) return null;
  return (
    <ul aria-label="Attached documents" className="mb-3 flex flex-wrap gap-x-2 gap-y-3 pt-1.5">
      {files.map((item) => (
        <li key={item.id} className="min-w-0 max-w-full">
          <DocumentChip
            name={item.file.name}
            size={item.file.size}
            status={item.status}
            progress={item.document?.processingProgress}
            error={item.error}
            disabled={disabled}
            onRemove={() => {
              onRemove(item.id);
            }}
            onRetry={() => {
              onRetry(item.id);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
