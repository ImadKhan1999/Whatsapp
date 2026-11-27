# ETEA WhatsApp Bot

A WhatsApp bot that runs on **your own number** (linked as a device, like WhatsApp Web) and
answers people who message it about ETEA matters: roll number slips, current advertisements,
forgot password, and so on.

Phase 1 (this code) is the safe reply engine. The ETEA features are placeholders that
reply "coming soon" until real information and sources are plugged in.

## How it protects the number

| Rule | Why |
| --- | --- |
| **Replies only, never messages first.** The bot has no "send to number X" feature; it only answers a message someone just sent, in that same chat. | Unsolicited messages to people who never wrote to you are the #1 ban reason. |
| **Private chats only.** Groups, status updates, broadcast lists and channels are ignored (both in the socket config and the message filter). | Bots answering in groups get reported quickly. |
| **Live messages only.** Backlog/history and anything older than 5 minutes is skipped. | Prevents a burst of replies after the bot was offline. |
| **Human pacing.** Waits 1.5–4 s, marks the message read, shows *typing…* for about as long as the reply would take to type (1.5–7 s), then sends. | Instant robotic replies are a bot signal. |
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

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # optional, defaults are safe
npm start
```

Scan the QR in WhatsApp → **Linked devices → Link a device**. Or set `PAIRING_NUMBER` in `.env`
(e.g. `923001234567`) to get an 8-character code instead. After the first link, `npm start`
reconnects on its own. Keep it running with something like `pm2 start src/index.js --name etea-bot`.

To re-link from scratch, stop the bot and delete the `auth/` folder. **Keep `auth/` private**: it
is your WhatsApp login.

```bash
npm test   # filters, rate limits and reply pipeline, with a fake WhatsApp socket
```

## Adding ETEA features

Each feature is one file in `src/etea/`, registered in `src/handlers/index.js`:

```js
export const rollNumber = {
  id: 'rollno',
  menu: '1',                       // number shown in the main menu
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
src/etea/           ETEA features (placeholders for now)
```
