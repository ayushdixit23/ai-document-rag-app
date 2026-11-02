export function TypingIndicator() {
  return (
    <div role="status" className="flex h-6 items-center gap-1.5">
      <span className="sr-only">Thinking of an answer</span>
      <span
        aria-hidden
        className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
      />
      <span
        aria-hidden
        className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full [animation-delay:160ms] motion-reduce:animate-none"
      />
      <span
        aria-hidden
        className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full [animation-delay:320ms] motion-reduce:animate-none"
      />
    </div>
  );
}
