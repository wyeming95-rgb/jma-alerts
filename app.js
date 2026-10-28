import { AREA_URL, warningUrl, forecastUrl, CENTROIDS, COLORS, SEVERITY, nearestOffice, parseWarnings, parseForecast, jst, ageHours, toMarkdown } from './jma.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

const map = L.map('map').setView([36.5, 137.5], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
const legend = L.control({ position: 'bottomright' });
legend.onAdd = () => Object.assign(L.DomUtil.create('div', 'legend'), {
  innerHTML: ['special:特別警報 Emergency', 'warning:警報 Warning', 'advisory:注意報 Advisory', 'none:なし None']
    .map((s) => { const [k, t] = s.split(':'); return `<i style="background:${COLORS[k]}"></i>${t}`; }).join('<br>'),
});
legend.addTo(map);

const [area, AREA_CENTROIDS] = await Promise.all([get(AREA_URL), get('class10-centroids.json')]);
const warnings = {}; // office → warning JSON
const markers = {}; // class10 area → pin
let current, forecast, userMarker;

for (const [code, o] of Object.entries(area.offices)) $('office').add(new Option(`${o.name} ${o.enName}`, code));

// Nationwide overview: one pin per class10 alert area, coloured by that area's highest active severity.
$('status').textContent = 'Loading warnings for all offices…';
await Promise.all(Object.keys(area.offices).map(async (code) => {
  try { warnings[code] = await get(warningUrl(code)); } catch { return; }
  const alerts = parseWarnings(warnings[code], area);
  for (const { code: ac } of warnings[code].areaTypes?.[0]?.areas || []) {
    if (!AREA_CENTROIDS[ac]) continue;
    const mine = alerts.filter((a) => a.areaCode === ac);
    const sev = SEVERITY[Math.max(0, ...mine.map((a) => a.severity))];
    const m = area.class10s[ac] || {};
    markers[ac] = L.circleMarker(AREA_CENTROIDS[ac], { radius: 8, weight: sev === 'special' ? 3 : 1, color: sev === 'special' ? '#000' : '#333', fillColor: COLORS[sev], fillOpacity: 0.85 })
      .bindPopup(`<b>${esc(m.name || ac)} ${esc(m.enName || '')}</b><br><small>${esc(area.offices[code].name)}</small><br>${mine.length ? [...new Set(mine.map((a) => `${a.ja} ${a.en}`))].map(esc).join('<br>') : '発表なし / None'}<br><small>${jst(warnings[code].reportDatetime)}</small>`)
      .on('click', () => select(code, ac))
      .addTo(map);
  }
}));
$('status').textContent = '';

async function select(code, ac = '') {
  current = code;
  $('office').value = code;
  const cls = area.offices[code].children;
  $('area').replaceChildren(new Option('すべて / All', ''), ...cls.map((c) => new Option(`${area.class10s[c]?.name} ${area.class10s[c]?.enName}`, c)));
  $('area').value = ac;
  const fc = await get(forecastUrl(code)).catch(() => null);
  if (current !== code) return; // a newer select() won the race
  forecast = fc;
  map.setView(AREA_CENTROIDS[ac] || CENTROIDS[code], 8);
  render();
}

function render() {
  const w = warnings[current];
  if (!w) { $('alerts').textContent = 'Warning data unavailable.'; return; }
  const only = $('area').value;
  const age = ageHours(w.reportDatetime);
  $('stale').innerHTML = age > 24 ? `<div class="stale">⚠ この警報データは ${Math.round(age / 24)} 日前 (${jst(w.reportDatetime)}) のものです。The JMA warning feed is ${Math.round(age / 24)} days old; it may be frozen. Check <a href="https://www.jma.go.jp/bosai/warning/" target="_blank" rel="noopener">jma.go.jp</a>.</div>` : '';
  $('headline').textContent = w.headlineText || '';
  const alerts = parseWarnings(w, area).filter((a) => !only || a.areaCode === only);
  $('alerts').innerHTML = alerts.length
    ? alerts.map((a) => `<div class="alert ${SEVERITY[a.severity]}"><b>${esc(a.ja)}</b> ${esc(a.en)} <small>[${a.code}] ${esc(a.status)}</small><br>${esc(a.areaName)} ${esc(a.areaEn)}<br><small>発表 ${jst(w.reportDatetime)}</small></div>`).join('')
    : '<p>発表中の警報・注意報はありません / No active alerts.</p>';
  const fc = parseForecast(forecast).filter((f) => !only || f.code === only);
  $('forecast').innerHTML = fc.length
    ? `<small>発表 ${jst(forecast[0].reportDatetime)}</small>` + fc.map((f) => `<p><b>${esc(f.name)}</b><br>${f.weathers.map((x, i) => `${jst(f.times[i]).split(" ")[0]}: ${esc(x.replace(/　/g, ' '))}`).join('<br>')}</p>`).join('')
    : '<p>Forecast unavailable.</p>';
  markers[only]?.openPopup();
}

$('office').onchange = (e) => select(e.target.value);
$('area').onchange = render;
$('export').onclick = () => {
  if (!warnings[current]) { $('status').textContent = 'No warning data to export for this office.'; return; }
  const md = toMarkdown({ office: current, area, warning: warnings[current], forecast });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `jma-${current}-${Date.now()}.md` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href)); // revoking synchronously can cancel the download in Firefox/Safari
};
$('locate').onclick = () => {
  if (!navigator.geolocation) { $('status').textContent = 'Geolocation not supported.'; return; }
  $('status').textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(({ coords: { latitude, longitude } }) => {
    userMarker?.remove();
    userMarker = L.marker([latitude, longitude]).addTo(map).bindTooltip('現在地 / You', { permanent: true });
    $('status').textContent = `${latitude.toFixed(3)}, ${longitude.toFixed(3)} → nearest office`;
    select(nearestOffice(latitude, longitude));
  }, (err) => { $('status').textContent = `Location error: ${err.message}. Pick an office manually.`; });
};

select('130000');
