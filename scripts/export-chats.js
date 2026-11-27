// Export the chat archive to CSV:  npm run export  ->  data/export/messages-YYYY-MM-DD.csv
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const db = new DatabaseSync(path.join(config.storage.dataDir, 'chats.db'), { readOnly: true });
const rows = db.prepare(`SELECT m.ts, m.chat, c.phone, c.name, m.direction, m.source, m.type, m.text, m.media_path
                         FROM messages m LEFT JOIN chats c ON c.jid = m.chat ORDER BY m.ts`).all();
const esc = (v) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const header = ['time', 'chat', 'phone', 'name', 'direction', 'source', 'type', 'text', 'media_path'];
const csv = [header.join(','), ...rows.map((r) => [new Date(r.ts).toISOString(), r.chat, r.phone, r.name, r.direction, r.source, r.type, r.text, r.media_path].map(esc).join(','))].join('\r\n');
const out = path.join(config.storage.dataDir, 'export');
mkdirSync(out, { recursive: true });
const file = path.join(out, `messages-${new Date().toISOString().slice(0, 10)}.csv`);
writeFileSync(file, '﻿' + csv); // BOM so Excel opens Urdu text correctly
console.log(`Exported ${rows.length} messages to ${file}`);
