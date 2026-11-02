'use client';

import { cn } from '@repo/ui/lib/utils';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'nextjs-toploader/app';
import { useState } from 'react';
import { toast } from 'sonner';

import { ChatRowMenu } from '@/components/chats/chat-row-menu';
import { ChatRowRename } from '@/components/chats/chat-row-rename';
import { ConfirmDeleteDialog } from '@/components/chats/confirm-delete-dialog';
import { useChatStore } from '@/lib/chats/store';
import { errorMessage } from '@/lib/chats/store-helpers';
import type { Chat } from '@/lib/chats/types';

function useChatRow(chat: Chat) {
  const pathname = usePathname();
  const router = useRouter();
  const deleteChat = useChatStore((state) => state.deleteChat);
  const renameChat = useChatStore((state) => state.renameChat);
  const generating = useChatStore((state) => state.generatingChatId === chat.id);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isActive = pathname === `/chats/${chat.id}`;
  const remove = async () => {
    await deleteChat(chat.id);
    if (isActive) router.push('/chats');
  };
  const rename = async (title: string) => {
    try {
      await renameChat(chat.id, title);
      setRenaming(false);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };
  return { isActive, renaming, setRenaming, deleting, setDeleting, generating, remove, rename };
}

export function ChatRow({ chat, onNavigate }: { chat: Chat; onNavigate?: () => void }) {
  const { isActive, renaming, setRenaming, deleting, setDeleting, generating, remove, rename } =
    useChatRow(chat);
  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-0.5 rounded-lg transition-colors',
          isActive ? 'bg-muted' : 'hover:bg-muted/60',
        )}
      >
        {renaming ? (
          <ChatRowRename
            title={chat.title}
            onSave={rename}
            onCancel={() => {
              setRenaming(false);
            }}
          />
        ) : (
          <Link
            href={`/chats/${chat.id}`}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-sm focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none',
              isActive ? 'text-foreground font-medium' : 'text-sidebar-foreground/90',
            )}
          >
            <MessageSquare className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{chat.title}</span>
          </Link>
        )}
        {!renaming ? (
          <ChatRowMenu
            title={chat.title}
            visible={isActive}
            disabled={generating}
            onRename={() => {
              window.setTimeout(() => {
                setRenaming(true);
              }, 0);
            }}
            onDelete={() => {
              setDeleting(true);
            }}
          />
        ) : null}
      </div>
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete conversation?"
        description={`“${chat.title}” and its messages will be permanently deleted. Your documents will stay in your workspace.`}
        onConfirm={remove}
      />
    </>
  );
}
