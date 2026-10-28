# JMA Weather Alerts & Earthquakes

A Next.js app, exported as static files, that shows Japanese weather warnings and advisories (警報・注意報), forecasts, and recent earthquakes on one map. All data comes from the Japan Meteorological Agency's bosai JSON endpoints. The browser fetches them directly, because JMA sends `Access-Control-Allow-Origin: *`. There is no backend and no API key.

Live: https://wyeming95-rgb.github.io/jma-alerts/

## Features

- **Location.** "現在地 Near me" maps your position to the nearest of the 58 JMA forecast offices. You can also pick an office and a sub-area (class10) by hand.
- **Map.** Leaflet with OpenStreetMap tiles.
  - **Alert areas** are squares, one per class10 area (142 in total), coloured by the area's most severe active alert using JMA's colours: emergency (特別警報) is black with a violet ring, warning is red, advisory is yellow, none is green.
  - **Earthquakes** are circles. Size scales with magnitude and colour follows JMA's maximum-intensity (震度) scale. The newest quake pulses if it is under 24 hours old.
  - A layer control toggles alerts and earthquakes. A legend explains every mark.
- **Lists.** Alerts for the selected office, earthquakes (time in JST, place, magnitude, depth, max shindo), and a three-day forecast. Clicking a row zooms the map and opens that marker's popup.
- **Markdown report.** Downloads a report that cites every source URL and its `reportDatetime`, including a per-quake JMA detail URL and report time.
- **Resilience.** Each feed loads and fails on its own, and each office's warning file does too. A failed feed shows an error with a Retry button, and the other feeds keep working. A stale-data banner appears when the warning feed is more than 24 hours old or the newest quake report is more than 72 hours old.
- Light and dark themes follow `prefers-color-scheme`; in dark mode the OSM tiles are dimmed with a CSS filter. The UI is keyboard-accessible with visible focus, honours reduced motion, and shows skeleton loading states and explicit empty states.

## Architecture

```
src/lib/jma.ts        warning/forecast URLs, code table, parsing, nearest office, JST formatting
src/lib/quake.ts      quake list URL, ISO 6709 `cod` parser, per-event merge, shindo scale/colours
src/lib/report.ts     Markdown report (shared by the browser and the CLI)
src/components/App.tsx      client UI: data loading, lists, banners, legend
src/components/MapView.tsx  imperative Leaflet map, loaded with next/dynamic { ssr: false }
src/app/              App Router layout/page (statically prerendered shell) + globals.css
public/class10-centroids.json  class10 area → [lat, lon] (fetched with the basePath prefix)
scripts/report.ts     CLI report; scripts/gen-centroids.mjs regenerates the centroids
scripts/e2e.mjs       headless browser test against the static export
test/jma.test.ts      offline unit tests (node:test via tsx)
```

`next.config.ts` sets `output: 'export'`, `trailingSlash: true`, and `images.unoptimized`. It also sets `basePath: '/jma-alerts'`, but only when `NODE_ENV=production`, so `next dev` serves at `/`.

## Develop

```sh
npm install
npm run dev                         # http://localhost:3000/
npm test                            # offline unit tests
npm run -s report -- 130000 > tokyo.md   # Markdown report from the CLI
npm run centroids                   # regenerate public/class10-centroids.json
```

## Build and verify

```sh
npm run build    # static site in ./out (asset URLs start with /jma-alerts/_next/)
npm run e2e      # builds, serves ./out under /jma-alerts/, checks desktop + mobile in Chromium
```

The e2e test checks the following:
- the map tiles and all 142 area pins render
- the alert list or its empty state renders
- quake markers and list rows render
- geolocation picks Tokyo
- the downloaded report cites the warning, quake list and quake detail URLs
- there are no 404s under the basePath and no page errors

It writes screenshots to `/tmp/jma-desktop.png` and `/tmp/jma-mobile.png`. If Chromium is missing, run `npx playwright install chromium` first.

## Deploy

`.github/workflows/deploy.yml` runs on every push to `main` and on manual dispatch. It runs `npm ci`, `npm test` and `next build`, uploads `./out` as the Pages artifact, and deploys it with `actions/deploy-pages`. In the repo settings, set Pages → Source to **GitHub Actions**. `public/.nojekyll` stops Jekyll from hiding `_next/`.

## Data sources

- `https://www.jma.go.jp/bosai/common/const/area.json`: area names and codes
- `https://www.jma.go.jp/bosai/warning/data/warning/{office}.json`: warnings and advisories, one file per office (58 requests)
- `https://www.jma.go.jp/bosai/forecast/data/forecast/{office}.json`: forecast
- `https://www.jma.go.jp/bosai/quake/data/list.json`: recent earthquake reports, about one month of history
- `https://www.jma.go.jp/bosai/quake/data/{json}`: per-report detail. The app cites these URLs but does not fetch them, because the list already carries magnitude, maximum intensity and hypocentre.

## Caveats

- **The warning feed looks frozen.** On 2026-10-29, every `warning/{office}.json` had a `reportDatetime` from late May 2026, while the forecast and quake feeds were current. This probably follows JMA's May 2026 warning-system revision. The app shows a stale banner when this happens. **Do not use this for safety decisions.** Check https://www.jma.go.jp/bosai/warning/ instead.
- **One event, several reports.** The quake list holds several reports per event (`eid`): 震度速報, 震源に関する情報, and 震源・震度情報. The app merges them and takes the newest non-empty value of each field. Reports that have no hypocentre, such as intensity-only flashes or Nankai Trough commentary, are not plotted.
- **Coordinates.** The `cod` field is ISO 6709 (`+35.7+140.7-50000/`), which gives latitude, longitude and altitude in metres. Depth 0 means "very shallow". Distant (遠地) quakes have no depth, and their circles plot outside Japan.
- **Alert detail.** Alerts are shown at the class10 level. The warning feed has no per-alert time, so each alert shows the feed's `reportDatetime`. Codes outside 02–38 show as "Unknown code NN".
- **Pin positions.** Each pin sits at the centroid of the area's largest polygon. For Ogasawara (130040) that is Minamitorishima. "Nearest office" uses approximate per-office points, so it can be wrong near a prefecture border.
- **Forecast files.** Offices 014030 and 460040 have no forecast file of their own. They use the files for 014100 and 460100.
- **Stability.** These are unofficial endpoints with no documentation or stability guarantee.
