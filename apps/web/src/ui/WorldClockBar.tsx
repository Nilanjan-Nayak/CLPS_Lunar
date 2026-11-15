import { useMemo, useState } from 'react';
import { CLOCK_RATES, formatUtc, useClockStore } from '@/state/clockStore';
import { useSceneStore } from '@/state/sceneStore';
import { useWorldStore } from '@/state/worldStore';
import { useEphemerisStore } from '@/solar-system/ephemerisDriver';
import { nextSunriseAt, sunElevationAt } from '@/solar-system/ephemeris';

/**
 * World clock — the time base of the environment: live UTC by default, a scene-set epoch (landing time), mission time
 * during playback, or a user-pinned date/rate. Split in two dock clusters:
 *   • <ClockControls/>  mode · editable UTC · rate menu · "now"
 *   • <EnvReadout/>     what the Sun/Earth/sky geometry currently means (sub-solar point, Earth distance, phase, focus-site Sun)
 * <WorldClockBar/> keeps the single-row form for places that still want it.
 */
export function ClockControls() {
  const epochMs = useClockStore((s) => s.epochMs);
  const mode = useClockStore((s) => s.mode);
  const rate = useClockStore((s) => s.rate);
  const source = useClockStore((s) => s.source);
  const setLive = useClockStore((s) => s.setLive);
  const setFixed = useClockStore((s) => s.setFixed);
  const setRate = useClockStore((s) => s.setRate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const ms = Date.parse(draft.endsWith('Z') || draft.includes('+') ? draft : draft + 'Z');
    if (!isNaN(ms)) setFixed(ms, { rate: 0, source: 'you' });
    setEditing(false);
  };
  const rateValue = mode === 'live' ? 1 : mode === 'mission' ? -1 : rate;
  return (
    <div className={`clockbar mono ${mode}`} data-testid="world-clock">
      <span className={`clock-mode ${mode}`} title={mode === 'mission' ? `${source} — the clock follows the mission playback` : source}>{mode === 'live' ? '● LIVE' : mode === 'mission' ? '▶ MISSION' : rate ? '▶ RUNNING' : '❚❚ FIXED'}</span>
      {editing ? (
        <input autoFocus className="clock-input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} placeholder="YYYY-MM-DDTHH:MM:SSZ" />
      ) : (
        <button className="clock-time" title={`${source} · click to set a UTC date/time`} onClick={() => { setDraft(new Date(epochMs).toISOString().slice(0, 19) + 'Z'); setEditing(true); }}>{formatUtc(epochMs)}</button>
      )}
      {mode !== 'mission' && (
        <label className="clock-rate" title="run the world clock at this rate (leaves LIVE)">
          <select aria-label="clock rate" value={rateValue} onChange={(e) => setRate(Number(e.target.value))}>
            {CLOCK_RATES.map((r) => <option key={r.rate} value={r.rate}>{r.label}</option>)}
          </select>
        </label>
      )}
      {mode === 'fixed' && <button className="chip" onClick={setLive} title="back to the real current time">now</button>}
    </div>
  );
}

export function EnvReadout() {
  const epochMs = useClockStore((s) => s.epochMs);
  const setFixed = useClockStore((s) => s.setFixed);
  const g = useEphemerisStore((s) => s.geometry);
  const focus = useSceneStore((s) => s.config?.focus ?? null);
  const lightingMode = useWorldStore((s) => s.lightingMode);
  const nightAid = useWorldStore((s) => s.nightAid);
  const setWorld = useWorldStore((s) => s.set);

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
  return (
    <div className="envbar mono" title="environment for the world-clock time">
      {site && (
        <span className={`env-item ${site.night ? 'clock-night' : 'clock-day'}`} title="Sun elevation at the scene focus (spherical Moon, no terrain horizon)">
          {site.night ? '☾ focus night' : '☀ focus Sun'} <b>{site.elev.toFixed(1)}°</b>
          {site.night && sunrise && <> · rise {formatUtc(sunrise, false).slice(5)} <button className="chip" onClick={() => setFixed(sunrise + 6 * 3_600_000, { rate: 0, source: 'sunrise + 6 h at focus' })} title="jump to 6 h after local sunrise">jump</button></>}
          {site.night && lightingMode === 'ephemeris' && (
            <label className="chip" title="boosted earthshine so the dark side stays readable (declared visualization aid)">
              <input type="checkbox" checked={nightAid} onChange={(e) => setWorld({ nightAid: e.target.checked })} /> night aid
            </label>
          )}
        </span>
      )}
      <span className="env-item" title="Earth–Moon distance">⊕ <b>{Math.round(g.earthDistanceKm).toLocaleString('en-US')} km</b></span>
      {!site && <span className="env-item" title="sub-solar point on the Moon (IAU frame)">☀ <b>{g.subSolarLat.toFixed(1)}°, {g.subSolarLon.toFixed(1)}°</b></span>}
      {!site && <span className="env-item low" title="Moon phase seen from Earth">☾ <b>{Math.round(phase * 100)}%</b> {phaseName}</span>}
    </div>
  );
}

export function WorldClockBar() {
  return (
    <div className="clock-row">
      <ClockControls />
      <EnvReadout />
    </div>
  );
}
