// Offline self-check of the parsing logic: node test.mjs
import assert from 'node:assert/strict';
import { nearestOffice, severityOf, decode, parseWarnings, toMarkdown, forecastUrl } from './jma.js';

assert.equal(nearestOffice(35.68, 139.76), '130000'); // Tokyo station
assert.equal(nearestOffice(34.70, 135.50), '270000'); // Osaka
assert.equal(nearestOffice(43.06, 141.35), '016000'); // Sapporo
assert.equal(nearestOffice(26.21, 127.68), '471000'); // Naha
assert.deepEqual([severityOf('33'), severityOf('03'), severityOf('14')], [3, 2, 1]);
assert.equal(decode('14')[1], 'Thunderstorm Advisory');
assert.match(forecastUrl('014030'), /014100\.json$/);

const area = { offices: { 130000: { name: '東京都', enName: 'Tokyo' } }, class10s: { 130010: { name: '東京地方', enName: 'Tokyo Region' } } };
const warning = { reportDatetime: '2026-05-28T10:16:00+09:00', headlineText: 'h', areaTypes: [{ areas: [{ code: '130010', warnings: [
  { code: '14', status: '継続' }, { code: '20', status: '解除' }, { code: '33', status: '発表' }] }] }] };
const alerts = parseWarnings(warning, area);
assert.deepEqual(alerts.map((a) => a.code), ['33', '14']); // 解除 dropped, special warning first
const md = toMarkdown({ office: '130000', area, warning, forecast: null, now: new Date('2026-10-29T00:00:00Z') });
assert.match(md, /warning\/data\/warning\/130000\.json \(reportDatetime: 2026-05-28T10:16:00\+09:00/);
assert.match(md, /Stale data/);
assert.match(md, /大雨特別警報 \| Heavy Rain Emergency Warning \| special/);
console.log('ok');
