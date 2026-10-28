import { AREA_URL, SEVERITY, ageHours, forecastUrl, jst, parseForecast, parseWarnings, warningUrl, type AreaJson, type ForecastJson, type WarningJson } from './jma';
import { QUAKE_LIST_URL, shindoLabel, type Quake } from './quake';

export const WARNING_STALE_HOURS = 24;
// Japan records felt quakes almost daily; three quiet days more likely means a frozen feed.
export const QUAKE_STALE_HOURS = 72;

const cell = (s: string) => s.replace(/\|/g, '\\|');

export interface ReportInput { office: string; area: AreaJson; warning: WarningJson | null; forecast: ForecastJson | null; quakes: Quake[] | null; now?: Date }

export function toMarkdown({ office, area, warning, forecast, quakes, now = new Date() }: ReportInput): string {
  const o = area.offices[office];
  const fc = parseForecast(forecast);
  const L: string[] = [];
  L.push(`# JMA weather alerts: ${o.name} (${o.enName}) [${office}]`, '');
  L.push(`Generated: ${jst(now.toISOString())}`, '');
  L.push('## Sources', '');
  L.push(`- Warnings: ${warningUrl(office)} (${warning ? `reportDatetime: ${warning.reportDatetime}, ${jst(warning.reportDatetime)}` : 'fetch failed'})`);
  L.push(`- Forecast: ${forecastUrl(office)} (reportDatetime: ${forecast?.[0]?.reportDatetime ?? 'n/a'}, ${jst(forecast?.[0]?.reportDatetime)})`);
  L.push(`- Earthquakes: ${QUAKE_LIST_URL} (${quakes ? `latest report: ${quakes[0] ? `${quakes[0].rdt}, ${jst(quakes[0].rdt)}` : 'none'}` : 'fetch failed'})`);
  L.push(`- Area codes: ${AREA_URL}`, '');

  if (warning) {
    const age = ageHours(warning.reportDatetime, +now);
    const alerts = parseWarnings(warning, area);
    if (age > WARNING_STALE_HOURS) L.push(`> **Stale data:** the warning feed was last updated ${Math.round(age / 24)} days ago. Check https://www.jma.go.jp/bosai/warning/ before relying on it.`, '');
    L.push('## Headline', '', warning.headlineText || '(none)', '');
    L.push(`## Active alerts (${alerts.length})`, '');
    if (alerts.length) {
      L.push('| Area | Code | Alert (JA) | Alert (EN) | Severity | Status | Report time (JST) |', '|---|---|---|---|---|---|---|');
      for (const a of alerts) L.push(`| ${a.areaName} ${a.areaEn} (${a.areaCode}) | ${a.code} | ${a.ja} | ${a.en} | ${SEVERITY[a.severity]} | ${a.status} | ${jst(warning.reportDatetime)} |`);
    } else L.push('No active warnings or advisories.');
  } else L.push('## Active alerts', '', `Warning feed unavailable (${warningUrl(office)} could not be fetched).`);

  L.push('', '## Forecast', '');
  for (const f of fc) L.push(`- **${f.name}** (${f.code}): ${f.weathers.map((w, i) => `${jst(f.times[i])}: ${w.replace(/　/g, ' ')}`).join(' / ')}`);
  if (!fc.length) L.push('Forecast unavailable.');

  L.push('', `## Recent earthquakes${quakes ? ` (${quakes.length})` : ''}`, '');
  if (!quakes) L.push(`Earthquake feed unavailable (${QUAKE_LIST_URL} could not be fetched).`);
  else {
    const age = quakes[0] ? ageHours(quakes[0].rdt, +now) : Infinity;
    if (age > QUAKE_STALE_HOURS) L.push(`> **Stale data:** the newest earthquake report is ${Number.isFinite(age) ? `${Math.round(age / 24)} days old` : 'missing'}. Check https://www.jma.go.jp/bosai/map.html#contents=earthquake_map before relying on it.`, '');
    if (quakes.length) {
      L.push('| Origin time (JST) | Place | Magnitude | Depth | Max shindo | Report time (JST) | Source |', '|---|---|---|---|---|---|---|');
      for (const q of quakes) L.push(`| ${jst(q.at)} | ${cell(q.place)} ${cell(q.placeEn)} | ${q.mag === null ? '—' : `M${q.mag.toFixed(1)}`} | ${q.depthKm === null ? '—' : q.depthKm === 0 ? 'very shallow' : `${q.depthKm} km`} | ${shindoLabel(q.maxi)} | ${jst(q.rdt)} | ${q.detailUrl} |`);
    } else L.push('No earthquakes in the feed.');
  }
  return L.join('\n') + '\n';
}
