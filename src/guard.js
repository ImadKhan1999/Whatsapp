// Decides whether an incoming message is one the bot is allowed to answer.
// Rule of thumb: only answer a real person who wrote to us first, in a 1:1 chat,
// recently, with text. Everything else is ignored silently.

const PRIVATE_CHAT = /@(s\.whatsapp\.net|lid)$/;

/** Pull plain text out of the common WhatsApp message shapes. */
export function extractText(message) {
  if (!message) return '';
  // Unwrap containers (ephemeral / view-once / edited) to the inner message.
  const inner =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message;
  if (inner) return extractText(inner);
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageCaption ||
    message.imageMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ''
  ).trim();
}

/**
 * @returns {{ ok: true, jid: string, text: string } | { ok: false, reason: string }}
 */
export function checkIncoming(msg, { upsertType, nowSec = Date.now() / 1000, maxAgeSec = 300 } = {}) {
  // 'notify' = a new message arriving live. 'append' = history sync/backlog: never answer that.
  if (upsertType !== 'notify') return { ok: false, reason: 'not-live' };
  const key = msg?.key;
  if (!key?.remoteJid) return { ok: false, reason: 'no-jid' };
  if (key.fromMe) return { ok: false, reason: 'from-me' };

  // Only private 1:1 chats. Groups (@g.us), status (status@broadcast), broadcast lists,
  // newsletters/channels (@newsletter) are all skipped.
  if (!PRIVATE_CHAT.test(key.remoteJid)) return { ok: false, reason: 'not-private-chat' };

  if (!msg.message) return { ok: false, reason: 'no-content' }; // receipts, stubs, failed decrypts
  if (msg.message.protocolMessage || msg.message.reactionMessage) return { ok: false, reason: 'system' };

  const ts = Number(msg.messageTimestamp || 0);
  if (ts && nowSec - ts > maxAgeSec) return { ok: false, reason: 'too-old' };

  const text = extractText(msg.message);
  if (!text) return { ok: false, reason: 'no-text' };
  if (text.length > 1000) return { ok: false, reason: 'too-long' };

  return { ok: true, jid: key.remoteJid, text };
}
