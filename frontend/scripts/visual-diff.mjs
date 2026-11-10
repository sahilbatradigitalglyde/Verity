/**
 * Visual parity check: drives the original prototype and the React app through the same
 * clicks at 1440px, screenshots each screen, and pixel-diffs them.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/visual-diff.mjs ../docs/reference/verity-prototype.html http://localhost:4173
 *
 * Output: visual/out/<screen>-{proto,app,diff}.png and a summary table.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [protoPath, appUrl = 'http://localhost:4173'] = process.argv.slice(2);
if (!protoPath) { console.error('usage: node scripts/visual-diff.mjs <prototype.html> [appUrl]'); process.exit(1); }
const out = path.resolve('visual/out');
fs.mkdirSync(out, { recursive: true });

// Toasts and the walkthrough pill are timing-dependent; hide them so screens compare cleanly.
const HIDE = '#toast,.guide-min,.guide{display:none!important} *{caret-color:transparent!important}';

async function drive(page, snap) {
  const wait = ms => page.waitForTimeout(ms);
  await snap('01-signin');
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click(); await wait(1300);
  await snap('02-apps');
  await page.locator('.appcard').first().click(); await wait(300);
  await snap('03-app-cycles');
  await page.getByRole('link', { name: 'Regression Suite' }).click(); await wait(300);
  await snap('04-regression');
  await page.getByRole('link', { name: 'Test Cycles' }).click(); await wait(200);
  await page.getByRole('link', { name: 'New test cycle' }).click(); await wait(300);
  await snap('05-new-cycle');
  await page.getByRole('button', { name: 'Generate Test Cases with AI' }).click(); await wait(200);
  await snap('06-ai-choose-modal');
  await page.locator('.aiopt').first().click(); await wait(3200);
  await snap('07-review');
  await page.getByRole('button', { name: 'Include related regression tests' }).click(); await wait(200);
  await snap('08-review-suggestions');
  await page.getByRole('button', { name: 'Include related regression tests' }).click(); await wait(200);
  await page.getByRole('button', { name: /^Assign 14 cases$/ }).click(); await wait(300);
  await page.locator('select[aria-label="Switch role"]').selectOption('tester'); await wait(400);
  await snap('09-queue');
  await page.locator('a.card').first().click(); await wait(300);
  await snap('10-run');
  await page.getByRole('button', { name: 'Prototype: fill sample results' }).click(); await wait(300);
  await page.locator('.navlist button').nth(5).click(); await wait(200);
  await snap('11-run-filled');
  await page.getByRole('button', { name: 'Submit for Review' }).click(); await wait(300);
  await page.locator('select[aria-label="Switch role"]').selectOption('dev'); await wait(400);
  await page.locator('.appcard').first().click(); await wait(300);
  await page.locator('tr.click').first().click(); await wait(300);
  await snap('12-report-submitted');
  await page.locator('.card.empty .btn.pri').first().click(); await wait(2200);
  await snap('13-report');
  await page.getByRole('button', { name: 'Audit trail' }).click(); await wait(300);
  await snap('14-audit-drawer');
  await page.keyboard.press('Escape'); await wait(200);
  await page.locator('.side .btn.pri.lg').click(); await wait(200);
  await page.locator('.modal input[type=checkbox]').check(); await wait(100);
  await snap('15-approve-modal');
  await page.locator('.modal .mf .btn.pri').click(); await wait(300);
  await snap('16-approved');
  await page.locator('button[aria-label="Toggle dark mode"]').click(); await wait(300);
  await snap('17-dark-approved');
  await page.locator('button[aria-label="Toggle dark mode"]').click(); await wait(200);
  await page.locator('select[aria-label="Switch role"]').selectOption('admin'); await wait(400);
  await page.getByRole('button', { name: 'Add App' }).click(); await wait(200);
  await page.locator('.repo').first().click(); await wait(200);
  await snap('18-add-app-modal');
}

/**
 * The prototype loads IBM Plex from Google Fonts; the app bundles the same fonts via @fontsource.
 * Serve the prototype the @fontsource files too, so both render identical glyphs even offline.
 */
async function serveFontsLocally(page) {
  const fam = { sans: 'ibm-plex-sans', mono: 'ibm-plex-mono' };
  let css = '';
  for (const [k, pkg] of Object.entries(fam)) {
    for (const w of k === 'sans' ? [400, 500, 600, 700] : [400, 500]) {
      css += fs.readFileSync(path.resolve(`node_modules/@fontsource/${pkg}/${w}.css`), 'utf8').replaceAll('url(./files/', `url(https://fonts.local/${pkg}/files/`);
    }
  }
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: css }));
  await page.route('https://fonts.local/**', r => {
    const rel = new URL(r.request().url()).pathname.slice(1);
    r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.resolve('node_modules/@fontsource', rel)), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

async function capture(url, tag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (tag === 'proto') await serveFontsLocally(page);
  await page.addInitScript(() => { try { localStorage.setItem('verity-theme', 'light'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(800);
  await page.addStyleTag({ content: HIDE });
  const shots = [];
  const snap = async name => {
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(out, `${name}-${tag}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots.push(name);
  };
  try { await drive(page, snap); } catch (e) { console.error(`[${tag}] stopped:`, e.message.split('\n')[0]); }
  await browser.close();
  return shots;
}

const protoUrl = 'file://' + path.resolve(protoPath);
const a = await capture(protoUrl, 'proto');
const b = await capture(appUrl + '/signin', 'app');
const rows = [];
for (const name of a.filter(n => b.includes(n))) {
  const p1 = PNG.sync.read(fs.readFileSync(path.join(out, `${name}-proto.png`)));
  const p2 = PNG.sync.read(fs.readFileSync(path.join(out, `${name}-app.png`)));
  const w = Math.min(p1.width, p2.width), h = Math.min(p1.height, p2.height);
  const crop = (p) => { const c = new PNG({ width: w, height: h }); PNG.bitblt(p, c, 0, 0, w, h, 0, 0); return c; };
  const c1 = crop(p1), c2 = crop(p2), diff = new PNG({ width: w, height: h });
  const n = pixelmatch(c1.data, c2.data, diff.data, w, h, { threshold: 0.1 });
  fs.writeFileSync(path.join(out, `${name}-diff.png`), PNG.sync.write(diff));
  rows.push({ screen: name, size: p1.height === p2.height ? `${w}x${h}` : `${p1.height} vs ${p2.height}px tall`, diffPixels: n, diffPct: (100 * n / (w * h)).toFixed(3) + '%' });
}
console.table(rows);
