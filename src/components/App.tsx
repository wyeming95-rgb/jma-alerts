'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AREA_URL, CENTROIDS, COLORS, SEVERITY, SEVERITY_LABEL, ageHours, forecastUrl, getJson, jst, nearestOffice, parseForecast, parseWarnings, warningUrl,
  type AreaJson, type ForecastJson, type WarningJson,
} from '@/lib/jma';
import { NO_SHINDO_COLOR, QUAKE_LIST_URL, SHINDO, SHINDO_COLOR, parseQuakes, quakeRadius, shindoLabel, type Quake, type QuakeReport } from '@/lib/quake';
import { QUAKE_STALE_HOURS, WARNING_STALE_HOURS, toMarkdown } from '@/lib/report';
import type { Focus, Pin } from './MapView';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="map-canvas map-loading" aria-hidden /> });

type LatLon = [number, number];
type Feed<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const QUAKES_SHOWN = 12;
// Dark-text tones on light shindo/severity fills; light text elsewhere.
const LIGHT_FILLS = new Set(['1', '4', '5-', '5+', 'advisory', 'none']);
const depthText = (d: number | null) => (d === null ? '深さ不明' : d === 0 ? 'ごく浅い' : `${d} km`);
const magText = (m: number | null) => (m === null ? 'M不明' : `M${m.toFixed(1)}`);

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const LOCATE = 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z';
const DOWNLOAD = 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14';

function quakePopup(q: Quake) {
  return `<b>${esc(q.place)}</b>${q.placeEn ? ` <span class="pop-en">${esc(q.placeEn)}</span>` : ''}<br>${magText(q.mag)} · ${depthText(q.depthKm)} · 最大震度 ${shindoLabel(q.maxi)}<br><span class="pop-time">発生 ${jst(q.at)}</span>`;
}

function Stale({ what, iso, link }: { what: string; iso: string; link: string }) {
  const days = Math.max(1, Math.round(ageHours(iso) / 24));
  return (
    <p className="banner" role="status">
      <strong>{what}が {days} 日間更新されていません。</strong> JMA&apos;s {what === '警報データ' ? 'warning' : 'earthquake'} feed was last updated {jst(iso)} and may be frozen.{' '}
      Check <a href={link} target="_blank" rel="noopener">jma.go.jp</a> before relying on it.
    </p>
  );
}

function Failed({ what, error, retry }: { what: string; error: string; retry: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <p><strong>{what}を取得できませんでした。</strong> Couldn&apos;t load this feed ({error}). Other data is unaffected.</p>
      <button type="button" className="btn btn-quiet" onClick={retry}>再試行 Retry</button>
    </div>
  );
}

const Skeleton = ({ rows = 3 }: { rows?: number }) => (
  <ul className="list" aria-hidden>{Array.from({ length: rows }, (_, i) => <li key={i} className="skeleton" />)}</ul>
);

