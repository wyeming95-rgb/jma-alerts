// JMA earthquake list (bosai/quake/data/list.json). One event (eid) has several reports; we merge them.
import { BASE } from './jma';

export const QUAKE_LIST_URL = `${BASE}/quake/data/list.json`;
export const quakeDetailUrl = (json: string) => `${BASE}/quake/data/${json}`;

export interface QuakeReport { eid: string; rdt: string; at: string; ttl: string; en_ttl?: string; anm: string; en_anm?: string; cod: string; mag: string; maxi: string; json: string }
export interface Quake { eid: string; at: string; rdt: string; place: string; placeEn: string; lat: number; lon: number; depthKm: number | null; mag: number | null; maxi: string; title: string; detailUrl: string }

// ISO 6709 "+35.7+140.7-50000/": lat, lon, altitude in metres (negative = depth). Far-field quakes omit altitude.
export function parseCod(cod: string): { lat: number; lon: number; depthKm: number | null } | null {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+)?\/?$/.exec(cod || '');
  if (!m) return null;
  return { lat: +m[1], lon: +m[2], depthKm: m[3] === undefined ? null : Math.abs(+m[3]) / 1000 };
}

// The list is newest-first, so the first non-empty value per event is the latest revision.
export function parseQuakes(list: QuakeReport[]): Quake[] {
  const byId = new Map<string, QuakeReport[]>();
  for (const r of list) byId.set(r.eid, [...(byId.get(r.eid) || []), r]);
  const out: Quake[] = [];
  for (const [eid, rs] of byId) {
    const pick = <K extends keyof QuakeReport>(k: K) => rs.find((r) => r[k])?.[k] ?? '';
    const pos = parseCod(pick('cod') as string);
    if (!pos) continue; // e.g. 震度速報-only or Nankai Trough commentary: no hypocentre to plot
    const mag = parseFloat(pick('mag') as string);
    const src = rs.find((r) => r.cod) || rs[0];
    out.push({
      eid, at: src.at, rdt: rs[0].rdt, place: pick('anm') as string, placeEn: (pick('en_anm') as string) || '',
      ...pos, mag: Number.isFinite(mag) ? mag : null, maxi: pick('maxi') as string,
      title: rs[0].ttl, detailUrl: quakeDetailUrl(rs[0].json),
    });
  }
  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

// JMA shindo scale and JMA's own intensity colours.
export const SHINDO = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'] as const;
export const SHINDO_LABEL: Record<string, string> = { '5-': '5弱', '5+': '5強', '6-': '6弱', '6+': '6強' };
export const SHINDO_COLOR: Record<string, string> = {
  '1': '#f2f2ff', '2': '#00aaff', '3': '#0041ff', '4': '#fae696', '5-': '#ffe600', '5+': '#ff9900', '6-': '#ff2800', '6+': '#a50021', '7': '#b40068',
};
export const NO_SHINDO_COLOR = '#9a9aa6';
export const shindoLabel = (s: string) => (s ? SHINDO_LABEL[s] || s : '—');
export const quakeRadius = (mag: number | null) => (mag === null ? 4 : Math.max(4, 2 + mag * 2.4));
