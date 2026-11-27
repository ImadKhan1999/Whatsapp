// Reads the "Latest Projects" table from https://etea.online/ and caches it.
import { request, decode } from './http.js';

export const ADS_URL = 'https://etea.online/';
const CACHE_MS = 15 * 60_000;
let cache = { at: 0, items: null };

/** Parse the latest-projects table. Exported for tests. */
export function parseAds(html) {
  const start = html.indexOf('id="latest"');
  const section = start >= 0 ? html.slice(start) : html;
  const end = section.search(/<\/table>/i);
  const table = end >= 0 ? section.slice(0, end) : section;
  const items = [];
  for (const m of table.matchAll(/<tr[^>]*data-title="([^"]*)"[^>]*data-code="([^"]*)"[^>]*data-timestamp="(\d*)"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const [, title, code, ts, row] = m;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    const lastDate = decode((cells[3] || '').replace(/<[^>]+>/g, '').trim());
    const links = (html) => [...(html || '').matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((a) => ({ url: decode(a[1]), label: decode(a[2].replace(/<[^>]+>/g, '').trim()) }));
    items.push({
      title: decode(title).trim(),
      code: code.trim(),
      lastDate,
      deadline: ts ? Number(ts) * 1000 : null,
      notices: links(cells[4]),
      syllabus: links(cells[5]),
    });
  }
  return items;
}

export async function getAds({ force = false } = {}) {
  if (!force && cache.items && Date.now() - cache.at < CACHE_MS) return cache.items;
  const res = await request(ADS_URL);
  if (!res.ok) throw new Error(`ETEA ads page returned ${res.status}`);
  const items = parseAds(await res.text());
  if (!items.length) throw new Error('No advertisements found on page (layout may have changed)');
  cache = { at: Date.now(), items };
  return items;
}

/** Only projects whose last date hasn't passed (end of that day, Pakistan time). */
export function openOnly(items, now = Date.now()) {
  return items.filter((i) => !i.deadline || i.deadline + 24 * 3600_000 > now);
}

export async function downloadImage(url) {
  const res = await request(url, { timeoutMs: 30000 });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, type };
}
