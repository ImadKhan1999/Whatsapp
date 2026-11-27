// Turns an incoming text into a reply by picking a handler.
//
// A handler looks like:
//   {
//     id: 'rollno',                       // unique id, also used for multi-step flows
//     menu: '1',                          // optional menu number shown in the main menu
//     title: 'Roll number slip',          // shown in the main menu
//     match: /^(roll|roll ?no)\b/i,       // optional extra trigger words
//     async handle(ctx) { return 'text' } // first message of the feature
//     async onInput(ctx) { ... }          // optional: follow-up answers while ctx.expect(id) is active
//   }
// ctx = { jid, phone, text, chat, expect(id, data), clear(), handlers }
// Return a string, or { text, image?: Buffer, document?: Buffer, fileName?, mimetype? },
// or null to stay silent. From onInput, return undefined to hand the text to normal routing.
// Set speed: 'fast' on a handler to use the quicker pacing from config.fast.

const CANCEL = /^(0|cancel|stop|back|menu|exit)$/i;
const SESSION_TTL_MS = 15 * 60_000;

export class Router {
  constructor(handlers, { fallback } = {}) {
    this.handlers = handlers;
    this.byId = new Map(handlers.map((h) => [h.id, h]));
    this.fallback = fallback;
    this.chats = new Map(); // jid -> { expecting, data, at }
  }

  _chat(jid) {
    let c = this.chats.get(jid);
    if (!c || Date.now() - c.at > SESSION_TTL_MS) { c = { expecting: null, data: {} }; this.chats.set(jid, c); }
    c.at = Date.now();
    return c;
  }

  /** @returns {Promise<{ reply: string|object, speed: 'fast'|'normal' } | null>} */
  async route(jid, text, meta = {}) {
    const { reply, handler } = await this._route(jid, text, meta);
    if (!reply) return null;
    return { reply, speed: handler?.speed === 'fast' ? 'fast' : 'normal' };
  }

  async _route(jid, text, meta) {
    const chat = this._chat(jid);
    const ctx = {
      jid, text, chat, handlers: this.handlers, phone: meta.phone || null,
      expect: (id, data = {}) => { chat.expecting = id; chat.data = data; },
      clear: () => { chat.expecting = null; chat.data = {}; },
    };

    // In the middle of a multi-step flow: feed the answer to that handler.
    if (chat.expecting && !CANCEL.test(text)) {
      const h = this.byId.get(chat.expecting);
      if (h?.onInput) {
        const reply = await h.onInput(ctx);
        if (reply !== undefined) return { reply, handler: h };
      }
    }
    if (chat.expecting) ctx.clear();

    const t = text.trim();
    const h =
      this.handlers.find((x) => x.menu && x.menu === t) ||
      this.handlers.find((x) => x.match && x.match.test(t));
    if (h) return { reply: await h.handle(ctx), handler: h };
    return { reply: this.fallback ? await this.fallback(ctx) : null, handler: null };
  }

  sweep() {
    const now = Date.now();
    for (const [jid, c] of this.chats) if (now - c.at > SESSION_TTL_MS) this.chats.delete(jid);
  }
}
