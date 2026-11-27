// Decides what goes into the local chat archive and masks secrets before they're stored.
import { extractText } from './guard.js';

const PRIVATE_CHAT = /@(s\.whatsapp\.net|lid)$/;
const SKIP_TYPES = new Set(['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'reactionMessage', 'pollUpdateMessage']);
const MEDIA = { imageMessage: 'jpg', videoMessage: 'mp4', audioMessage: 'ogg', documentMessage: 'bin', stickerMessage: 'webp' };
const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4' };

function unwrap(message) {
  return message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message
    || message?.documentWithCaptionMessage?.message || message;
}
const typeOf = (m) => Object.keys(m || {}).find((k) => !SKIP_TYPES.has(k)) || null;

export function createArchiver({ store, config, logger, phoneOf, downloadMedia }) {
  const pending = new Map(); // `${jid}\n${text}` -> { logText, at }  (bot replies about to go out)

  function willSend(jid, text, logText) {
    pending.set(`${jid}\n${text}`, { logText: logText ?? text, at: Date.now() });
    for (const [k, v] of pending) if (Date.now() - v.at > 120_000) pending.delete(k);
  }

  async function record(msg) {
    if (!store) return;
    const jid = msg?.key?.remoteJid;
    if (!jid || !PRIVATE_CHAT.test(jid) || !msg.message) return;
    const inner = unwrap(msg.message);
    const type = typeOf(inner);
    if (!type) return;

    let text = extractText(msg.message) || inner[type]?.caption || inner[type]?.fileName || null;
    let source = msg.key.fromMe ? 'phone' : 'user';
    if (msg.key.fromMe) {
      const k = `${jid}\n${text ?? ''}`;
      const p = pending.get(k);
      if (p) { source = 'bot'; text = p.logText; pending.delete(k); }
    }
    const ts = Number(msg.messageTimestamp || 0) * 1000 || Date.now();
    let isNew;
    try {
      isNew = store.save({
        waId: msg.key.id, chat: jid, phone: phoneOf(msg.key), name: msg.pushName || null,
        direction: msg.key.fromMe ? 'out' : 'in', source, type, text, ts,
      });
    } catch (err) { logger.error({ err }, 'archive write failed'); return; }

    // Save media people send you (not the bot's own captcha pictures).
    if (isNew && source !== 'bot' && MEDIA[type] && config.storage.saveMedia && downloadMedia) {
      const size = Number(inner[type].fileLength || 0);
      if (size > config.storage.maxMediaMb * 1024 * 1024) return;
      try {
        const buffer = await downloadMedia(msg);
        const ext = EXT_BY_MIME[inner[type].mimetype?.split(';')[0]] || MEDIA[type];
        store.saveMedia({ dir: `${config.storage.dataDir}/media`, waId: msg.key.id, ext, buffer, ts });
      } catch (err) { logger.warn({ err: err.message, jid }, 'media download failed'); }
    }
  }

  return { record, willSend };
}
