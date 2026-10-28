#!/usr/bin/env node
// Usage: node report.mjs <officeCode>   e.g. node report.mjs 130000 > report.md
import { AREA_URL, warningUrl, forecastUrl, toMarkdown } from './jma.js';

const office = process.argv[2];
const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

const area = await get(AREA_URL);
if (!area.offices[office]) {
  console.error(`Unknown office code "${office}". Valid: ${Object.keys(area.offices).join(' ')}`);
  process.exit(1);
}
const [warning, forecast] = await Promise.all([get(warningUrl(office)), get(forecastUrl(office)).catch(() => null)]);
process.stdout.write(toMarkdown({ office, area, warning, forecast }));
