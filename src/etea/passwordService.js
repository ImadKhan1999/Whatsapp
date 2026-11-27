// "Forgot password (NADRA)" on https://etea.online/apply/login/forgot_password_by_nadra.
// The site itself shows the password on screen when CNIC, mobile and date of birth match.
import { request, htmlToText } from './http.js';

export const FORGOT_URL = 'https://etea.online/apply/login/forgot_password_cnic_mobile_dob';
export const FORGOT_PAGE = 'https://etea.online/apply/login/forgot_password_by_nadra';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Accepts 10/07/1999, 10-7-1999, 1999-07-10, 10 July 1999, July 10 1999. Returns YYYY-MM-DD or null. */
export function parseDob(text) {
  const t = String(text).trim().toLowerCase().replace(/,/g, ' ').replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, y, m, d] = x;
  else if ((x = t.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/))) [, d, m, y] = x;
  else if ((x = t.match(/^(\d{1,2})\s*([a-z]+)\s*(\d{4})$/))) { d = x[1]; m = MONTHS.indexOf(x[2].slice(0, 3)) + 1; y = x[3]; }
  else if ((x = t.match(/^([a-z]+)\s*(\d{1,2})\s+(\d{4})$/))) { m = MONTHS.indexOf(x[1].slice(0, 3)) + 1; d = x[2]; y = x[3]; }
  else return null;
  [y, m, d] = [Number(y), Number(m), Number(d)];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1940 || y > new Date().getFullYear()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 03xx-xxxxxxx, +923xx..., 923xx... -> 03xxxxxxxxx (11 digits) or null. */
export function parseMobile(text) {
  let d = String(text).replace(/[^\d]/g, '');
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('3')) d = '0' + d;
  return /^03\d{9}$/.test(d) ? d : null;
}

/** @returns {Promise<{ ok: true, password: string } | { ok: false, message: string }>} */
export async function recoverPassword({ cnic, mobile, dob }) {
  const form = new FormData();
  form.append('cnic', cnic);
  form.append('mobile', mobile);
  form.append('dob', dob);
  const res = await request(FORGOT_URL, { method: 'POST', body: form, headers: { Referer: FORGOT_PAGE, 'X-Requested-With': 'XMLHttpRequest' } });
  if (!res.ok) throw new Error(`forgot password ${res.status}`);
  const data = JSON.parse(await res.text());
  if (data.error) {
    const msg = typeof data.msg === 'object' ? Object.values(data.msg).map(htmlToText).join('\n') : htmlToText(String(data.msg));
    return { ok: false, message: msg || 'The details were not accepted.' };
  }
  if (data.forgot_error) return { ok: false, message: htmlToText(String(data.msg)) };
  return { ok: true, password: htmlToText(String(data.msg)) };
}
