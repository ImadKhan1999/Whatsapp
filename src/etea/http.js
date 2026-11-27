// Tiny HTTP helpers for the ETEA sites: timeouts, a per-session cookie jar, HTML-to-text.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export class CookieJar {
  constructor() { this.cookies = new Map(); }
  store(res) {
    const list = res.headers.getSetCookie?.() || [];
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
}

export async function request(url, { method = 'GET', body, headers = {}, jar, timeoutMs = 20000 } = {}) {
  const h = { 'User-Agent': UA, Accept: '*/*', ...headers };
  if (jar?.cookies.size) h.Cookie = jar.header();
  const res = await fetch(url, { method, body, headers: h, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  jar?.store(res);
  return res;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});

export function htmlToText(html) {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h\d|table|section)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '  ')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Find a CNIC anywhere in a message ("1 17301-1234567-1", "roll no 1730112345671"). */
export function findCnic(text) {
  const m = String(text).match(/(?<!\d)(\d{5})[\s-]?(\d{7})[\s-]?(\d)(?!\d)/);
  return m ? m[1] + m[2] + m[3] : null;
}

/** Normalise a CNIC typed as 17301-6498488-1 or with spaces. Returns 13 digits or null. */
export function parseCnic(text) {
  const d = String(text).replace(/[\s-]/g, '');
  return /^\d{13}$/.test(d) ? d : null;
}
