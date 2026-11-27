// Human-like pacing: read after a moment, show "typing…", wait roughly as long as a
// person would need to type the reply, then send. Everything goes through one queue so
// the number never fires replies in parallel.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (min, max) => Math.floor(min + Math.random() * Math.max(0, max - min));

export function typingDuration(text, h) {
  const base = text.length * h.typingMsPerChar;
  const jitter = base * (Math.random() * 0.4 - 0.2); // ±20%
  return Math.min(h.typingMaxMs, Math.max(h.typingMinMs, Math.round(base + jitter)));
}

/** Serial queue: tasks run one at a time with a randomised minimum gap between sends. */
export class SendQueue {
  constructor(minGapMs) {
    this.minGapMs = minGapMs;
    this.last = 0;
    this.chain = Promise.resolve();
    this.pending = 0;
  }
  push(task) {
    this.pending++;
    const run = async () => {
      const gap = this.minGapMs + rand(0, this.minGapMs);
      const wait = this.last + gap - Date.now();
      if (wait > 0) await sleep(wait);
      try { return await task(); } finally { this.last = Date.now(); this.pending--; }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
}
