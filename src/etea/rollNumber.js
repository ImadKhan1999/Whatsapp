// ETEA: roll number slip lookup on https://etea.one/roll_no_section/.
// Flow: CNIC -> bot sends the site's captcha picture -> person types it -> result.
import { parseCnic } from './http.js';
import { newCaptcha, search, ROLLNO_BASE } from './rollNoService.js';

const MAX_CAPTCHA_TRIES = 3;
const down = `Sorry, the ETEA roll number website isn't responding right now. Please try again later or visit ${ROLLNO_BASE}`;

async function askCaptcha(ctx, cnic, tries, intro) {
  const { jar, image } = await newCaptcha();
  ctx.expect('rollno', { step: 'captcha', cnic, jar, tries });
  return { image, text: `${intro}\n\nType the *code shown in this picture* (it's the website's security check).` };
}

export const rollNumber = {
  id: 'rollno',
  menu: '1',
  speed: 'fast',
  title: 'Roll number slip',
  match: /\broll\s*(no|number|slip)?\b|\bslip\b/i,

  handle(ctx) {
    ctx.expect('rollno', { step: 'cnic' });
    return 'Please send your *CNIC number* (13 digits, without dashes).\n\nSend *0* to cancel.';
  },

  async onInput(ctx) {
    const s = ctx.chat.data;
    if (s.step === 'cnic') {
      const cnic = parseCnic(ctx.text);
      if (!cnic) return 'That doesn\'t look like a CNIC. Please send the 13 digits, for example 1730112345671. Send *0* to cancel.';
      try { return await askCaptcha(ctx, cnic, 0, 'Thanks.'); } catch { ctx.clear(); return down; }
    }

    if (s.step === 'captcha') {
      const code = ctx.text.trim();
      if (!/^[a-z0-9]{3,6}$/i.test(code)) return 'Please type only the code from the picture, or *0* to cancel.';
      let r;
      try { r = await search(s.jar, s.cnic, code); } catch { ctx.clear(); return down; }

      if (r.kind === 'bad-captcha') {
        if (s.tries + 1 >= MAX_CAPTCHA_TRIES) { ctx.clear(); return `That code didn't match ${MAX_CAPTCHA_TRIES} times. Send *1* to start again.`; }
        try { return await askCaptcha(ctx, s.cnic, s.tries + 1, 'That code didn\'t match. Here is a new one.'); } catch { ctx.clear(); return down; }
      }
      ctx.clear();
      if (r.kind === 'pdf') return { document: r.pdf, fileName: `roll-no-slip-${s.cnic}.pdf`, mimetype: 'application/pdf', text: 'Here is your roll number slip. Send *0* for the menu.' };
      if (r.kind === 'none') return `No roll number slip was found for CNIC ${s.cnic} yet. Slips are usually issued a few days before the test.\n\nSend *1* to search again, or *0* for the menu.`;
      const links = (r.links || []).map((l) => `• ${l.label || 'Download'}: ${l.url}`).join('\n');
      return `${r.kind === 'found' ? '🎫 *Roll number slip*\n\n' : ''}${r.message}${links ? `\n\n${links}` : ''}\n\nSend *1* to search another CNIC, or *0* for the menu.`;
    }
    ctx.clear();
    return undefined;
  },
};
