import { useMemo, useState } from 'react';
import { CLOCK_RATES, formatUtc, useClockStore } from '@/state/clockStore';
import { useSceneStore } from '@/state/sceneStore';
import { useWorldStore } from '@/state/worldStore';
import { useEphemerisStore } from '@/solar-system/ephemerisDriver';
import { nextSunriseAt, sunElevationAt } from '@/solar-system/ephemeris';

/**
 * WorldClockBar — the time base of the environment: live UTC by default, a scene-set epoch (landing time), mission time
 * during playback, or a user-pinned date/rate. Shows what the Sun/Earth/sky geometry currently means for the focus site.
 */
export function WorldClockBar() {
  const epochMs = useClockStore((s) => s.epochMs);
  const mode = useClockStore((s) => s.mode);
  const rate = useClockStore((s) => s.rate);
  const source = useClockStore((s) => s.source);
  const setLive = useClockStore((s) => s.setLive);
  const setFixed = useClockStore((s) => s.setFixed);
  const setRate = useClockStore((s) => s.setRate);
  const g = useEphemerisStore((s) => s.geometry);
  const focus = useSceneStore((s) => s.config?.focus ?? null);
  const lightingMode = useWorldStore((s) => s.lightingMode);
  const nightAid = useWorldStore((s) => s.nightAid);
  const setWorld = useWorldStore((s) => s.set);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // Sun at the focus site (spherical Moon) — recomputed at the HUD rate only
  const site = useMemo(() => {
    if (!focus) return null;
    const elev = sunElevationAt(g, focus.latitude, focus.longitude);
    return { elev, night: elev < 0 };
  }, [g, focus]);
  const sunriseKey = site?.night ? `${focus?.latitude},${focus?.longitude},${Math.round(epochMs / 3_600_000)}` : null;
  const sunrise = useMemo(() => (sunriseKey && focus ? nextSunriseAt(epochMs, focus.latitude, focus.longitude) : null), [sunriseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const phase = g.moonIlluminatedFraction;
  const phaseName = phase < 0.03 ? 'new' : phase < 0.47 ? 'crescent/quarter' : phase < 0.53 ? 'quarter' : phase < 0.97 ? 'gibbous' : 'full';

  const commit = () => {
    const ms = Date.parse(draft.endsWith('Z') || draft.includes('+') ? draft : draft + 'Z');
    if (!isNaN(ms)) setFixed(ms, { rate: 0, source: 'you' });
    setEditing(false);
  };

  return (
    <div className={`clockbar mono ${mode}`} data-testid="world-clock">
      <span className={`clock-mode ${mode}`} title={source}>{mode === 'live' ? '● LIVE' : mode === 'mission' ? '▶ MISSION TIME' : rate ? `▶ ${rateLabel(rate)}` : '❚❚ FIXED'}</span>
      {editing ? (
        <input autoFocus className="clock-input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} placeholder="YYYY-MM-DDTHH:MM:SSZ" />
      ) : (
        <button className="clock-time" title={`${source} · click to set a UTC date/time`} onClick={() => { setDraft(new Date(epochMs).toISOString().slice(0, 19) + 'Z'); setEditing(true); }}>{formatUtc(epochMs)}</button>
      )}
      <span className="clock-rates">
        {CLOCK_RATES.map((r) => (
          <button key={r.rate} className={`chip ${mode !== 'live' && mode !== 'mission' && rate === r.rate ? 'on' : ''}`} disabled={mode === 'mission'} title={`run the world clock at ${r.label}`} onClick={() => setRate(r.rate)}>{r.label}</button>
        ))}
        <button className={`chip ${mode === 'live' ? 'on' : ''}`} onClick={setLive} title="back to the real current time">now</button>
      </span>
      <span className="sep" />
      <span className="dim" title="sub-solar point on the Moon (IAU frame) · Earth–Moon distance · Moon phase seen from Earth">
        ☀ {g.subSolarLat.toFixed(1)}°, {g.subSolarLon.toFixed(1)}° · ⊕ {Math.round(g.earthDistanceKm).toLocaleString('en-US')} km · phase {Math.round(phase * 100)}% {phaseName}
      </span>
      {site && (
        <span className={site.night ? 'clock-night' : 'clock-day'} title="Sun elevation at the scene focus (spherical Moon, no terrain horizon)">
          {site.night ? '☾ lunar night at focus' : '☀ Sun'} {site.elev.toFixed(1)}°{site.night && sunrise ? ` · sunrise ${formatUtc(sunrise, false)}` : ''}
          {site.night && sunrise && <button className="chip" onClick={() => setFixed(sunrise + 6 * 3_600_000, { rate: 0, source: 'sunrise + 6 h at focus' })} title="jump to 6 h after local sunrise">jump</button>}
          {site.night && lightingMode === 'ephemeris' && (
            <label className="chip" title="boosted earthshine so the dark side stays readable (declared visualization aid)">
              <input type="checkbox" checked={nightAid} onChange={(e) => setWorld({ nightAid: e.target.checked })} /> night aid
            </label>
          )}
        </span>
      )}
      <span className="grow" />
      <span className="dim">{lightingMode === 'ephemeris' ? 'Sun · Earth · sky from ephemeris (Meeus/IAU 2009, ±0.05° vs JPL)' : lightingMode === 'auto' ? 'visualization lighting (not the real Sun)' : 'manual lighting'}</span>
    </div>
  );
}

function rateLabel(rate: number) {
  return CLOCK_RATES.find((r) => r.rate === rate)?.label ?? `${rate}×`;
}
