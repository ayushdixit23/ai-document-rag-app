'use client';

import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { cn } from '@repo/ui/lib/utils';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

type ChatRowMenuProps = {
  title: string;
  visible: boolean;
  disabled?: boolean;
  onRename: () => void;
  onDelete: () => void;
};

const itemClass =
  'gap-1.5 rounded-md px-2 py-1.5 text-[12px] leading-none font-medium [&_svg]:size-3';

export function ChatRowMenu({ title, visible, disabled, onRename, onDelete }: ChatRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${title}`}
          disabled={disabled}
          className={cn(
            'text-muted-foreground mr-1.5 shrink-0 opacity-0 transition-opacity',
            'hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
            visible && 'opacity-100',
          )}
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-38 rounded-xl p-1 shadow-soft"
      >
        <DropdownMenuItem
          className={itemClass}
          onSelect={() => {
            onRename();
          }}
        >
          <Pencil className="size-3" aria-hidden />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-0.5" />
        <DropdownMenuItem
          variant="destructive"
          className={itemClass}
          onSelect={() => {
            onDelete();
          }}
        >
          <Trash2 className="size-3" aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
