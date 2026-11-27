// Register handlers here. Order matters for keyword matches: first match wins.
// To add an ETEA feature, create a file in src/etea/ and add it to this list.
import { menu, menuText } from './menu.js';
import { rollNumber } from '../etea/rollNumber.js';
import { advertisements } from '../etea/advertisements.js';
import { forgotPassword } from '../etea/forgotPassword.js';

export const handlers = [rollNumber, advertisements, forgotPassword, menu];

// Unknown text: show the menu, but at most once per cooldown per chat so the bot never
// spams the same message at someone (repetitive identical messages are a ban signal).
export function makeFallback(cooldownMinutes) {
  const lastShown = new Map();
  return (ctx) => {
    const now = Date.now();
    const last = lastShown.get(ctx.jid) || 0;
    if (now - last < cooldownMinutes * 60_000) return null;
    lastShown.set(ctx.jid, now);
    if (lastShown.size > 5000) for (const [k, v] of lastShown) if (now - v > cooldownMinutes * 60_000) lastShown.delete(k);
    return `Sorry, I didn't understand that.\n\n${menuText(ctx.handlers)}`;
  };
}
