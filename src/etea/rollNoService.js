// Roll number slip search on https://etea.one/roll_no_section/.
// The site has a captcha. The bot does not solve it: it sends the captcha picture to the
// person on WhatsApp and they type the digits, exactly as they would on the website.
import { request, CookieJar, htmlToText, decode } from './http.js';

export const ROLLNO_BASE = 'https://etea.one/roll_no_section/';

/** Start a fresh search session and get a captcha image for it. */
export async function newCaptcha(jar = new CookieJar()) {
  if (!jar.cookies.size) await request(ROLLNO_BASE, { jar });
  const res = await request(`${ROLLNO_BASE}captcha_route?${Math.random()}`, { jar });
  if (!res.ok) throw new Error(`captcha ${res.status}`);
  return { jar, image: Buffer.from(await res.arrayBuffer()) };
}

/** Interpret the search result page. Exported for tests.
 * kinds: bad-captcha | found (table or slip links) | message (site alert) | none */
export function parseResult(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const alerts = [...clean.matchAll(/<div[^>]*class="[^"]*\balert\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((m) => htmlToText(m[1])).filter(Boolean);
  if (alerts.some((a) => /captcha/i.test(a))) return { kind: 'bad-captcha', message: alerts.join('\n') };

  const links = [...clean.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((a) => ({ url: decode(a[1]), label: htmlToText(a[2]) }))
    .filter((l) => /slip|print|download|\.pdf/i.test(l.url + ' ' + l.label));
  const tables = [...clean.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => htmlToText(m[0])).filter(Boolean);

  if (tables.length || links.length) {
    return { kind: 'found', message: [...alerts, ...tables].join('\n\n').slice(0, 1500), links };
  }
  if (alerts.length) return { kind: 'message', message: alerts.join('\n') };
  return { kind: 'none', message: '' };
}

export async function search(jar, cnic, captcha) {
  const body = new URLSearchParams({ cnic, captcha });
  const res = await request(`${ROLLNO_BASE}search/check_cnic`, {
    method: 'POST', body, jar,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: ROLLNO_BASE },
  });
  const type = res.headers.get('content-type') || '';
  if (/pdf/i.test(type)) return { kind: 'pdf', pdf: Buffer.from(await res.arrayBuffer()) };
  return parseResult(await res.text());
}
