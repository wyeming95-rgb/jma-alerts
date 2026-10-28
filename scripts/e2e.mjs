// Headless check of the static export as GitHub Pages serves it (under /jma-alerts/): npm run e2e
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, devices } from 'playwright';

const ROOT = new URL('../out/', import.meta.url).pathname;
const PREFIX = '/jma-alerts';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(`${PREFIX}/`)) { res.writeHead(404).end(); return; }
  let file = join(ROOT, normalize(path.slice(PREFIX.length)).replace(/^(\.\.[/\\])+/, ''));
  if (file.endsWith('/')) file += 'index.html';
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}${PREFIX}/`;

async function check(browser, name, ctxOpts) {
  const ctx = await browser.newContext({ ...ctxOpts, geolocation: { latitude: 35.68, longitude: 139.76 }, permissions: ['geolocation'], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], missing = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(url)) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto(url);
  await page.waitForSelector('.leaflet-tile-pane img.leaflet-tile', { state: 'attached' });
  // Pins (142 class10 areas) and quake markers are all .leaflet-interactive paths.
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon.pin').length > 100, null, { timeout: 60000 });
  await page.waitForSelector('#quakes li, .empty', { timeout: 30000 });
  const quakeMarkers = await page.locator('path.quake').count();
  const quakeItems = await page.locator('#quakes li').count();
  assert.ok(quakeMarkers > 0 && quakeItems > 0, `quakes rendered (markers ${quakeMarkers}, items ${quakeItems})`);
  await page.waitForSelector('#alerts li, #alerts-empty');
  const alertItems = await page.locator('#alerts li').count();
  await page.click('#locate');
  await page.waitForFunction(() => document.querySelector('#office').value === '130000' && /nearest office/.test(document.querySelector('#status').textContent));
  await page.waitForSelector('#forecast dt');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  assert.match(download.suggestedFilename(), /^jma-130000-\d+\.md$/);
  const md = await readFile(await download.path(), 'utf8');
  assert.match(md, /^# JMA weather alerts: 東京都 \(Tokyo\) \[130000\]/);
  assert.match(md, /warning\/data\/warning\/130000\.json \(reportDatetime: /);
  assert.match(md, /quake\/data\/list\.json \(latest report: /);
  assert.match(md, /\| https:\/\/www\.jma\.go\.jp\/bosai\/quake\/data\/\S+\.json \|/);
  await page.waitForTimeout(1500); // let tiles paint for the screenshot
  await page.screenshot({ path: `/tmp/jma-${name}.png` });
  assert.deepEqual(missing, [], 'no 404s under basePath');
  assert.deepEqual(errors, []);
  console.log(`e2e ${name} ok: ${await page.locator('.leaflet-marker-icon.pin').count()} pins, ${alertItems || 'no (empty state shown)'} alerts for 東京都, ${quakeMarkers} quake markers, ${quakeItems} quake rows, report ${md.length} chars -> /tmp/jma-${name}.png`);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  await check(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
  await check(browser, 'mobile', { ...devices['Pixel 7'] });
} finally {
  await browser.close();
  server.close();
}
