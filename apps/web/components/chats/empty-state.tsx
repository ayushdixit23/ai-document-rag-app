'use client';

import { BookOpen, ListTree, Sparkles, TextSearch } from 'lucide-react';

import { useSessionUser } from '@/components/session-user-provider';

const SUGGESTIONS = [
  { prompt: 'Summarize the main argument', hint: 'Get a concise overview', icon: Sparkles },
  { prompt: 'What should I know first?', hint: 'Start with the essentials', icon: BookOpen },
  { prompt: 'Pull out key definitions', hint: 'Extract important terms', icon: TextSearch },
  { prompt: 'List the action items', hint: 'Find next steps', icon: ListTree },
] as const;

type EmptyStateProps = {
  onSuggest?: (prompt: string) => void;
};

export function EmptyState({ onSuggest }: EmptyStateProps) {
  const user = useSessionUser();
  const firstName = user?.name.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="chat-rise-in flex w-full flex-col items-center text-center">
      <h1 className="text-foreground text-[32px] leading-[1.12] font-bold tracking-[-0.045em] md:text-[40px] md:tracking-[-0.055em]">
        Hi there, {firstName}
        <span className="text-muted-foreground mt-1 block font-semibold md:mt-1.5">
          What would you like to know?
        </span>
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md text-[14px] leading-relaxed">
        Ask a question, or attach documents for answers with sources.
      </p>

      {onSuggest ? (
        <ul className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
          {SUGGESTIONS.map(({ prompt, hint, icon: Icon }) => (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => {
                  onSuggest(prompt);
                }}
                className="border-border/60 bg-card hover:border-border hover:bg-muted/40 focus-visible:ring-ring group flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="bg-muted text-muted-foreground group-hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="text-foreground block text-[13px] leading-snug font-medium">
                    {prompt}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-[12px] leading-snug">
                    {hint}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
