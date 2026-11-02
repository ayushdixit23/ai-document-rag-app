export type ScrollAnimation = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  now: () => number;
  reducedMotion: () => boolean;
};

const browserAnimation: ScrollAnimation = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => {
    cancelAnimationFrame(id);
  },
  now: () => performance.now(),
  reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

/** Follow changing content without restarting native smooth-scroll on every token. */
export class ScrollFollower {
  private frame: number | undefined;
  private following = true;
  private disposed = false;

  constructor(
    private element: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
    private onChange: (following: boolean) => void,
    private animation: ScrollAnimation = browserAnimation,
  ) {}

  private setFollowing(value: boolean) {
    if (this.following === value) return;
    this.following = value;
    this.onChange(value);
  }

  update() {
    if (!this.following || this.disposed || this.frame !== undefined) return;
    if (this.animation.reducedMotion()) {
      this.jump();
      return;
    }
    let last = this.animation.now();
    const step = (now: number) => {
      const target = Math.max(0, this.element.scrollHeight - this.element.clientHeight);
      const distance = target - this.element.scrollTop;
      const fraction = 1 - Math.exp(-Math.min(now - last, 64) / 45);
      last = now;
      if (Math.abs(distance) < 1) {
        this.element.scrollTop = target;
        this.frame = undefined;
        return;
      }
      this.element.scrollTop += distance * fraction;
      this.frame = this.animation.request(step);
    };
    this.frame = this.animation.request(step);
  }

  onScroll() {
    if (this.frame !== undefined) return;
    const remaining =
      this.element.scrollHeight - this.element.clientHeight - this.element.scrollTop;
    if (remaining <= 2) this.setFollowing(true);
    else if (remaining > 80) this.setFollowing(false);
  }

  pause() {
    if (this.frame !== undefined) this.animation.cancel(this.frame);
    this.frame = undefined;
    this.setFollowing(false);
  }

  resume() {
    this.setFollowing(true);
    this.update();
  }

  jump() {
    if (this.frame !== undefined) this.animation.cancel(this.frame);
    this.frame = undefined;
    this.setFollowing(true);
    this.element.scrollTop = Math.max(0, this.element.scrollHeight - this.element.clientHeight);
  }

  dispose() {
    if (this.frame !== undefined) this.animation.cancel(this.frame);
    this.frame = undefined;
    this.disposed = true;
  }
}
