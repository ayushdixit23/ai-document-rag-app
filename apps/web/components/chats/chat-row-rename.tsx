'use client';

import { Input } from '@repo/ui/components/input';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

type ChatRowRenameProps = {
  title: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
};

function useRenameForm({ title, onSave, onCancel }: ChatRowRenameProps) {
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const closedRef = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (action: () => void) => {
    if (closedRef.current) {
      return;
    }
    closedRef.current = true;
    action();
  };

  const commit = async () => {
    if (closedRef.current) return;
    const next = value.trim();
    if (!next || next === title) {
      finish(onCancel);
      return;
    }
    closedRef.current = true;
    setPending(true);
    try {
      await onSave(next);
    } catch {
      closedRef.current = false;
      inputRef.current?.focus();
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void commit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(onCancel);
    }
  };

  return { value, setValue, inputRef, pending, commit, onSubmit, onKeyDown };
}

export function ChatRowRename(props: ChatRowRenameProps) {
  const { value, setValue, inputRef, pending, commit, onSubmit, onKeyDown } = useRenameForm(props);
  return (
    <form className="flex min-w-0 flex-1 items-center px-2 py-1" onSubmit={onSubmit}>
      <Input
        ref={inputRef}
        value={value}
        aria-label="Rename chat"
        maxLength={200}
        disabled={pending}
        className="h-8 rounded-md px-2 text-sm"
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={onKeyDown}
      />
    </form>
  );
}
