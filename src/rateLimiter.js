// Sliding-window counters for outgoing replies and incoming floods.

export class SlidingWindow {
  constructor() { this.hits = new Map(); }
  _prune(key, windowMs, now) {
    const arr = this.hits.get(key);
    if (!arr) return [];
    while (arr.length && now - arr[0] >= windowMs) arr.shift();
    if (!arr.length) this.hits.delete(key);
    return arr;
  }
  count(key, windowMs, now = Date.now()) { return this._prune(key, windowMs, now).length; }
  add(key, now = Date.now()) {
    if (!this.hits.has(key)) this.hits.set(key, []);
    this.hits.get(key).push(now);
  }
  /** Drop keys with nothing left in the largest window, so memory stays bounded. */
  sweep(maxWindowMs, now = Date.now()) { for (const k of [...this.hits.keys()]) this._prune(k, maxWindowMs, now); }
}

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export class RateLimiter {
  constructor(limits) {
    this.l = limits;
    this.out = new SlidingWindow();
    this.inc = new SlidingWindow();
    this.muted = new Map(); // jid -> unmute timestamp
  }

  /** Record an incoming message. Returns false if the chat is flooding (and mutes it). */
  noteIncoming(jid, now = Date.now()) {
    if (this.isMuted(jid, now)) return false;
    this.inc.add(jid, now);
    if (this.inc.count(jid, MIN, now) > this.l.incomingFloodPerMinute) {
      this.muted.set(jid, now + this.l.muteMinutes * MIN);
      return false;
    }
    return true;
  }

  isMuted(jid, now = Date.now()) {
    const until = this.muted.get(jid);
    if (!until) return false;
    if (now >= until) { this.muted.delete(jid); return false; }
    return true;
  }

  /** Can we send one more reply to this chat right now? Returns null if yes, else the reason. */
  blockReason(jid, now = Date.now()) {
    const l = this.l;
    if (this.out.count('*', DAY, now) >= l.globalPerDay) return 'global-day';
    if (this.out.count('*', HOUR, now) >= l.globalPerHour) return 'global-hour';
    if (this.out.count('*', MIN, now) >= l.globalPerMinute) return 'global-minute';
    if (this.out.count(jid, HOUR, now) >= l.perChatPerHour) return 'chat-hour';
    if (this.out.count(jid, MIN, now) >= l.perChatPerMinute) return 'chat-minute';
    return null;
  }

  noteOutgoing(jid, now = Date.now()) { this.out.add(jid, now); this.out.add('*', now); }

  sweep(now = Date.now()) {
    this.out.sweep(DAY, now);
    this.inc.sweep(MIN, now);
    for (const [jid, until] of this.muted) if (now >= until) this.muted.delete(jid);
  }
}
