// The message pipeline: filter -> flood check -> route -> rate limit -> human-paced send.
// Kept separate from the connection code so it can be tested with a fake socket.
import { checkIncoming } from './guard.js';
import { RateLimiter } from './rateLimiter.js';
import { SendQueue, sleep, rand, typingDuration } from './humanize.js';
import { Router } from './router.js';
import { handlers as defaultHandlers, makeFallback } from './handlers/index.js';

export function createBot({ config, logger, handlers = defaultHandlers, now = () => Date.now() }) {
  const limiter = new RateLimiter(config.limits);
  const queue = new SendQueue(config.human.minGapBetweenSendsMs);
  const router = new Router(handlers, { fallback: makeFallback(config.limits.fallbackCooldownMinutes) });
  const seen = new Map(); // message id -> time, to never answer the same message twice

  let sock = null;
  const setSocket = (s) => { sock = s; };

  async function deliver(msg, jid, reply, h) {
    // 1. Pause, then mark as read, like someone picking up the phone.
    await sleep(rand(h.readDelayMinMs, h.readDelayMaxMs));
    await sock.readMessages([msg.key]).catch(() => {});
    // 2. Show "typing…" for about as long as the reply takes to type.
    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    await sleep(typingDuration(reply, h));
    await sock.sendPresenceUpdate('paused', jid).catch(() => {});
    // 3. Send as a reply to the user's own message.
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
  }

  async function onMessages({ messages, type }) {
    for (const msg of messages) {
      const id = msg.key?.id;
      if (id && seen.has(id)) continue;
      if (id) seen.set(id, now());

      const v = checkIncoming(msg, { upsertType: type, nowSec: now() / 1000, maxAgeSec: config.limits.maxMessageAgeSeconds });
      if (!v.ok) { logger.debug({ reason: v.reason, jid: msg.key?.remoteJid }, 'ignored'); continue; }
      const { jid, text } = v;

      if (!limiter.noteIncoming(jid, now())) { logger.warn({ jid }, 'chat flooding or muted, staying silent'); continue; }

      let reply, pace = config.human;
      try {
        const r = await router.route(jid, text);
        if (!r) continue;
        reply = r.text;
        if (r.speed === 'fast' && config.fast) pace = config.fast;
      } catch (err) { logger.error({ err, jid }, 'handler failed'); reply = 'Sorry, something went wrong. Please try again later.'; }

      const blocked = limiter.blockReason(jid, now());
      if (blocked) { logger.warn({ jid, blocked }, 'rate limit hit, not replying'); continue; }
      limiter.noteOutgoing(jid, now());

      queue
        .push(() => deliver(msg, jid, reply, pace), pace.minGapBetweenSendsMs)
        .then(() => logger.info({ jid }, 'replied'))
        .catch((err) => logger.error({ err, jid }, 'send failed'));
    }
  }

  // Housekeeping so memory stays flat on a long-running bot.
  const timer = setInterval(() => {
    const t = now();
    limiter.sweep(t);
    router.sweep();
    for (const [id, at] of seen) if (t - at > 3_600_000) seen.delete(id);
  }, 60_000);
  timer.unref();

  return { onMessages, setSocket, limiter, router, queue, stop: () => clearInterval(timer) };
}
