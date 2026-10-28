// Shared JMA logic for the browser app (index.html) and the Node CLI (report.mjs).
export const BASE = 'https://www.jma.go.jp/bosai';
export const AREA_URL = `${BASE}/common/const/area.json`;
export const warningUrl = (office) => `${BASE}/warning/data/warning/${office}.json`;
// JMA has no forecast file for these offices; their forecast lives in the parent office's file.
const FORECAST_OFFICE = { '014030': '014100', '460040': '460100' };
export const forecastUrl = (office) => `${BASE}/forecast/data/forecast/${FORECAST_OFFICE[office] || office}.json`;

// Approximate office centroids [lat, lon] (prefectural capital / main city of the office's region).
// shortcut: point per office, not polygons; upgrade to JMA GIS shapefiles if area-level pins are needed.
export const CENTROIDS = {
  '011000': [45.0, 142.0], '012000': [44.0, 142.2], '013000': [43.9, 144.0], '014030': [42.9, 143.2],
  '014100': [43.2, 144.8], '015000': [42.5, 142.0], '016000': [43.2, 141.4], '017000': [41.9, 140.3],
  '020000': [40.82, 140.74], '030000': [39.70, 141.15], '040000': [38.27, 140.87], '050000': [39.72, 140.10],
  '060000': [38.24, 140.36], '070000': [37.75, 140.47], '080000': [36.34, 140.45], '090000': [36.57, 139.88],
  '100000': [36.39, 139.06], '110000': [35.86, 139.65], '120000': [35.61, 140.12], '130000': [35.69, 139.69],
  '140000': [35.45, 139.64], '150000': [37.90, 139.02], '160000': [36.70, 137.21], '170000': [36.59, 136.63],
  '180000': [36.07, 136.22], '190000': [35.66, 138.57], '200000': [36.65, 138.18], '210000': [35.39, 136.72],
  '220000': [34.98, 138.38], '230000': [35.18, 136.91], '240000': [34.73, 136.51], '250000': [35.00, 135.87],
  '260000': [35.02, 135.76], '270000': [34.69, 135.52], '280000': [34.69, 135.18], '290000': [34.69, 135.83],
  '300000': [34.23, 135.17], '310000': [35.50, 134.24], '320000': [35.47, 133.05], '330000': [34.66, 133.93],
  '340000': [34.40, 132.46], '350000': [34.19, 131.47], '360000': [34.07, 134.56], '370000': [34.34, 134.04],
  '380000': [33.84, 132.77], '390000': [33.56, 133.53], '400000': [33.61, 130.42], '410000': [33.25, 130.30],
  '420000': [32.74, 129.87], '430000': [32.79, 130.74], '440000': [33.24, 131.61], '450000': [31.91, 131.42],
  '460040': [28.38, 129.49], '460100': [31.56, 130.56], '471000': [26.21, 127.68], '472000': [25.83, 131.23],
  '473000': [24.80, 125.28], '474000': [24.34, 124.16],
};

