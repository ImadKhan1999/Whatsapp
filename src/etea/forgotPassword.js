// ETEA: forgot password via NADRA details (CNIC + mobile + date of birth).
// The ETEA website shows the password on screen when all three match; the bot does the same.
import { parseCnic } from './http.js';
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

export const forgotPassword = {
  id: 'forgot',
  menu: '3',
  speed: 'fast',
  title: 'Forgot password',
  match: /\b(forgot|forget|reset)\b.*\bpass(word)?\b|\bpassword\b/i,

  handle(ctx) {
    ctx.expect('forgot', { step: 'cnic' });
    return '🔑 *Forgot ETEA password*\nI need 3 details as registered with ETEA/NADRA.\n\n1️⃣ Send your *CNIC number* (13 digits, without dashes).\n\nSend *0* to cancel.';
  },

  async onInput(ctx) {
    const s = ctx.chat.data;
    if (s.step === 'cnic') {
      const cnic = parseCnic(ctx.text);
      if (!cnic) return 'That doesn\'t look like a CNIC. Please send the 13 digits, e.g. 1730112345671.';
      ctx.expect('forgot', { step: 'mobile', cnic });
      return '2️⃣ Send the *mobile number* registered on your ETEA account (e.g. 03001234567).';
    }
    if (s.step === 'mobile') {
      const mobile = parseMobile(ctx.text);
      if (!mobile) return 'Please send an 11-digit mobile number starting with 03, e.g. 03001234567.';
      if (config.etea.passwordOwnNumberOnly && ctx.phone && parseMobile(ctx.phone) !== mobile) {
        ctx.clear();
        return `For safety, I can only recover the password for the WhatsApp number you are messaging from. Please message from ${mobile}, or use ${FORGOT_PAGE}`;
      }
      ctx.expect('forgot', { step: 'dob', cnic: s.cnic, mobile });
      return '3️⃣ Send your *date of birth* as on your CNIC (e.g. 10/07/1999 or 10 July 1999).';
    }
    if (s.step === 'dob') {
      const dob = parseDob(ctx.text);
      if (!dob) return 'I couldn\'t read that date. Please send it like 10/07/1999 (day/month/year).';
      ctx.clear();
      if (!allowAttempt(ctx.jid, config.etea.passwordAttemptsPerHour)) return 'Too many attempts. Please try again in an hour.';
      try {
        const r = await recoverPassword({ cnic: s.cnic, mobile: s.mobile, dob });
        if (!r.ok) return `❌ ${r.message}\n\nSend *3* to try again, or *0* for the menu.`;
        return `✅ Your ETEA password is:\n\n*${r.password}*\n\nLog in at https://etea.online/apply/login/\nPlease delete this message after you've noted it.`;
      } catch {
        return `Sorry, the ETEA website isn't responding right now. Please try again later or use ${FORGOT_PAGE}`;
      }
    }
    ctx.clear();
    return undefined;
  },
};
