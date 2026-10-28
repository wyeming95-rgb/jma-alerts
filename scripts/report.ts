// Usage: npm run report -- <officeCode>   e.g. npm run report -- 130000 > report.md
import { AREA_URL, forecastUrl, getJson, warningUrl, type AreaJson, type ForecastJson, type WarningJson } from '../src/lib/jma';
import { QUAKE_LIST_URL, parseQuakes, type QuakeReport } from '../src/lib/quake';
import { toMarkdown } from '../src/lib/report';

const office = process.argv[2];
const area = await getJson<AreaJson>(AREA_URL);
if (!area.offices[office]) {
  console.error(`Unknown office code "${office}". Valid: ${Object.keys(area.offices).join(' ')}`);
  process.exit(1);
}
const [warning, forecast, quakes] = await Promise.all([
  getJson<WarningJson>(warningUrl(office)).catch(() => null),
  getJson<ForecastJson>(forecastUrl(office)).catch(() => null),
  getJson<QuakeReport[]>(QUAKE_LIST_URL).then(parseQuakes).catch(() => null),
]);
process.stdout.write(toMarkdown({ office, area, warning, forecast, quakes }));