export function nearestOffice(lat, lon) {
  const d = ([a, b]) => (a - lat) ** 2 + ((b - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  return Object.keys(CENTROIDS).reduce((best, k) => (d(CENTROIDS[k]) < d(CENTROIDS[best]) ? k : best));
}

// JMA warning codes → [Japanese, English]. Severity derives from the code range.
export const CODES = {
  '02': ['暴風雪警報', 'Snowstorm Warning'], '03': ['大雨警報', 'Heavy Rain Warning'], '04': ['洪水警報', 'Flood Warning'],
  '05': ['暴風警報', 'Storm Warning'], '06': ['大雪警報', 'Heavy Snow Warning'], '07': ['波浪警報', 'High Wave Warning'],
  '08': ['高潮警報', 'Storm Surge Warning'], '10': ['大雨注意報', 'Heavy Rain Advisory'], '12': ['大雪注意報', 'Heavy Snow Advisory'],
  '13': ['風雪注意報', 'Wind and Snow Advisory'], '14': ['雷注意報', 'Thunderstorm Advisory'], '15': ['強風注意報', 'Strong Wind Advisory'],
  '16': ['波浪注意報', 'High Wave Advisory'], '17': ['融雪注意報', 'Snowmelt Advisory'], '18': ['洪水注意報', 'Flood Advisory'],
  '19': ['高潮注意報', 'Storm Surge Advisory'], '20': ['濃霧注意報', 'Dense Fog Advisory'], '21': ['乾燥注意報', 'Dry Air Advisory'],
  '22': ['なだれ注意報', 'Avalanche Advisory'], '23': ['低温注意報', 'Low Temperature Advisory'], '24': ['霜注意報', 'Frost Advisory'],
  '25': ['着氷注意報', 'Icing Advisory'], '26': ['着雪注意報', 'Snow Accretion Advisory'], '27': ['その他の注意報', 'Other Advisory'],
  '32': ['暴風雪特別警報', 'Snowstorm Emergency Warning'], '33': ['大雨特別警報', 'Heavy Rain Emergency Warning'],
  '35': ['暴風特別警報', 'Storm Emergency Warning'], '36': ['大雪特別警報', 'Heavy Snow Emergency Warning'],
  '37': ['波浪特別警報', 'High Wave Emergency Warning'], '38': ['高潮特別警報', 'Storm Surge Emergency Warning'],
};
export const SEVERITY = { 3: 'special', 2: 'warning', 1: 'advisory', 0: 'none' };
export const COLORS = { special: '#4b0082', warning: '#d7191c', advisory: '#f2c200', none: '#2b8a3e' };
export const severityOf = (code) => (+code >= 30 ? 3 : +code >= 10 ? 1 : +code >= 2 ? 2 : 0);
export const decode = (code) => CODES[code] || [`不明コード${code}`, `Unknown code ${code}`];

const INACTIVE = new Set(['解除', '発表警報・注意報はなし']);

// Active alerts at class10 (region) level: [{areaCode, areaName, areaEn, code, ja, en, status, severity}]
export function parseWarnings(w, area) {
  const out = [];
  for (const a of w.areaTypes?.[0]?.areas || []) {
    const meta = area.class10s[a.code] || {};
    for (const x of a.warnings || []) {
      if (!x.code || INACTIVE.has(x.status)) continue;
      const [ja, en] = decode(x.code);
      out.push({ areaCode: a.code, areaName: meta.name || a.code, areaEn: meta.enName || '', code: x.code, ja, en, status: x.status, severity: severityOf(x.code) });
    }
  }
  return out.sort((p, q) => q.severity - p.severity || p.areaCode.localeCompare(q.areaCode));
}

// Short-term forecast: [{code, name, times, weathers}] from forecast[0].timeSeries[0] (today/tomorrow/day after).
export function parseForecast(f) {
  const ts = f?.[0]?.timeSeries?.[0];
  if (!ts) return [];
  return ts.areas.map((a) => ({ code: a.area.code, name: a.area.name, times: ts.timeDefines, weathers: a.weathers || [] }));
}

export const jst = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }) + ' JST' : '—');
export const ageHours = (iso, now = Date.now()) => (now - new Date(iso)) / 3.6e6;

export function toMarkdown({ office, area, warning, forecast, now = new Date() }) {
  const o = area.offices[office];
  const alerts = parseWarnings(warning, area);
  const fc = parseForecast(forecast);
  const age = ageHours(warning.reportDatetime, now);
  const L = [];
  L.push(`# JMA weather alerts: ${o.name} (${o.enName}) [${office}]`, '');
  L.push(`Generated: ${jst(now.toISOString())}`, '');
  L.push('## Sources', '');
  L.push(`- Warnings: ${warningUrl(office)} (reportDatetime: ${warning.reportDatetime}, ${jst(warning.reportDatetime)})`);
  L.push(`- Forecast: ${forecastUrl(office)} (reportDatetime: ${forecast?.[0]?.reportDatetime ?? 'n/a'}, ${jst(forecast?.[0]?.reportDatetime)})`);
  L.push(`- Area codes: ${AREA_URL}`, '');
  if (age > 24) L.push(`> **Stale data:** the warning feed was last updated ${Math.round(age / 24)} days ago. Check https://www.jma.go.jp/bosai/warning/ before relying on it.`, '');
  L.push('## Headline', '', warning.headlineText || '(none)', '');
  L.push(`## Active alerts (${alerts.length})`, '');
  if (alerts.length) {
    L.push('| Area | Code | Alert (JA) | Alert (EN) | Severity | Status | Report time (JST) |', '|---|---|---|---|---|---|---|');
    for (const a of alerts) L.push(`| ${a.areaName} ${a.areaEn} (${a.areaCode}) | ${a.code} | ${a.ja} | ${a.en} | ${SEVERITY[a.severity]} | ${a.status} | ${jst(warning.reportDatetime)} |`);
  } else L.push('No active warnings or advisories.');
  L.push('', '## Forecast', '');
  for (const f of fc) L.push(`- **${f.name}** (${f.code}): ${f.weathers.map((w, i) => `${jst(f.times[i])}: ${w.replace(/　/g, ' ')}`).join(' / ')}`);
  if (!fc.length) L.push('Forecast unavailable.');
  return L.join('\n') + '\n';
}
