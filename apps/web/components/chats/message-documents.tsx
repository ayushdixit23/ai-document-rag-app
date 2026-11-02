'use client';

import { useState } from 'react';

import { ConfirmDeleteDialog } from '@/components/chats/confirm-delete-dialog';
import { DocumentChip } from '@/components/chats/document-chip';
import { useDocumentControls } from '@/components/chats/use-document-controls';
import { useChatStore } from '@/lib/chats/store';
import type { ChatDocument } from '@/lib/documents/types';

function StoredDocumentChip({ document }: { document: ChatDocument }) {
  const controls = useDocumentControls(document);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <DocumentChip
        name={document.name}
        size={document.size}
        status={document.status}
        error={controls.error ?? document.errorMessage ?? undefined}
        disabled={controls.pending}
        onRetry={() => {
          void controls.retry();
        }}
        onRemove={() => {
          setDeleting(true);
        }}
      />
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete document?"
        description={`“${document.name}” will be permanently removed from your workspace and all conversations.`}
        onConfirm={controls.remove}
      />
    </>
  );
}

export function MessageDocuments({ documentIds }: { documentIds: string[] }) {
  const documents = useChatStore((state) => state.documentsById);
  if (!documentIds.length) return null;
  return (
    <ul aria-label="Message documents" className="mt-2 flex flex-wrap gap-2">
      {documentIds.map((id) => {
        const document = documents[id];
        return document ? (
          <li key={id} className="min-w-0 max-w-full">
            <StoredDocumentChip document={document} />
          </li>
        ) : null;
      })}
    </ul>
  );
}
