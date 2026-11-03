import { setTimeout } from 'node:timers/promises';

type Pause = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

/** Reserve input counts, rather than HTTP request counts, across background batches in this process. */
export class EmbeddingRateLimit {
  private entries: { count: number; at: number }[] = [];
  private blockedUntil = 0;

  constructor(
    readonly limit: number,
    private readonly now: () => number = Date.now,
    private readonly pause: Pause = (ms, signal) => setTimeout(ms, undefined, { signal }),
  ) {}

  async acquire(count: number, signal?: AbortSignal, onWait?: (retryAt: string) => Promise<void>) {
    if (count > this.limit)
      throw new Error('Embedding batch exceeds the configured input allowance.');
    for (;;) {
      signal?.throwIfAborted();
      const now = this.now();
      this.entries = this.entries.filter((entry) => entry.at > now - 60_000);
      const used = this.entries.reduce((sum, entry) => sum + entry.count, 0);
      if (used + count <= this.limit && now >= this.blockedUntil) {
        const entry = { count, at: now };
        this.entries.push(entry);
        return {
          release: () => {
            this.entries = this.entries.filter((item) => item !== entry);
          },
        };
      }
      const capacityAt = used + count > this.limit ? (this.entries[0]?.at ?? now) + 60_000 : now;
      const retryAt = Math.max(capacityAt, this.blockedUntil);
      await onWait?.(new Date(retryAt).toISOString());
      await this.pause(Math.max(1, retryAt - this.now()), signal);
    }
  }

  deferFor(milliseconds: number) {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + milliseconds);
  }
}
