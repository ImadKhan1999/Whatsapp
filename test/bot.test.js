import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIncoming } from '../src/guard.js';
import { RateLimiter } from '../src/rateLimiter.js';
import { createBot } from '../src/bot.js';

const now = () => Date.now() / 1000;
const m = (jid, text, extra = {}) => ({
  key: { remoteJid: jid, id: Math.random().toString(36).slice(2), fromMe: false, ...extra.key },
  message: { conversation: text },
  messageTimestamp: Math.floor(now()),
  ...extra.msg,
});
const USER = '923001234567@s.whatsapp.net';

test('guard: answers only live private text from others', () => {
  assert.equal(checkIncoming(m(USER, 'hi'), { upsertType: 'notify' }).ok, true);
  assert.equal(checkIncoming(m('123@lid', 'hi'), { upsertType: 'notify' }).ok, true);
  const no = (msg, type = 'notify') => checkIncoming(msg, { upsertType: type }).reason;
  assert.equal(no(m(USER, 'hi'), 'append'), 'not-live');
  assert.equal(no(m(USER, 'hi', { key: { fromMe: true } })), 'from-me');
  assert.equal(no(m('1203630@g.us', 'hi')), 'not-private-chat');
  assert.equal(no(m('status@broadcast', 'hi')), 'not-private-chat');
  assert.equal(no(m('1234@newsletter', 'hi')), 'not-private-chat');
  assert.equal(no(m(USER, 'hi', { msg: { messageTimestamp: Math.floor(now()) - 3600 } })), 'too-old');
  assert.equal(no({ ...m(USER, ''), message: { imageMessage: {} } }), 'no-text');
  assert.equal(no({ ...m(USER, ''), message: { reactionMessage: {} } }), 'system');
});

const limits = { perChatPerMinute: 2, perChatPerHour: 3, globalPerMinute: 3, globalPerHour: 100, globalPerDay: 1000, incomingFloodPerMinute: 3, muteMinutes: 1, maxMessageAgeSeconds: 300, fallbackCooldownMinutes: 10 };

test('rate limiter: per-chat and global caps, flood mute', () => {
  const r = new RateLimiter(limits);
  const t = 1_000_000;
  r.noteOutgoing('a', t); r.noteOutgoing('a', t);
  assert.equal(r.blockReason('a', t), 'chat-minute');
  r.noteOutgoing('b', t);
  assert.equal(r.blockReason('c', t), 'global-minute');
  assert.equal(r.blockReason('a', t + 61_000), null);
  for (let i = 0; i < 3; i++) assert.equal(r.noteIncoming('x', t), true);
  assert.equal(r.noteIncoming('x', t), false);
  assert.equal(r.isMuted('x', t + 30_000), true);
  assert.equal(r.isMuted('x', t + 61_000), false);
});

function fakeBot() {
  const sent = [], presence = [], read = [];
  const zero = { readDelayMinMs: 0, readDelayMaxMs: 0, typingMsPerChar: 0, typingMinMs: 0, typingMaxMs: 0, minGapBetweenSendsMs: 0 };
  const config = { limits, human: zero, fast: { ...zero } };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const bot = createBot({ config, logger });
  bot.setSocket({
    readMessages: async (k) => read.push(k),
    sendPresenceUpdate: async (p, j) => presence.push([p, j]),
    sendMessage: async (jid, content) => sent.push({ jid, text: content.text ?? content.caption, content }),
  });
  const flush = () => bot.queue.push(async () => {});
  return { bot, sent, presence, read, flush };
}

test('bot: replies to the chat that wrote, with read + typing first', async () => {
  const { bot, sent, presence, read, flush } = fakeBot();
  await bot.onMessages({ type: 'notify', messages: [m(USER, 'hi')] });
  await flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, USER);
  assert.match(sent[0].text, /Reply with a number/);
  assert.equal(read.length, 1);
  assert.deepEqual(presence.map((p) => p[0]), ['composing', 'paused']);
  bot.stop();
});

test('bot: menu options route to ETEA handlers', async () => {
  const { bot, sent, flush } = fakeBot();
  await bot.onMessages({ type: 'notify', messages: [m(USER, '1')] });
  await bot.onMessages({ type: 'notify', messages: [m('2@s.whatsapp.net', 'forgot password')] });
  await flush();
  assert.match(sent[0].text, /CNIC/);
  assert.match(sent[1].text, /password/i);
  bot.stop();
});

