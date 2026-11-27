import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAds, openOnly } from '../src/etea/adsService.js';
import { parseResult } from '../src/etea/rollNoService.js';
import { parseDob, parseMobile } from '../src/etea/passwordService.js';
import { parseCnic } from '../src/etea/http.js';
import { Router } from '../src/router.js';
import { extractDetails } from '../src/etea/forgotPassword.js';
import { handlers } from '../src/handlers/index.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Replace fetch with a fake that answers by URL. Records requests. */
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    for (const [re, fn] of routes) if (re.test(String(url))) return fn(opts);
    throw new Error(`unexpected fetch ${url}`);
  };
  return calls;
}
const html = (body, headers = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } });
const png = () => new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png' } });

test('parse inputs: CNIC, mobile, date of birth', () => {
  assert.equal(parseCnic('17301-1234567-1'), '1730112345671');
  assert.equal(parseCnic('12345'), null);
  assert.equal(parseMobile('0300-1234567'), '03001234567');
  assert.equal(parseMobile('+92 300 1234567'), '03001234567');
  assert.equal(parseMobile('12345'), null);
  for (const d of ['10 july 1999', '10/07/1999', '10-7-1999', '1999-07-10', 'July 10, 1999', '10th Jul 1999'])
    assert.equal(parseDob(d), '1999-07-10', d);
  assert.equal(parseDob('31/02/1999'), null);
  assert.equal(parseDob('hello'), null);
});

test('ads: parses only the latest table, with links and deadlines', () => {
  const items = parseAds(fx('ads.html'));
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.code), ['904', '894', '700']);
  assert.equal(items[0].lastDate, '10-December-2026');
  assert.equal(items[1].notices[1].label, 'Corrigendum');
  assert.equal(items[1].syllabus[0].url, 'https://etea.online/advertisement/course_content/894_x.png');
  assert.equal(items[2].title, 'Old Project & Co - 2025');
  assert.deepEqual(openOnly(items, Date.UTC(2026, 10, 27)).map((i) => i.code), ['904', '894']);
});

test('roll no: recognises a wrong captcha', () => {
  assert.equal(parseResult(fx('rollno-bad-captcha.html')).kind, 'bad-captcha');
  const r = parseResult('<h2>Roll Number Slip Search</h2><div class="alert alert-info">No record found against this CNIC</div><h4>ETEA Contact Info</h4>');
  assert.equal(r.kind, 'message');
  assert.match(r.message, /No record found/);
  // Plain search page (commented-out notices, no result) -> nothing found
  assert.equal(parseResult('<h2>Roll Number Slip Search</h2><!-- <p>old notice</p> --><p>Some notice</p><form></form>').kind, 'none');
  const f = parseResult('<table><tr><th>Roll No</th><td>123456</td></tr></table><a href="/slip/print/1">Print Slip</a>');
  assert.equal(f.kind, 'found');
  assert.match(f.message, /123456/);
  assert.equal(f.links[0].label, 'Print Slip');
});

const flow = () => {
  const router = new Router(handlers);
  return (text, phone = '923001234567') => router.route('u@s.whatsapp.net', text, { phone }).then((r) => r?.reply);
};

test('ads flow: list, then code returns the advertisement picture', async () => {
  mockFetch([[/etea\.online\/$/, () => html(fx('ads.html'))], [/904_pic_2026\.jpeg$/, png]]);
  const say = flow();
  const list = await say('2');
  assert.match(list, /Open ETEA advertisements/);
  assert.match(list, /904/);
  assert.doesNotMatch(list, /\b700\b/); // expired
  const ad = await say('904');
  assert.ok(Buffer.isBuffer(ad.image));
  assert.match(ad.text, /Peshawar Institute of Cardiology/);
});

