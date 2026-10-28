// Offline checks of the parsing and report logic: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decode, forecastUrl, nearestOffice, parseWarnings, severityOf, type AreaJson, type WarningJson } from '../src/lib/jma';
import { parseCod, parseQuakes, type QuakeReport } from '../src/lib/quake';
import { toMarkdown } from '../src/lib/report';

test('offices and codes', () => {
  assert.equal(nearestOffice(35.68, 139.76), '130000'); // Tokyo station
  assert.equal(nearestOffice(34.70, 135.50), '270000'); // Osaka
  assert.equal(nearestOffice(43.06, 141.35), '016000'); // Sapporo
  assert.equal(nearestOffice(26.21, 127.68), '471000'); // Naha
  assert.deepEqual([severityOf('33'), severityOf('03'), severityOf('14')], [3, 2, 1]);
  assert.equal(decode('14')[1], 'Thunderstorm Advisory');
  assert.match(forecastUrl('014030'), /014100\.json$/);
});

const area = { offices: { 130000: { name: '東京都', enName: 'Tokyo', children: ['130010'] } }, class10s: { 130010: { name: '東京地方', enName: 'Tokyo Region' } } } as AreaJson;
const warning: WarningJson = { reportDatetime: '2026-05-28T10:16:00+09:00', headlineText: 'h', areaTypes: [{ areas: [{ code: '130010', warnings: [
  { code: '14', status: '継続' }, { code: '20', status: '解除' }, { code: '33', status: '発表' }] }] }] };
const r = (o: Partial<QuakeReport>): QuakeReport => ({ eid: 'e1', rdt: '', at: '2026-10-29T00:07:00+09:00', ttl: '', anm: '', cod: '', mag: '', maxi: '', json: 'x.json', ...o });
// Newest first, as in the real feed: intensity-only flash, then hypocentre, then a later merged report.
const list = [
  r({ eid: 'e2', rdt: '2026-10-29T01:00:00+09:00', ttl: '南海トラフ地震関連解説情報' }),
  r({ rdt: '2026-10-29T00:16:00+09:00', anm: '千葉県北東部', cod: '+35.7+140.7-50000/', mag: '5.4', maxi: '5-', json: 'latest.json' }),
  r({ rdt: '2026-10-29T00:10:00+09:00', maxi: '5-' }),
  r({ eid: 'e3', at: '2026-10-24T11:38:00+09:00', rdt: '2026-10-24T12:00:00+09:00', anm: '南太平洋', cod: '-13.8+165.7/', mag: '7.2' }),
];

test('parseWarnings drops cleared alerts, special first', () => {
  assert.deepEqual(parseWarnings(warning, area).map((a) => a.code), ['33', '14']);
});

test('parseCod handles depth, far-field and junk', () => {
  assert.deepEqual(parseCod('+35.7+140.7-50000/'), { lat: 35.7, lon: 140.7, depthKm: 50 });
  assert.deepEqual(parseCod('+07.5-080.8/'), { lat: 7.5, lon: -80.8, depthKm: null });
  assert.equal(parseCod(''), null);
});

test('parseQuakes merges reports per event and skips ones without a hypocentre', () => {
  const q = parseQuakes(list);
  assert.deepEqual(q.map((x) => x.eid), ['e1', 'e3']);
  assert.equal(q[0].mag, 5.4);
  assert.equal(q[0].maxi, '5-');
  assert.equal(q[0].detailUrl, 'https://www.jma.go.jp/bosai/quake/data/latest.json');
  assert.equal(q[1].depthKm, null);
});

test('toMarkdown cites sources, flags stale data, survives a failed feed', () => {
  const now = new Date('2026-10-29T00:00:00Z');
  const md = toMarkdown({ office: '130000', area, warning, forecast: null, quakes: parseQuakes(list), now });
  assert.match(md, /warning\/data\/warning\/130000\.json \(reportDatetime: 2026-05-28T10:16:00\+09:00/);
  assert.match(md, /Stale data:\*\* the warning feed/);
  assert.match(md, /大雨特別警報 \| Heavy Rain Emergency Warning \| special/);
  assert.match(md, /quake\/data\/list\.json \(latest report: 2026-10-29T00:16:00\+09:00/);
  assert.match(md, /千葉県北東部 .* \| M5\.4 \| 50 km \| 5弱 \| 2026\/10\/29 0:16:00 JST \| https:\/\/www\.jma\.go\.jp\/bosai\/quake\/data\/latest\.json \|/);
  assert.doesNotMatch(md, /Stale data:\*\* the newest earthquake/);
  const down = toMarkdown({ office: '130000', area, warning: null, forecast: null, quakes: null, now });
  assert.match(down, /Warning feed unavailable/);
  assert.match(down, /Earthquake feed unavailable/);
});
