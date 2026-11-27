// ETEA: forgot password via NADRA details (CNIC + mobile + date of birth).
// The ETEA website shows the password on screen when all three match; the bot does the same.
//
// Kept to as few messages as possible: everything can come in one message, e.g.
//   "3 1730112345671 10/07/1999"   (mobile = the WhatsApp number asking)
// and the bot only asks again for what's missing.
import { findCnic } from './http.js';
import { parseDob, parseMobile, recoverPassword, FORGOT_PAGE } from './passwordService.js';
import { config } from '../config.js';

const attempts = new Map(); // jid -> timestamps of lookups (brute-force guard)
const HOUR = 3600_000;

function allowAttempt(jid, max) {
  const now = Date.now();
  const list = (attempts.get(jid) || []).filter((t) => now - t < HOUR);
  if (list.length >= max) { attempts.set(jid, list); return false; }
  list.push(now);
  attempts.set(jid, list);
  return true;
}

const MOBILE_RE = /(?<!\d)(?:\+?92[\s-]?|0)3\d{2}[\s-]?\d{7}(?!\d)/;

/** Pull CNIC, mobile and date of birth out of one free-form message. Exported for tests. */
export function extractDetails(text) {
  let rest = ` ${text} `;
  const cnic = findCnic(rest);
  if (cnic) rest = rest.replace(/(?<!\d)\d{5}[\s-]?\d{7}[\s-]?\d(?!\d)/, ' ');
  const mm = rest.match(MOBILE_RE);
  const mobile = mm ? parseMobile(mm[0]) : null;
  if (mm) rest = rest.replace(mm[0], ' ');
  rest = rest.replace(/^\s*3(?=\s)/, ' ') // the menu number
    .replace(/\b(forgot|forget|reset|my|password|pass|cnic|mobile|phone|dob|date of birth|birth|date)\b[:\s]*/gi, ' ')
    .trim();
  return { cnic, mobile, dob: rest ? parseDob(rest) : null };
}

function missingText(d, ownOnly) {
  const need = [];
  if (!d.cnic) need.push('*CNIC* (13 digits)');
  if (!d.mobile) need.push(ownOnly ? '*mobile number* registered with ETEA (must be this WhatsApp number)' : '*mobile number* registered with ETEA');
  if (!d.dob) need.push('*date of birth* as on CNIC (e.g. 10/07/1999)');
  return need;
}

async function run(ctx, d) {
  ctx.clear();
  if (!allowAttempt(ctx.jid, config.etea.passwordAttemptsPerHour)) return 'Too many attempts. Please try again in an hour.';
  try {
    const r = await recoverPassword(d);
    if (!r.ok) return `❌ ${r.message}\nSend *3* with your details to try again.`;
    const text = `✅ Your ETEA password is: *${r.password}*\nLog in at https://etea.online/apply/login/ and please delete this message afterwards.`;
    return { text, logText: text.replace(r.password, '••••••') }; // never store the password
  } catch {
    return `Sorry, the ETEA website isn't responding right now. Please try again later or use ${FORGOT_PAGE}`;
  }
}

async function progress(ctx, prev) {
  const ownOnly = config.etea.passwordOwnNumberOnly;
  const found = extractDetails(ctx.text);
  const d = { cnic: found.cnic || prev.cnic || null, mobile: found.mobile || prev.mobile || null, dob: found.dob || prev.dob || null };
  const own = ctx.phone ? parseMobile(ctx.phone) : null;
  if (ownOnly && own) {
    if (d.mobile && d.mobile !== own) {
      ctx.clear();
      return `For safety, I can only recover the password for the WhatsApp number you are messaging from. Please message from ${d.mobile}, or use ${FORGOT_PAGE}`;
    }
    d.mobile = own; // no need to ask: it's the number they're writing from
  }
  if (d.cnic && d.mobile && d.dob) return run(ctx, d);
  ctx.expect('forgot', d);
  const need = missingText(d, ownOnly);
  return prev.asked
    ? `I still need your ${need.join(' and ')}. Send *0* to cancel.`
    : `🔑 *Forgot ETEA password*\nSend your ${need.join(' and ')} in one message, e.g. *1730112345671 10/07/1999*`;
}

export const forgotPassword = {
  id: 'forgot',
  menu: '3',
  speed: 'fast',
  title: 'Forgot password',
  match: /\b(forgot|forget|reset)\b.*\bpass(word)?\b|\bpassword\b/i,

  async handle(ctx) {
    const reply = await progress(ctx, {});
    if (ctx.chat.expecting === 'forgot') ctx.chat.data.asked = true;
    return reply;
  },

  async onInput(ctx) {
    const reply = await progress(ctx, ctx.chat.data);
    if (ctx.chat.expecting === 'forgot') ctx.chat.data.asked = true;
    return reply;
  },
};
