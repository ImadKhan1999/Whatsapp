// ETEA: roll number slip lookup on https://etea.one/roll_no_section/.
// Flow, kept to 2 bot messages: person sends CNIC (can be "1 1730112345671" or just the
// CNIC) -> bot sends the site's captcha picture with the instructions as its caption ->
// person types the code -> bot sends the result in one reply.
import { parseCnic, findCnic } from './http.js';
import { newCaptcha, search, ROLLNO_BASE } from './rollNoService.js';
import { solveCaptcha } from './captchaSolver.js';

const MAX_CAPTCHA_TRIES = 3;
const down = `Sorry, the ETEA roll number website isn't responding right now. Please try again later or visit ${ROLLNO_BASE}`;

async function askCaptcha(ctx, cnic, tries, intro = '') {
  // If a solver is plugged in (captchaSolver.js), try it first: result comes in one reply.
  if (tries === 0) {
    const auto = await newCaptcha();
    const code = await solveCaptcha(auto.image).catch(() => null);
    if (code) {
      const r = await search(auto.jar, cnic, code);
      if (r.kind !== 'bad-captcha') { ctx.clear(); return formatResult(r, cnic); }
    }
  }
  const { jar, image } = await newCaptcha();
  ctx.expect('rollno', { step: 'captcha', cnic, jar, tries });
  return { image, text: `${intro}Type the code in this picture to search CNIC ${cnic}.` };
}

export const rollNumber = {
  id: 'rollno',
  menu: '1',
  speed: 'fast',
  title: 'Roll number slip',
  // Also triggered by a message that is only a CNIC.
  match: /\broll\s*(no|number|slip)?\b|\bslip\b|^\s*\d{5}[\s-]?\d{7}[\s-]?\d\s*$/i,

  async handle(ctx) {
    const cnic = findCnic(ctx.text);
    if (cnic) { try { return await askCaptcha(ctx, cnic, 0); } catch { ctx.clear(); return down; } }
    ctx.expect('rollno', { step: 'cnic' });
    return 'Send your *CNIC number* (13 digits).\nTip: next time send it with the option, e.g. *1 1730112345671*';
  },

  async onInput(ctx) {
    const s = ctx.chat.data;
    if (s.step === 'cnic') {
      const cnic = parseCnic(ctx.text) || findCnic(ctx.text);
      if (!cnic) return 'That doesn\'t look like a CNIC. Please send the 13 digits, for example 1730112345671. Send *0* to cancel.';
      try { return await askCaptcha(ctx, cnic, 0); } catch { ctx.clear(); return down; }
    }

    if (s.step === 'captcha') {
      const code = ctx.text.trim();
      if (!/^[a-z0-9]{3,6}$/i.test(code)) return 'Please type only the code from the picture, or *0* to cancel.';
      let r;
      try { r = await search(s.jar, s.cnic, code); } catch { ctx.clear(); return down; }

      if (r.kind === 'bad-captcha') {
        if (s.tries + 1 >= MAX_CAPTCHA_TRIES) { ctx.clear(); return `That code didn't match ${MAX_CAPTCHA_TRIES} times. Send *1* to start again.`; }
        try { return await askCaptcha(ctx, s.cnic, s.tries + 1, 'Wrong code. '); } catch { ctx.clear(); return down; }
      }
      ctx.clear();
      return formatResult(r, s.cnic);
    }
    ctx.clear();
    return undefined;
  },
};

function formatResult(r, cnic) {
  if (r.kind === 'pdf') return { document: r.pdf, fileName: `roll-no-slip-${cnic}.pdf`, mimetype: 'application/pdf', text: 'Here is your roll number slip. Send *0* for the menu.' };
  if (r.kind === 'none') return `No roll number slip was found for CNIC ${cnic} yet. Slips are usually issued a few days before the test.\n\nSend *1* to search again, or *0* for the menu.`;
  const links = (r.links || []).map((l) => `• ${l.label || 'Download'}: ${l.url}`).join('\n');
  return `${r.kind === 'found' ? '🎫 *Roll number slip*\n\n' : ''}${r.message}${links ? `\n\n${links}` : ''}\n\nSend *1* to search another CNIC, or *0* for the menu.`;
}
