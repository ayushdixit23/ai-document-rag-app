import type { ComponentProps } from 'react';
import type { Components, ExtraProps } from 'streamdown';

import { MarkdownCitation } from '@/components/chats/markdown-citations';

function MarkdownLink({ href, children }: ComponentProps<'a'> & ExtraProps) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">
      {children}
    </a>
  );
}

function MarkdownImage({ alt }: ComponentProps<'img'> & ExtraProps) {
  return <span className="text-muted-foreground">{alt || 'Image'}</span>;
}

function MarkdownStrong({ children }: ComponentProps<'strong'> & ExtraProps) {
  return <strong>{children}</strong>;
}

// Stable component identities let Streamdown retain completed blocks and their controls.
export const markdownComponents: Components = {
  a: MarkdownLink,
  cite: MarkdownCitation,
  img: MarkdownImage,
  strong: MarkdownStrong,
};
