'use client';
// Imperative Leaflet map. Loaded via next/dynamic with ssr:false because Leaflet touches window on import.
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { Severity } from '@/lib/jma';

const SEV_Z: Record<Severity, number> = { none: 0, advisory: 100, warning: 200, special: 300 };
import { NO_SHINDO_COLOR, SHINDO_COLOR, quakeRadius, type Quake } from '@/lib/quake';

export interface Pin { id: string; title: string; lat: number; lon: number; severity: Severity; popup: string; onClick: () => void }
export interface Focus { center: [number, number]; zoom: number; popup?: string; n: number }

interface Props { pins: Pin[]; quakes: Quake[]; quakePopup: (q: Quake) => string; user: [number, number] | null; focus: Focus | null }

export default function MapView({ pins, quakes, quakePopup, user, focus }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ alerts: L.LayerGroup; quakes: L.LayerGroup; user: L.LayerGroup } | null>(null);
  const markers = useRef(new Map<string, L.Layer>());

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, worldCopyJump: true }).setView([36.5, 137.5], 5);
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    const g = { alerts: L.layerGroup().addTo(m), quakes: L.layerGroup().addTo(m), user: L.layerGroup().addTo(m) };
    L.control.layers(undefined, { '警報・注意報 Alerts': g.alerts, '地震 Earthquakes': g.quakes }, { position: 'topright' }).addTo(m);
    map.current = m;
    layers.current = g;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layers.current!.alerts;
    g.clearLayers();
    // Alert areas are squares so they never read as quake circles.
    for (const p of pins) {
      const size = p.severity === 'none' ? 9 : 14;
      const mk = L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: `pin pin-${p.severity}`, iconSize: [size, size], html: '' }),
        keyboard: false, zIndexOffset: SEV_Z[p.severity], title: p.title,
      }).bindPopup(p.popup).on('click', p.onClick);
      mk.addTo(g);
      markers.current.set(p.id, mk);
    }
  }, [pins]);

  useEffect(() => {
    const g = layers.current!.quakes;
    g.clearLayers();
    const newest = quakes[0] && Date.now() - +new Date(quakes[0].at) < 864e5 ? quakes[0].eid : null;
    // Draw small, old quakes first so big ones stay clickable on top.
    for (const q of [...quakes].reverse()) {
      const mk = L.circleMarker([q.lat, q.lon], {
        radius: quakeRadius(q.mag), weight: 1.25, color: '#1c1c1c', opacity: 0.8,
        fillColor: q.maxi ? SHINDO_COLOR[q.maxi] ?? NO_SHINDO_COLOR : NO_SHINDO_COLOR, fillOpacity: 0.75,
        className: q.eid === newest ? 'quake quake-newest' : 'quake',
      }).bindPopup(quakePopup(q));
      mk.addTo(g);
      markers.current.set(`q:${q.eid}`, mk);
    }
  }, [quakes, quakePopup]);

  useEffect(() => {
    const g = layers.current!.user;
    g.clearLayers();
    if (user) L.circleMarker(user, { radius: 7, weight: 3, color: '#fff', fillColor: '#3b5bdb', fillOpacity: 1, className: 'you' }).bindTooltip('現在地 / You').addTo(g);
  }, [user]);

  useEffect(() => {
    if (!focus || !map.current) return;
    map.current.setView(focus.center, focus.zoom);
    if (focus.popup) markers.current.get(focus.popup)?.openPopup();
  }, [focus]);

  return <div ref={el} className="map-canvas" role="region" aria-label="地図 Map of alerts and earthquakes" />;
}
