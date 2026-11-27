# ETEA WhatsApp Bot

A WhatsApp bot that runs on **your own number** (linked as a device, like WhatsApp Web) and
answers people who message it about ETEA matters: roll number slips, current advertisements,
forgot password, and so on.

## What people can ask

| Menu | Feature | Source |
| --- | --- | --- |
| **1** | **Roll number slip.** Send `1 1730112345671` (or just the CNIC). The bot replies with the website's captcha picture, the person types the code, and gets the result in one reply. That's 2 bot messages in total. | etea.one/roll_no_section |
| **2** | **Current advertisements.** Lists open projects (code + last date). Replying with a code sends the advertisement picture, plus corrigendum/syllabus links. Cached 15 minutes. | etea.online |
| **3** | **Forgot password.** Send `3 1730112345671 10/07/1999` and get the password in one reply. The mobile is taken from the WhatsApp number asking. Anything missing is asked for in a single message. | etea.online/apply/login/forgot_password_by_nadra |

Privacy and safety for these features:
- The bot **doesn't solve captchas**. The person types it, like on the website.
- **Forgot password only works for your own number** by default: the mobile entered must be the WhatsApp number asking (`PASSWORD_OWN_NUMBER_ONLY`). Max 3 tries per hour per chat. This stops someone using another person's details.
- CNIC, mobile and date of birth are kept in memory only for the few minutes of the conversation and never written to logs or disk.

## How it protects the number

| Rule | Why |
| --- | --- |
| **Replies only, never messages first.** The bot has no "send to number X" feature; it only answers a message someone just sent, in that same chat. | Unsolicited messages to people who never wrote to you are the #1 ban reason. |
| **Private chats only.** Groups, status updates, broadcast lists and channels are ignored (both in the socket config and the message filter). | Bots answering in groups get reported quickly. |
| **Live messages only.** Backlog/history and anything older than 5 minutes is skipped. | Prevents a burst of replies after the bot was offline. |
| **Human pacing.** Waits, marks the message read, shows *typing…* for about as long as the reply would take to type, then sends. The main ETEA features (roll no, ads, forgot password) use a **fast** pace: reply in about 1.5–4 s total. Menu and other replies use the normal pace (about 3–11 s). | Instant robotic replies are a bot signal. |
| **One message at a time.** All replies go through a single queue with a randomised 3–6 s gap. | No parallel bursts. |
| **Rate limits.** Per chat: 4/min, 30/hour. Overall: 12/min, 300/hour, 1500/day. Over the limit, the bot stays silent. | Caps volume even if lots of people write at once. |
| **Flood mute.** A chat sending more than 10 messages a minute is ignored for 15 minutes. | Stops spam and bot-vs-bot loops. |
| **No repeated spam.** The "didn't understand" menu is sent at most once per 10 minutes per chat. Each message is answered at most once. | Identical repeated messages look automated. |
| **Quiet presence.** Doesn't mark itself online on connect, doesn't sync full history, identifies as an ordinary desktop. | Looks like a normal linked device. |
| **Persistent session.** Login is saved in `auth/`, so restarts don't need a new QR. Reconnects use exponential backoff, and it stops on logout, a replaced session or a 403. | Frequent re-linking and reconnect storms are suspicious. |

All limits are adjustable in `.env` (see `.env.example`).

### Honest note on ban risk

