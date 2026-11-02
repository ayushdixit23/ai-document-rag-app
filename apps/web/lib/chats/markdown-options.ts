import { defaultRehypePlugins, type StreamdownProps } from 'streamdown';

import { rehypeCitations } from '@/lib/chats/rehype-citations';

function safeMarkdownUrl(value: string): string | undefined {
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) return url.href;
  } catch {
    /* Incomplete or unsupported links render as text. */
  }
}

// Omit raw HTML. Keep the renderer's sanitization and hardening before inserting our own markers.
const safeRehypePlugins = Object.entries(defaultRehypePlugins)
  .filter(([name]) => name !== 'raw')
  .map(([, plugin]) => plugin);

export const markdownOptions: Partial<StreamdownProps> = {
  mode: 'streaming',
  animated: false,
  lineNumbers: false,
  codeBlockMaxHeight: 0,
  tableMaxHeight: 0,
  linkSafety: { enabled: false },
  controls: { code: { copy: true, download: false }, table: false, image: false, mermaid: false },
  rehypePlugins: [...safeRehypePlugins, rehypeCitations],
  skipHtml: true,
  urlTransform: safeMarkdownUrl,
};
