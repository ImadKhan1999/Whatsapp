// Local chat archive: every message in your 1:1 chats (incoming, bot replies, and messages
// you type yourself from the phone) goes into a SQLite file on this machine.
// Uses Node's built-in SQLite (node:sqlite), so nothing native to compile on Windows.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chats (
  jid        TEXT PRIMARY KEY,
  phone      TEXT,
  name       TEXT,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  messages   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id      TEXT UNIQUE,
  chat       TEXT NOT NULL,
  direction  TEXT NOT NULL CHECK (direction IN ('in','out')),
  source     TEXT NOT NULL,          -- user | bot | phone
  type       TEXT,                   -- conversation, imageMessage, ...
  text       TEXT,
  media_path TEXT,
  ts         INTEGER NOT NULL        -- unix ms
);
CREATE INDEX IF NOT EXISTS messages_chat_ts ON messages (chat, ts);
`;

export function openStore({ dir }) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'chats.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const insMsg = db.prepare(`INSERT OR IGNORE INTO messages (wa_id, chat, direction, source, type, text, media_path, ts)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const upChat = db.prepare(`INSERT INTO chats (jid, phone, name, first_seen, last_seen, messages) VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(jid) DO UPDATE SET last_seen = excluded.last_seen, messages = messages + 1,
      phone = COALESCE(excluded.phone, chats.phone), name = COALESCE(excluded.name, chats.name)`);
  const setMedia = db.prepare('UPDATE messages SET media_path = ? WHERE wa_id = ?');

  return {
    db,
    /** Returns true if the message was new. */
    save({ waId, chat, phone = null, name = null, direction, source, type = null, text = null, mediaPath = null, ts = Date.now() }) {
      const r = insMsg.run(waId ?? null, chat, direction, source, type, text, mediaPath, ts);
      if (r.changes) upChat.run(chat, phone, direction === 'in' ? name : null, ts, ts);
      return r.changes > 0;
    },
    saveMedia({ dir: mediaRoot, waId, ext, buffer, ts = Date.now() }) {
      const d = new Date(ts);
      const sub = path.join(mediaRoot, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      mkdirSync(sub, { recursive: true });
      const file = path.join(sub, `${String(waId).replace(/[^\w-]/g, '_')}.${ext}`);
      writeFileSync(file, buffer);
      setMedia.run(file, waId);
      return file;
    },
    close() { try { db.close(); } catch { /* already closed */ } },
  };
}