This uses [Baileys](https://github.com/WhiskeySockets/Baileys), an **unofficial** WhatsApp Web
library. Automating a personal or WhatsApp Business *app* number is against WhatsApp's terms, so
**some ban risk always remains**, no matter how careful the bot is. The measures above lower it a
lot, they cannot remove it. Extra tips:

- Use a number that has been active normally for a while (not a brand-new SIM).
- Keep the phone online with WhatsApp installed; don't log out of linked devices.
- Ramp up slowly: start with few users before announcing the number widely.
- Ask users to **save your number** as a contact. Being saved and messaged first is a strong "trusted" signal; being blocked or reported is the opposite.
- Never run two copies of the bot with the same `auth/` folder.

**Zero-risk alternative:** the official [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
from Meta. It needs a Meta business account and a number that is *not* on the regular WhatsApp
app, but it is fully allowed, and replies within 24 hours of a user's message are free. The handler
structure here (`src/router.js`, `src/etea/`) is independent of the connection, so it can be moved
onto the Cloud API later without rewriting the ETEA features.

## Run it

Needs **Node.js 22.13 or newer** (Node 24 LTS recommended). Works on Windows Server and Linux.

```bash
npm install
cp .env.example .env      # optional, defaults are safe   (Windows: copy .env.example .env)
npm start
```

Scan the QR in WhatsApp → **Linked devices → Link a device**. Or set `PAIRING_NUMBER` in `.env`
(e.g. `923001234567`) to get an 8-character code instead. After the first link, `npm start`
reconnects on its own.

To re-link from scratch, stop the bot and delete the `auth/` folder. **Keep `auth/` private**: it
is your WhatsApp login.

```bash
npm test   # filters, rate limits, ETEA flows and archive, with a fake WhatsApp socket
```

### Windows Server: run at boot

1. Install Node.js 24 LTS from nodejs.org, then in the bot folder: `npm install`.
2. Link once interactively: `npm start`, scan the QR, wait for `connected`, then `Ctrl+C`.
3. In an **elevated** PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\install-service.ps1
   ```
   This creates the scheduled task **ETEA-WhatsApp-Bot**: starts at boot without anyone logged in,
   restarts every minute if it stops. Logs go to `data\logs\bot.log`.
4. Remove with `scripts\windows\uninstall-service.ps1` (keeps your chats and login).

## Chat archive

Every message in your 1:1 chats is saved on the server, in `data/chats.db` (SQLite):
what people send, the bot's replies, and anything you type yourself from the phone.
Pictures, voice notes and documents people send are saved under `data/media/YYYY-MM/`
(up to 16 MB each, `SAVE_MEDIA` / `MAX_MEDIA_MB` in `.env`). Groups and status are not stored.

- **Passwords are never stored.** The forgot-password reply is saved as `••••••`.
- `npm run export` writes everything to `data/export/messages-<date>.csv` (opens in Excel, Urdu included).
- Open `chats.db` with [DB Browser for SQLite](https://sqlitebrowser.org/) to search it. Tables: `chats` (one row per person) and `messages`.
- Back up `data/` and `auth/` regularly. Both contain personal data, so keep the server locked down.

## Adding ETEA features

Each feature is one file in `src/etea/`, registered in `src/handlers/index.js`:

```js
export const rollNumber = {
  id: 'rollno',
  menu: '1',                       // number shown in the main menu
  speed: 'fast',                   // optional: quicker pacing from config.fast
  title: 'Roll number slip',
  match: /\broll\s*(no|number)?\b/i, // optional keywords
  async handle(ctx) {              // first reply
    ctx.expect('rollno');          // wait for the user's next message
    return 'Please send your CNIC number (without dashes).';
  },
  async onInput(ctx) {             // the user's answer
    ctx.clear();
    const result = await lookup(ctx.text); // your data source
    return result ? `Your roll number is ${result}` : 'No record found.';
  },
};
```

Users can send `0` or `menu` at any point to leave a flow. Unanswered flows expire after 15 minutes.

## Layout

```
src/index.js        connection, QR/pairing, reconnects
src/bot.js          pipeline: filter → flood check → route → rate limit → paced send
src/guard.js        which incoming messages may be answered
src/rateLimiter.js  sliding-window limits and flood mute
src/humanize.js     delays, typing time, serial send queue
src/router.js       picks a handler, multi-step flows
src/handlers/       menu and fallback
src/etea/           ETEA features and the website clients (*Service.js)
src/store.js        SQLite chat archive
src/archive.js      what gets archived, password masking, media saving
scripts/windows/    run-at-boot task for Windows Server
```
