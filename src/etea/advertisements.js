// ETEA: currently open advertisements from https://etea.online/.
// Step 1: list open projects. Step 2: the person replies with a project code and gets the
// advertisement picture plus links to any corrigendum / syllabus.
import { getAds, openOnly, downloadImage, ADS_URL } from './adsService.js';

const fmt = (i, n) => `*${n}.* ${i.title}\n     Code *${i.code}* · last date ${i.lastDate}`;

export const advertisements = {
  id: 'ads',
  menu: '2',
  speed: 'fast',
  title: 'Current advertisements',
  match: /\b(ads?|advertisements?|jobs?|posts?|projects?)\b/i,

  async handle(ctx) {
    let items;
    try { items = openOnly(await getAds()); }
    catch { return `Sorry, I couldn't load the ETEA website right now. Please check ${ADS_URL} or try again in a few minutes.`; }
    if (!items.length) return `There are no open ETEA advertisements right now.\nCheck ${ADS_URL} for updates.`;
    ctx.expect('ads');
    return `📢 *Open ETEA advertisements* (${items.length})\n\n${items.map((i, k) => fmt(i, k + 1)).join('\n\n')}\n\nReply with a *project code* (e.g. ${items[0].code}) to get its advertisement.\nApply at https://etea.online/apply/\nSend *0* for the menu.`;
  },

  async onInput(ctx) {
    const code = ctx.text.trim().match(/^#?(\d{2,5})$/)?.[1];
    if (!code) { ctx.clear(); return undefined; } // not a code: let the normal menu handle it
    let items;
    try { items = await getAds(); } catch { return `Sorry, I couldn't load the ETEA website right now. Please try again shortly.`; }
    const ad = items.find((i) => i.code === code);
    if (!ad) return `I couldn't find project code *${code}*. Please send one of the codes from the list, or *0* for the menu.`;

    const extra = [...ad.notices.slice(1), ...ad.syllabus].map((l) => `• ${l.label}: ${l.url}`).join('\n');
    const caption = `*${ad.title}*\nCode ${ad.code} · last date ${ad.lastDate}${extra ? `\n\n${extra}` : ''}\n\nApply: https://etea.online/apply/\nSend another code, or *0* for the menu.`;
    const main = ad.notices[0];
    if (main && /\.(jpe?g|png|webp)$/i.test(main.url)) {
      try {
        const { buf } = await downloadImage(main.url);
        return { image: buf, text: caption };
      } catch { /* fall back to the link */ }
    }
    return main ? `${caption}\n\nAdvertisement: ${main.url}` : caption;
  },
};
