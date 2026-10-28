#!/usr/bin/env node
// Regenerates class10-centroids.json ({class10 code: [lat, lon]}) from JMA's class10 polygons: node gen-centroids.mjs
import { writeFileSync } from 'node:fs';
import { BASE } from './jma.js';

const geo = await (await fetch(`${BASE}/common/const/geojson/class10s.json`)).json();
// Shoelace area and centroid of a polygon's outer ring, in lon/lat degrees (fine at this scale).
const ring = (r) => {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f;
  }
  return { a: Math.abs(a / 2), lon: x / (3 * a), lat: y / (3 * a) };
};
const out = {};
for (const { properties: { code }, geometry } of geo.features) {
  // Largest polygon only, so island groups don't put the pin in the sea.
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const c = polys.map((p) => ring(p[0])).reduce((m, r) => (r.a > m.a ? r : m));
  out[code] = [+c.lat.toFixed(3), +c.lon.toFixed(3)];
}
writeFileSync(new URL('./class10-centroids.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`${Object.keys(out).length} centroids written`);
