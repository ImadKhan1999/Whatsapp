// Central configuration. Every value can be overridden through environment variables
// (see .env.example). Defaults are deliberately conservative to keep the number safe.
import { readFileSync, existsSync } from 'node:fs';

// Minimal .env loader so the bot has no extra dependency for it.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const num = (name, def) => {
  const v = process.env[name];
  const n = v === undefined || v === '' ? def : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid number for ${name}: ${v}`);
  return n;
};

export const config = {
  authDir: process.env.AUTH_DIR || './auth',
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),
  logLevel: process.env.LOG_LEVEL || 'info',

  human: {
    readDelayMinMs: num('READ_DELAY_MIN_MS', 1500),
    readDelayMaxMs: num('READ_DELAY_MAX_MS', 4000),
    typingMsPerChar: num('TYPING_MS_PER_CHAR', 45),
    typingMinMs: num('TYPING_MIN_MS', 1500),
    typingMaxMs: num('TYPING_MAX_MS', 7000),
    minGapBetweenSendsMs: num('MIN_GAP_BETWEEN_SENDS_MS', 3000),
  },

  limits: {
    perChatPerMinute: num('PER_CHAT_REPLIES_PER_MINUTE', 4),
    perChatPerHour: num('PER_CHAT_REPLIES_PER_HOUR', 30),
    globalPerMinute: num('GLOBAL_REPLIES_PER_MINUTE', 12),
    globalPerHour: num('GLOBAL_REPLIES_PER_HOUR', 300),
    globalPerDay: num('GLOBAL_REPLIES_PER_DAY', 1500),
    incomingFloodPerMinute: num('INCOMING_FLOOD_PER_MINUTE', 10),
    muteMinutes: num('MUTE_MINUTES', 15),
    maxMessageAgeSeconds: num('MAX_MESSAGE_AGE_SECONDS', 300),
    fallbackCooldownMinutes: num('FALLBACK_COOLDOWN_MINUTES', 10),
  },
};
