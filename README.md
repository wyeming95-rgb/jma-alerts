# JMA Weather Alerts (static web app)

A static web app for Japanese weather warnings and advisories (警報・注意報) and forecasts. It uses only the JMA bosai JSON endpoints, which need no key, and does not depend on any build step or npm package.

- `https://www.jma.go.jp/bosai/common/const/area.json`: area names and codes
- `https://www.jma.go.jp/bosai/warning/data/warning/{office}.json`: warnings and advisories
- `https://www.jma.go.jp/bosai/forecast/data/forecast/{office}.json`: forecast

JMA sends `Access-Control-Allow-Origin: *`, so the browser fetches these endpoints directly.

## Run

```sh
python3 -m http.server 3000        # or: npx serve -l 3000
# open http://localhost:3000
```

Geolocation works on `localhost` because browsers treat it as a secure context. On any other host you need HTTPS.

## Features

- **Location.** The 📍 button maps your lat/lon to the nearest of the 58 JMA forecast offices, using the centroid table in `jma.js`. You can also pick an office and a sub-area by hand.
- **Map.** Leaflet with OpenStreetMap tiles loads from a CDN. It shows one pin per class10 alert area (142 of them), coloured by that area's most severe active alert: emergency warning (特別警報) in purple with a black ring, warning in red, advisory in yellow, none in green. Your own location gets a separate marker.
- **Alert list.** Warning codes are decoded to Japanese and English names. Report times are shown in JST.
- **Forecast.** Weather text for today, tomorrow and the day after, per sub-area.
- **Markdown export.** The ⬇ button downloads a report. It cites the exact JMA URLs and each `reportDatetime`.

## CLI

```sh
node report.mjs 130000 > tokyo.md   # Node >= 18 (uses global fetch)
node test.mjs                       # offline self-check of the parsing logic
node gen-centroids.mjs              # regenerate class10-centroids.json from JMA's geojson/class10s.json
npm i && npx playwright install chromium && node e2e.mjs   # headless browser test; needs the server on :3000
```

`report.mjs` and the browser share `jma.js`, so the CLI produces the same Markdown as the download button.

## Caveats

- **The warning feed looks frozen.** On 2026-10-29, every office's `warning/{office}.json` had a `reportDatetime` of 2026-05-26 or 2026-05-28, while the forecast feed was current. This probably follows JMA's revision of its warning system in May 2026. The app and the report show a stale-data banner when the feed is more than 24 hours old. **Do not use this for safety decisions.** Check https://www.jma.go.jp/bosai/warning/ instead.
- Alerts are shown at the class10 sub-area level (`areaTypes[0]`). Municipality detail (`areaTypes[1]`) and the hourly risk `timeSeries` are not shown.
- The warning feed has no time per alert, so each alert shows the feed's `reportDatetime`.
- Map pins sit at the centroid of each area's largest polygon in JMA's coarse `class10s.json`. For Ogasawara (130040) that is Minamitorishima, not Chichijima.
- "Nearest office" for 📍 still uses the approximate per-office points in `jma.js`, so near a prefecture border it can be wrong.
- Some offices have no forecast file of their own. 014030 (Tokachi) uses 014100, and 460040 (Amami) uses 460100.
- The code table in `jma.js` covers the classic JMA codes 02–38. Any other code shows as "Unknown code NN".
- Loading the page makes 58 small warning requests in parallel, one per office, to build the national map.
- These are unofficial JSON endpoints with no documentation or stability guarantee, and the schema may change.