test('roll no flow: CNIC -> captcha picture -> retry on wrong code -> result', async () => {
  let attempt = 0;
  const calls = mockFetch([
    [/roll_no_section\/$/, () => html('<html></html>', { 'set-cookie': 'ci_session=abc; path=/; HttpOnly' })],
    [/captcha_route/, png],
    [/check_cnic/, () => html(++attempt === 1 ? fx('rollno-bad-captcha.html')
      : '<h2>Roll Number Slip Search</h2><div class="alert alert-warning">No Roll Number Slip found for this CNIC.</div><h4>ETEA Contact Info</h4>')],
  ]);
  const say = flow();
  assert.match(await say('roll no'), /CNIC/);
  assert.match(await say('123'), /doesn't look like a CNIC/);
  const c1 = await say('17301-1234567-1');
  assert.ok(Buffer.isBuffer(c1.image));
  const c2 = await say('1234');
  assert.ok(Buffer.isBuffer(c2.image));
  assert.match(c2.text, /Wrong code/);
  const res = await say('5678');
  assert.match(res, /No Roll Number Slip found/);
  const post = calls.filter((c) => /check_cnic/.test(c.url)).at(-1);
  assert.equal(String(post.opts.body), 'cnic=1730112345671&captcha=5678');
  assert.match(post.opts.headers.Cookie, /ci_session=abc/);
});

test('forgot password: details pulled from one message in any order', () => {
  assert.deepEqual(extractDetails('3 1730112345671 03001234567 10/07/1999'), { cnic: '1730112345671', mobile: '03001234567', dob: '1999-07-10' });
  assert.deepEqual(extractDetails('dob 10 July 1999 cnic 17301-1234567-1'), { cnic: '1730112345671', mobile: null, dob: '1999-07-10' });
  assert.deepEqual(extractDetails('forgot password'), { cnic: null, mobile: null, dob: null });
});

test('forgot password: one message in, one reply out (mobile taken from WhatsApp number)', async () => {
  const calls = mockFetch([[/forgot_password_cnic_mobile_dob/, () => html('{"error":false,"forgot_error":false,"msg":"abcd.1234"}')]]);
  const say = flow();
  const ok = await say('3 1730112345671 10 July 1999');
  assert.match(ok.text, /abcd\.1234/);
  assert.doesNotMatch(ok.logText, /abcd\.1234/);
  const body = calls[0].opts.body;
  assert.equal(body.get('cnic'), '1730112345671');
  assert.equal(body.get('mobile'), '03001234567');
  assert.equal(body.get('dob'), '1999-07-10');
});

test('forgot password: asks only for what is missing, in one message', async () => {
  mockFetch([[/forgot_password_cnic_mobile_dob/, () => html('{"error":false,"forgot_error":false,"msg":"abcd.1234"}')]]);
  const say = flow();
  const ask = await say('3');
  assert.match(ask, /CNIC/);
  assert.match(ask, /date of birth/);
  assert.doesNotMatch(ask, /mobile/); // known from the WhatsApp number
  assert.match(await say('1730112345671'), /still need your \*date of birth/);
  assert.match((await say('10/07/1999')).text, /abcd\.1234/);
});

test('forgot password: refuses a mobile that is not the asking WhatsApp number', async () => {
  mockFetch([]);
  const say = flow();
  assert.match(await say('3 1730112345671 03009999999 10/07/1999', '923001111111'), /only recover the password for the WhatsApp number/);
});

test('forgot password: shows the site error when details do not match', async () => {
  mockFetch([[/forgot_password/, () => html('{"error":false,"forgot_error":true,"msg":"Sorry, CNIC, Date of Birth (NADRA), and Mobile do not match our records."}')]]);
  const say = flow();
  assert.match(await say('3 1730112345671 01/01/2000'), /do not match our records/);
});

test('roll no: CNIC with the menu choice goes straight to the captcha picture', async () => {
  mockFetch([
    [/roll_no_section\/$/, () => html('<html></html>', { 'set-cookie': 'ci_session=abc; path=/' })],
    [/captcha_route/, png],
  ]);
  for (const text of ['1 1730112345671', '17301-1234567-1', 'roll no 1730112345671']) {
    const r = await flow()(text);
    assert.ok(Buffer.isBuffer(r.image), text);
    assert.match(r.text, /1730112345671/);
  }
});