test('bot: never replies to groups, own messages, backlog, or the same message twice', async () => {
  const { bot, sent, flush } = fakeBot();
  const dup = m(USER, 'hi');
  await bot.onMessages({ type: 'notify', messages: [m('1@g.us', 'hi'), m(USER, 'hi', { key: { fromMe: true } }), dup, dup] });
  await bot.onMessages({ type: 'append', messages: [m(USER, 'hi')] });
  await flush();
  assert.equal(sent.length, 1);
  bot.stop();
});

test('bot: unknown text gets the menu only once per cooldown', async () => {
  const { bot, sent, flush } = fakeBot();
  await bot.onMessages({ type: 'notify', messages: [m(USER, 'asdf')] });
  await bot.onMessages({ type: 'notify', messages: [m(USER, 'qwerty')] });
  await flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /didn't understand/);
  bot.stop();
});

test('bot: per-chat limit stops a chat from getting a burst of replies', async () => {
  const { bot, sent, flush } = fakeBot();
  for (const t of ['hi', '1', '2']) await bot.onMessages({ type: 'notify', messages: [m(USER, t)] });
  await flush();
  assert.equal(sent.length, 2); // perChatPerMinute = 2
  bot.stop();
});

test('router: ETEA features use the fast pace, menu uses normal', async () => {
  const { bot } = fakeBot();
  assert.equal((await bot.router.route('a@s.whatsapp.net', '1')).speed, 'fast');
  assert.equal((await bot.router.route('b@s.whatsapp.net', 'roll no')).speed, 'fast');
  assert.equal((await bot.router.route('d@s.whatsapp.net', 'forgot password')).speed, 'fast');
  assert.equal((await bot.router.route('e@s.whatsapp.net', 'hi')).speed, 'normal');
  bot.stop();
});

test('archive: stores incoming, bot replies (masked) and phone messages, plus media', async () => {
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { openStore } = await import('../src/store.js');
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-'));
  const store = openStore({ dir });
  const zero = { readDelayMinMs: 0, readDelayMaxMs: 0, typingMsPerChar: 0, typingMinMs: 0, typingMaxMs: 0, minGapBetweenSendsMs: 0 };
  const config = { limits, human: zero, fast: zero, storage: { dataDir: dir, saveMedia: true, maxMediaMb: 16 } };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const secretHandler = { id: 'x', menu: '9', title: 'x', handle: () => ({ text: 'pw is hunter2', logText: 'pw is ••••' }) };
  const bot = createBot({ config, logger, store, handlers: [secretHandler], downloadMedia: async () => Buffer.from('img') });
  let n = 0;
  bot.setSocket({
    readMessages: async () => {}, sendPresenceUpdate: async () => {},
    sendMessage: async (jid, content) => {
      const sent = { key: { remoteJid: jid, id: `BOT${++n}`, fromMe: true }, message: { conversation: content.text }, messageTimestamp: Math.floor(now()) };
      await bot.onMessages({ type: 'append', messages: [sent] }); // WhatsApp echoes our own message
      return sent;
    },
  });
  await bot.onMessages({ type: 'notify', messages: [m(USER, '9', { msg: { pushName: 'Ali' } })] });
  await bot.onMessages({ type: 'notify', messages: [{ key: { remoteJid: USER, id: 'IMG1', fromMe: false }, message: { imageMessage: { caption: 'my slip', mimetype: 'image/jpeg' } }, messageTimestamp: Math.floor(now()) }] });
  await bot.onMessages({ type: 'notify', messages: [m(USER, 'typed on phone', { key: { fromMe: true } })] });
  await bot.onMessages({ type: 'notify', messages: [m('1@g.us', 'group msg')] });
  await bot.queue.push(async () => {});

  const rows = store.db.prepare('SELECT direction, source, type, text, media_path FROM messages ORDER BY id').all();
  const has = (d, src, text) => rows.find((r) => r.direction === d && r.source === src && r.text === text);
  assert.ok(has('in', 'user', '9'));
  assert.ok(has('out', 'phone', 'typed on phone'));
  assert.ok(has('out', 'bot', 'pw is ••••'));
  assert.equal(rows.filter((r) => r.text === 'pw is ••••').length, 1); // echo not stored twice
  const img = has('in', 'user', 'my slip');
  assert.ok(img && existsSync(img.media_path));
  assert.ok(!JSON.stringify(rows).includes('hunter2'));
  const chat = store.db.prepare('SELECT * FROM chats').get();
  assert.equal(chat.name, 'Ali');
  assert.equal(chat.messages, rows.length);
  bot.stop(); store.close(); rmSync(dir, { recursive: true, force: true });
});
