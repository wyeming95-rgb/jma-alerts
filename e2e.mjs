// Headless browser check against a running server (python3 -m http.server 3000): node e2e.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ geolocation: { latitude: 35.68, longitude: 139.76 }, permissions: ['geolocation'], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000/');
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length > 100, null, { timeout: 60000 });
  await page.click('#locate');
  await page.waitForFunction(() => document.querySelector('#office').value === '130000' && /nearest office/.test(document.querySelector('#status').textContent));
  await page.waitForSelector('#forecast p');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  assert.match(download.suggestedFilename(), /^jma-130000-\d+\.md$/);
  const md = await readFile(await download.path(), 'utf8');
  assert.match(md, /^# JMA weather alerts: 東京都 \(Tokyo\) \[130000\]/);
  assert.match(md, /warning\/data\/warning\/130000\.json \(reportDatetime: /);
  assert.deepEqual(errors, []);
  console.log(`e2e ok: ${download.suggestedFilename()} (${md.length} chars)`);
} finally {
  await browser.close();
}