export default function App() {
  const [area, setArea] = useState<Feed<AreaJson>>({ state: 'loading' });
  const [centroids, setCentroids] = useState<Record<string, LatLon>>({});
  const [warnings, setWarnings] = useState<Record<string, Feed<WarningJson>>>({});
  const [quakes, setQuakes] = useState<Feed<Quake[]>>({ state: 'loading' });
  const [forecast, setForecast] = useState<Feed<ForecastJson>>({ state: 'loading' });
  const [office, setOffice] = useState('130000');
  const [only, setOnly] = useState('');
  const [user, setUser] = useState<LatLon | null>(null);
  const [status, setStatus] = useState('');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [allQuakes, setAllQuakes] = useState(false);

  const loadArea = useCallback(() => {
    setArea({ state: 'loading' });
    getJson<AreaJson>(AREA_URL).then((data) => setArea({ state: 'ok', data }), (e) => setArea({ state: 'error', error: msg(e) }));
    getJson<Record<string, LatLon>>(`${process.env.NEXT_PUBLIC_BASE_PATH}/class10-centroids.json`).then(setCentroids, () => setCentroids({}));
  }, []);

  const loadQuakes = useCallback(() => {
    setQuakes({ state: 'loading' });
    getJson<QuakeReport[]>(QUAKE_LIST_URL).then((l) => setQuakes({ state: 'ok', data: parseQuakes(l) }), (e) => setQuakes({ state: 'error', error: msg(e) }));
  }, []);

  // One request per office; each settles independently so one bad office never blanks the rest.
  const loadWarnings = useCallback((codes: string[]) => {
    setWarnings((w) => ({ ...w, ...Object.fromEntries(codes.map((c) => [c, { state: 'loading' }])) }));
    for (const c of codes) {
      getJson<WarningJson>(warningUrl(c)).then(
        (data) => setWarnings((w) => ({ ...w, [c]: { state: 'ok', data } })),
        (e) => setWarnings((w) => ({ ...w, [c]: { state: 'error', error: msg(e) } })),
      );
    }
  }, []);

  useEffect(() => { loadArea(); loadQuakes(); }, [loadArea, loadQuakes]);
  useEffect(() => { if (area.state === 'ok') loadWarnings(Object.keys(area.data.offices)); }, [area, loadWarnings]);

  const loadForecast = useCallback(() => {
    let live = true;
    setForecast({ state: 'loading' });
    getJson<ForecastJson>(forecastUrl(office)).then(
      (data) => live && setForecast({ state: 'ok', data }),
      (e) => live && setForecast({ state: 'error', error: msg(e) }),
    );
    return () => { live = false; }; // a newer office selection wins the race
  }, [office]);
  useEffect(loadForecast, [loadForecast]);

  const areaData = area.state === 'ok' ? area.data : null;
  const select = useCallback((code: string, ac = '') => {
    setOffice(code);
    setOnly(ac);
    setFocus((f) => ({ center: centroids[ac] || CENTROIDS[code], zoom: 8, popup: ac || undefined, n: (f?.n ?? 0) + 1 }));
  }, [centroids]);

  const pins = useMemo<Pin[]>(() => {
    if (!areaData) return [];
    const out: Pin[] = [];
    for (const [code, feed] of Object.entries(warnings)) {
      if (feed.state !== 'ok') continue;
      const alerts = parseWarnings(feed.data, areaData);
      for (const { code: ac } of feed.data.areaTypes?.[0]?.areas || []) {
        const c = centroids[ac];
        if (!c) continue;
        const mine = alerts.filter((a) => a.areaCode === ac);
        const severity = SEVERITY[Math.max(0, ...mine.map((a) => a.severity))];
        const m = areaData.class10s[ac];
        const names = [...new Set(mine.map((a) => `${esc(a.ja)} <span class="pop-en">${esc(a.en)}</span>`))];
        out.push({
          id: ac, title: `${m?.name || ac} ${SEVERITY_LABEL[severity]}`, lat: c[0], lon: c[1], severity, onClick: () => select(code, ac),
          popup: `<b>${esc(m?.name || ac)}</b> <span class="pop-en">${esc(m?.enName || '')}</span><br>${names.length ? names.join('<br>') : '発表なし <span class="pop-en">None</span>'}<br><span class="pop-time">発表 ${jst(feed.data.reportDatetime)}</span>`,
        });
      }
    }
    return out;
  }, [warnings, areaData, centroids, select]);

  const w = warnings[office];
  const alerts = areaData && w?.state === 'ok' ? parseWarnings(w.data, areaData).filter((a) => !only || a.areaCode === only) : [];
  const fc = forecast.state === 'ok' ? parseForecast(forecast.data).filter((f) => !only || f.code === only) : [];
  const quakeList = quakes.state === 'ok' ? quakes.data : [];
  const officeName = areaData?.offices[office]?.name ?? '';
  const warnLoaded = Object.values(warnings).filter((f) => f.state !== 'loading').length;
  const warnFailed = Object.values(warnings).filter((f) => f.state === 'error').length;

  function locate() {
    if (!navigator.geolocation) { setStatus('このブラウザは位置情報に対応していません。Pick an office below.'); return; }
    setStatus('現在地を取得中… Locating');
    navigator.geolocation.getCurrentPosition(({ coords: { latitude, longitude } }) => {
      const code = nearestOffice(latitude, longitude);
      setUser([latitude, longitude]);
      setStatus(`${latitude.toFixed(3)}, ${longitude.toFixed(3)} → nearest office ${areaData?.offices[code]?.name ?? code}`);
      select(code);
    }, (err) => setStatus(`位置情報エラー: ${err.message}. Pick an office below.`), { timeout: 15000 });
  }

  function exportReport() {
    if (!areaData) return;
    const md = toMarkdown({ office, area: areaData, warning: w?.state === 'ok' ? w.data : null, forecast: forecast.state === 'ok' ? forecast.data : null, quakes: quakes.state === 'ok' ? quakes.data : null });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `jma-${office}-${Date.now()}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href)); // revoking synchronously can cancel the download in Firefox/Safari
  }

  const latestQuake = quakeList[0];

  return (
    <div className="shell">
      <header className="top">
        <h1>気象警報・地震 <span>JMA alerts &amp; earthquakes</span></h1>
        <div className="controls">
          <button type="button" className="btn btn-primary" onClick={locate} id="locate"><Icon d={LOCATE} />現在地 <span className="en">Near me</span></button>
          <label className="field">
            <span>都道府県 Office</span>
            <select id="office" value={office} onChange={(e) => select(e.target.value)} disabled={!areaData}>
              {areaData ? Object.entries(areaData.offices).map(([c, o]) => <option key={c} value={c}>{o.name} {o.enName}</option>) : <option value={office}>読み込み中… Loading</option>}
            </select>
          </label>
          <label className="field">
            <span>地域 Area</span>
            <select id="area" value={only} onChange={(e) => { setOnly(e.target.value); if (e.target.value) select(office, e.target.value); }} disabled={!areaData}>
              <option value="">すべて All</option>
              {areaData?.offices[office]?.children.map((c) => <option key={c} value={c}>{areaData.class10s[c]?.name} {areaData.class10s[c]?.enName}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={exportReport} disabled={!areaData} id="export"><Icon d={DOWNLOAD} />Markdown report</button>
        </div>
        <p id="status" className="status" role="status" aria-live="polite">{status}</p>
      </header>

      <div className="map-wrap">
        <MapView pins={pins} quakes={quakeList} quakePopup={quakePopup} user={user} focus={focus} />
        <Legend />
      </div>

      <main className="content">
        {area.state === 'error' && <Failed what="地域データ" error={area.error} retry={loadArea} />}

        <section aria-labelledby="alerts-h" className="section">
          <div className="section-head">
            <h2 id="alerts-h">警報・注意報 <span className="en">Alerts</span></h2>
            <span className="meta">{officeName}{w?.state === 'ok' && <> · 発表 <time dateTime={w.data.reportDatetime}>{jst(w.data.reportDatetime)}</time></>}</span>
          </div>
          {w?.state === 'ok' && ageHours(w.data.reportDatetime) > WARNING_STALE_HOURS && <Stale what="警報データ" iso={w.data.reportDatetime} link="https://www.jma.go.jp/bosai/warning/" />}
          {w?.state === 'error' && <Failed what="警報データ" error={w.error} retry={() => loadWarnings([office])} />}
          {warnFailed > 0 && w?.state !== 'error' && <p className="note">{warnFailed} / {warnLoaded} offices failed to load; their map pins are missing.</p>}
          {!w || w.state === 'loading' ? <Skeleton /> : w.state === 'ok' && (
            <>
              {w.data.headlineText && <p className="headline">{w.data.headlineText}</p>}
              {alerts.length ? (
                <ul className="list" id="alerts">
                  {alerts.map((a, i) => {
                    const sev = SEVERITY[a.severity];
                    return (
                      <li key={i} className="item">
                        <button type="button" className="item-btn" onClick={() => select(office, a.areaCode)}>
                          <span className={`chip ${LIGHT_FILLS.has(sev) ? 'chip-dark' : ''}`} style={{ background: COLORS[sev] }}>{SEVERITY_LABEL[sev].split(' ')[0]}</span>
                          <span className="item-main"><b>{a.ja}</b> <span className="en">{a.en}</span><span className="sub">{a.areaName} {a.areaEn} · {a.status}</span></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty" id="alerts-empty">発表中の警報・注意報はありません。<span className="en">No active warnings or advisories{only ? ' for this area' : ''}. Green pins on the map mean the same.</span></p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="quakes-h" className="section">
          <div className="section-head">
            <h2 id="quakes-h">地震 <span className="en">Earthquakes</span></h2>
            <span className="meta">{quakes.state === 'ok' && <>{quakeList.length} 件 · 最新 {latestQuake ? <time dateTime={latestQuake.rdt}>{jst(latestQuake.rdt)}</time> : '—'}</>}</span>
          </div>
          {latestQuake && ageHours(latestQuake.rdt) > QUAKE_STALE_HOURS && <Stale what="地震データ" iso={latestQuake.rdt} link="https://www.jma.go.jp/bosai/map.html#contents=earthquake_map" />}
          {quakes.state === 'error' && <Failed what="地震データ" error={quakes.error} retry={loadQuakes} />}
          {quakes.state === 'loading' ? <Skeleton rows={4} /> : quakes.state === 'ok' && (quakeList.length ? (
            <>
              <ul className="list" id="quakes">
                {quakeList.slice(0, allQuakes ? undefined : QUAKES_SHOWN).map((q) => (
                  <li key={q.eid} className="item">
                    <button type="button" className="item-btn" onClick={() => setFocus((f) => ({ center: [q.lat, q.lon], zoom: 7, popup: `q:${q.eid}`, n: (f?.n ?? 0) + 1 }))}>
                      <span className={`shindo ${LIGHT_FILLS.has(q.maxi) || !q.maxi ? 'chip-dark' : ''}`} style={{ background: q.maxi ? SHINDO_COLOR[q.maxi] : NO_SHINDO_COLOR }} aria-label={`最大震度 ${shindoLabel(q.maxi)}`}>{shindoLabel(q.maxi).replace('弱', '-').replace('強', '+')}</span>
                      <span className="item-main"><b>{q.place}</b> <span className="en">{q.placeEn}</span><span className="sub"><time dateTime={q.at}>{jst(q.at)}</time></span></span>
                      <span className="nums"><span>{magText(q.mag)}</span><span className="sub">{depthText(q.depthKm)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
              {quakeList.length > QUAKES_SHOWN && (
                <button type="button" className="btn btn-quiet more" onClick={() => setAllQuakes((v) => !v)} aria-expanded={allQuakes}>
                  {allQuakes ? '少なく表示 Show fewer' : `すべて表示 Show all ${quakeList.length}`}
                </button>
              )}
            </>
          ) : <p className="empty">JMAの地震リストは空です。<span className="en">The earthquake feed loaded but lists no events.</span></p>)}
        </section>

        <section aria-labelledby="fc-h" className="section">
          <div className="section-head">
            <h2 id="fc-h">天気予報 <span className="en">Forecast</span></h2>
            <span className="meta">{forecast.state === 'ok' && <>発表 <time dateTime={forecast.data[0]?.reportDatetime}>{jst(forecast.data[0]?.reportDatetime)}</time></>}</span>
          </div>
          {forecast.state === 'error' && <Failed what="天気予報" error={forecast.error} retry={loadForecast} />}
          {forecast.state === 'loading' ? <Skeleton rows={2} /> : forecast.state === 'ok' && (fc.length ? (
            <dl className="forecast" id="forecast">
              {fc.map((f) => (
                <div key={f.code}>
                  <dt>{f.name}</dt>
                  {f.weathers.map((x, i) => <dd key={i}><time dateTime={f.times[i]}>{jst(f.times[i]).split(' ')[0]}</time> {x.replace(/　/g, ' ')}</dd>)}
                </div>
              ))}
            </dl>
          ) : <p className="empty">この地域の予報はありません。<span className="en">No forecast for this area.</span></p>)}
        </section>

        <footer className="credits">
          データ: 気象庁 Japan Meteorological Agency (bosai JSON, unofficial endpoints). Map © OpenStreetMap contributors. Not for safety decisions; check <a href="https://www.jma.go.jp/" target="_blank" rel="noopener">jma.go.jp</a>.
        </footer>
      </main>
    </div>
  );
}

function Legend() {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(window.matchMedia('(min-width: 860px)').matches), []);
  return (
    <details className="legend" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>凡例 <span className="en">Legend</span></summary>
      <div className="legend-body">
        <h3>警報・注意報 <span className="en">Alerts</span></h3>
        <ul className="legend-sev">
          {(['special', 'warning', 'advisory', 'none'] as const).map((s) => (
            <li key={s}><i style={{ background: COLORS[s] }} className={`dot dot-${s}`} />{SEVERITY_LABEL[s]}</li>
          ))}
        </ul>
        <h3>最大震度 <span className="en">Max intensity</span></h3>
        <ul className="legend-shindo">
          {SHINDO.map((s) => <li key={s} style={{ background: SHINDO_COLOR[s] }} className={LIGHT_FILLS.has(s) ? 'chip-dark' : ''}>{s}</li>)}
        </ul>
        <h3>マグニチュード <span className="en">Magnitude</span></h3>
        <ul className="legend-mag">
          {[3, 5, 7].map((m) => <li key={m}><i style={{ width: quakeRadius(m) * 2, height: quakeRadius(m) * 2 }} />M{m}</li>)}
        </ul>
      </div>
    </details>
  );
}
