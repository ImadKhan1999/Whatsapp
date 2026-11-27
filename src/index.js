// Connects your own WhatsApp number (as a linked device) and runs the reply bot.
import makeWASocket, { Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState } from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from './config.js';
import { createBot } from './bot.js';
import { openStore } from './store.js';

const logger = pino({ level: config.logLevel });
const store = openStore({ dir: config.storage.dataDir });
const downloadMedia = (msg, sock) => downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
const bot = createBot({ config, logger, store, downloadMedia });
logger.info({ db: `${config.storage.dataDir}/chats.db` }, 'chat archive ready');

let retries = 0;
let pairingRequested = false;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: 'baileys' }, { level: 'warn' }),
    browser: Browsers.macOS('Desktop'), // look like an ordinary linked desktop
    markOnlineOnConnect: false,         // don't sit "online" 24/7; presence is shown only while replying
    syncFullHistory: false,             // don't pull old chats (we never answer them anyway)
    shouldIgnoreJid: (jid) => /@(g\.us|broadcast|newsletter)$/.test(jid), // skip groups/status/channels at the socket level
    generateHighQualityLinkPreview: false,
  });
  bot.setSocket(sock);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', (u) => bot.onMessages(u).catch((err) => logger.error({ err }, 'upsert failed')));

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (config.pairingNumber && !pairingRequested) {
        pairingRequested = true;
        const code = await sock.requestPairingCode(config.pairingNumber);
        console.log(`\nPairing code: ${code}\nWhatsApp > Linked devices > Link a device > Link with phone number instead.\n`);
      } else if (!config.pairingNumber) {
        console.log('\nScan this QR with WhatsApp > Linked devices > Link a device:\n');
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === 'open') {
      retries = 0;
      logger.info({ me: sock.user?.id }, 'connected. Waiting for people to message you.');
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        logger.error(`Logged out from the phone. Delete "${config.authDir}" and start again to re-link.`);
        process.exit(1);
      }
      if (code === DisconnectReason.connectionReplaced) {
        logger.error('Another instance of this bot connected with the same session. Stopping this one.');
        process.exit(1);
      }
      if (code === DisconnectReason.forbidden) {
        logger.error('WhatsApp refused the connection (403). The number may be restricted. Not retrying.');
        process.exit(1);
      }
      // Exponential backoff with jitter: never hammer WhatsApp's servers with reconnects.
      const delay = code === DisconnectReason.restartRequired ? 1000 : Math.min(300_000, 2000 * 2 ** retries) + Math.random() * 2000;
      retries++;
      logger.warn({ code, delayMs: Math.round(delay) }, 'disconnected, reconnecting');
      setTimeout(() => start().catch((err) => logger.error({ err }, 'restart failed')), delay);
    }
  });
}

// SIGBREAK = Ctrl+Break on Windows; NSSM/pm2 send SIGINT/SIGTERM.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { logger.info('shutting down'); bot.stop(); store.close(); process.exit(0); });

start().catch((err) => { logger.error({ err }, 'failed to start'); process.exit(1); });
