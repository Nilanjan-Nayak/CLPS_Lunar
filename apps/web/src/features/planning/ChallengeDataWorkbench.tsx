import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import type { HorizonsComparison, HorizonsSample, PlanInput, PlanResult } from '@/types/domain';
import { CHALLENGE_BRIEF, quickMapSiteUrl } from './challengeResources';

const roundSign = (n: number, places = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(places)}°`;
const utcLabel = (s: string) => `${s.replace('T', ' ').replace(/Z$/, '').slice(0, 19)} UTC`;
const percentage = (n: number) => `${(100 * n).toFixed(1)}%`;

/** A real Moon Trek WMTS tile at the active site, with its marker in geographic tile coordinates. */
function SiteImage({ lat, lon }: { lat: number; lon: number }) {
  const [failed, setFailed] = useState(false);
  const z = 6;
  const widthDeg = 180 / 2 ** z;
  const rows = 2 ** z, cols = 2 ** (z + 1);
  const xFloat = Math.max(0, Math.min(cols - 1e-8, (lon + 180) / widthDeg));
  const yFloat = Math.max(0, Math.min(rows - 1e-8, (90 - lat) / widthDeg));
  const x = Math.floor(xFloat), y = Math.floor(yFloat);
  const url = `/api/v1/lunar/imagery/lroc-wac/${z}/${y}/${x}.jpg`;
  useEffect(() => { setFailed(false); }, [url]);
  // The crosshair is clipped to the image frame at an exact pole/tile edge.
  const left = `${Math.max(1, Math.min(99, (xFloat - x) * 100))}%`;
  const top = `${Math.max(1, Math.min(99, (yFloat - y) * 100))}%`;
  return (
    <div className="challenge-site-image" aria-label="Moon Trek LROC WAC image tile of the active landing site">
      {!failed ? <img src={url} alt="LROC WAC lunar mosaic tile from NASA Moon Trek" onError={() => setFailed(true)} /> : (
        <span className="challenge-image-error">Moon Trek image temporarily unavailable</span>
      )}
      {!failed && <span className="challenge-site-crosshair" style={{ left, top }} aria-hidden="true"><i /></span>}
      <span className="challenge-image-label">MOON TREK · LROC WAC</span>
    </div>
  );
}

function VisibilityStrip({ samples, target }: { samples: HorizonsSample[]; target: 'sun' | 'earth' }) {
  const isSun = target === 'sun';
  return (
    <div className="horizons-strip-row">
      <span>{isSun ? 'Sun' : 'Earth'}</span>
      <div className="horizons-strip" aria-hidden="true">
        {samples.slice(0, -1).map((s, i) => {
          const current = isSun ? s.sunClearanceDeg : s.earthClearanceDeg;
          const next = isSun ? samples[i + 1].sunClearanceDeg : samples[i + 1].earthClearanceDeg;
          const above = (current + next) / 2 > 0;
          return <i key={s.utc} className={above ? (isSun ? 'sun-up' : 'earth-up') : ''} title={`${utcLabel(s.utc)} · ${above ? 'above' : 'below'} terrain (sampled)`} />;
        })}
      </div>
    </div>
  );
}

function HorizonResults({ result }: { result: HorizonsComparison }) {
  const s = result.atLanding;
  const meta = [
    { label: 'SUN', elevation: s.sunElevationDeg, azimuth: s.sunAzimuthDeg, horizon: s.sunHorizonDeg, clearance: s.sunClearanceDeg, visible: s.sunVisible, delta: result.localMinusHorizonsDeg.sunElevation },
    { label: 'EARTH', elevation: s.earthElevationDeg, azimuth: s.earthAzimuthDeg, horizon: s.earthHorizonDeg, clearance: s.earthClearanceDeg, visible: s.earthVisible, delta: result.localMinusHorizonsDeg.earthElevation },
  ];
  return (
    <div className="horizons-results" data-testid="horizons-results">
      <div className="horizons-result-head">
        <span><b>JPL response</b> · {result.sunEphemeris} / {result.earthEphemeris}</span>
        <span className="horizons-live">ONLINE CHECK</span>
      </div>
      <p className="horizons-time">Landing {utcLabel(result.startUtc)} · retrieved {utcLabel(result.retrievedAtUtc)}</p>
      <div className="horizons-angles">
        {meta.map((item) => (
          <div key={item.label} className="horizons-angle">
            <div className="horizons-angle-head"><b>{item.label}</b><span className={item.visible ? 'above' : 'blocked'}>{item.visible ? 'ABOVE TERRAIN' : 'BELOW TERRAIN'}</span></div>
            <strong>{roundSign(item.elevation)}</strong><span className="horizons-az"> elev · {item.azimuth.toFixed(1)}° az</span>
            <small>Horizon {roundSign(item.horizon)} · clearance {roundSign(item.clearance)}</small>
            <small>Local model − JPL elevation: {roundSign(item.delta, 3)}</small>
          </div>
        ))}
      </div>
      <div className="horizons-summary" aria-label="Sampled JPL and LOLA visibility over the checked interval">
        <div><span>SUN ABOVE TERRAIN</span><strong>{percentage(result.summary.sunlitFraction)}</strong></div>
        <div><span>EARTH ABOVE TERRAIN</span><strong>{percentage(result.summary.earthVisibleFraction)}</strong></div>
        <div><span>BOTH ABOVE TERRAIN</span><strong>{percentage(result.summary.bothVisibleFraction)}</strong></div>
      </div>
      <div className="horizons-timeline" aria-label={`Sun and Earth visibility timeline: ${result.stepHours}-hour samples`}>
        <VisibilityStrip samples={result.series} target="sun" />
        <VisibilityStrip samples={result.series} target="earth" />
        <div className="horizons-timeline-ends"><span>{result.startUtc.slice(0, 10)}</span><span>{result.endUtc.slice(0, 10)}</span></div>
      </div>
      <p className="horizons-caveat">
        {result.summary.sampleCount} samples, {result.stepHours}h apart; crossings are interpolated and short windows may be missed.
        Centre-of-body visibility only: eclipses, battery and relay are not included. Plan results still use the local analytical ephemeris.
      </p>
      <p className="horizons-caveat">
        Horizon: {result.site.horizonGrade ?? 'regional'} · {result.site.horizonResolutionM ? `${result.site.horizonResolutionM} m/px` : 'resolution unavailable'}{result.site.horizonFallbackResolutionM ? `; ${result.site.horizonFallbackResolutionM} m/px outside polar coverage` : ''} · observer {result.site.observerHeightM} m above terrain. Not flight-certified.
      </p>
    </div>
  );
}

export function ChallengeDataWorkbench({ input, plan, compact }: { input: PlanInput; plan?: PlanResult | null; compact: boolean }) {
  const lat = input.latitude, lon = input.longitude;
  const validSite = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const hasMatchingPlan = !!plan && Math.abs(plan.input.latitude - lat) < 1e-7 && Math.abs(plan.input.longitude - lon) < 1e-7;
  const terrain = hasMatchingPlan ? plan?.site.terrain : undefined;
  const landingUtc = hasMatchingPlan ? plan?.ephemeris?.calendar.landingUtc : undefined;
  const missionDays = hasMatchingPlan ? plan?.input.surfaceDays ?? 14 : 14;
  // The upstream comparison uses whole days and is capped at 45; disclose if
  // the checked interval differs from the actual mission duration.
  const days = Math.max(1, Math.min(45, Math.round(missionDays)));
  const intervalDiffers = days !== missionDays;
  const [result, setResult] = useState<HorizonsComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => {
    requestId.current += 1;
    setResult(null);
    setLoading(false);
    setError(null);
  }, [lat, lon, landingUtc, days]);
  useEffect(() => () => { requestId.current += 1; }, []);

  const compare = async () => {
    if (!landingUtc || !validSite || !hasMatchingPlan || loading) return;
    const id = ++requestId.current;
    setLoading(true); setError(null); setResult(null);
    try {
      const next = await api.researchHorizons(lat, lon, landingUtc, days);
      if (id === requestId.current) setResult(next);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Horizons could not be reached. Local planning remains available.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  return (
    <section className={`challenge-console${compact ? ' challenge-console-compact' : ''}`} aria-label="NASA Challenge data workbench">
      <div className="challenge-console-head">
        <div>
          <div className="challenge-eyebrow"><span className="challenge-pulse" /> NASA SPACE APPS 2026 · DATA WORKBENCH</div>
          <h2>One site. The challenge’s core resources.</h2>
          <p>Map the target, inspect LOLA terrain, and check Sun / Earth visibility against JPL Horizons.</p>
        </div>
        <Link to="/sources" className="challenge-all-link">Challenge resources <span>→</span></Link>
      </div>
      <div className="challenge-pipeline" aria-label="Challenge resource workflow">
        <a href={validSite ? quickMapSiteUrl(lat, lon) : 'https://quickmap.lroc.im-ldi.com/'} target="_blank" rel="noreferrer" data-testid="quickmap-site-link">
          <span className="challenge-num">01</span><span><b>QuickMap</b><small>Open target map ↗</small></span>
        </a>
        <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">
          <span className="challenge-num">02</span><span><b>Moon Trek</b><small>Streamed imagery ↗</small></span>
        </a>
        <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm" target="_blank" rel="noreferrer">
          <span className="challenge-num">03</span><span><b>LOLA terrain</b><small>Horizon &amp; slope ↗</small></span>
        </a>
        <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">
          <span className="challenge-num">04</span><span><b>JPL Horizons</b><small>Online ephemeris ↗</small></span>
        </a>
      </div>
      <div className="challenge-workbench">
        <div className="challenge-terrain-card">
          {validSite ? <SiteImage lat={lat} lon={lon} /> : <div className="challenge-site-image challenge-image-error">Enter valid coordinates</div>}
          <div className="challenge-terrain-info">
            <span className="challenge-card-kicker">ACTIVE LANDING SITE</span>
            <strong className="challenge-site-coords">{validSite ? `${lat.toFixed(4)}°, ${lon.toFixed(4)}°` : 'Invalid coordinates'}</strong>
            <p>Actual LROC WAC image via Moon Trek; crosshair marks the target in an equirectangular tile. Dark or blank areas may be shadows or gaps in coverage.</p>
            {terrain ? (
              <div className="challenge-terrain-values">
                <span><b>{terrain.elevationM.toFixed(0)} m</b><small>LOLA elevation</small></span>
                <span><b>{terrain.slopeDeg.toFixed(1)}°</b><small>sampled slope</small></span>
              </div>
            ) : <p className="challenge-waiting">Terrain analysis appears after the plan is computed.</p>}
            {terrain && <p className="challenge-resolution">{terrain.grade ?? 'LOLA-derived'} · {terrain.resolutionM ? `${terrain.resolutionM} m/px` : 'see plan for resolution'}</p>}
            <a className="challenge-inline-link" href={validSite ? quickMapSiteUrl(lat, lon) : 'https://quickmap.lroc.im-ldi.com/'} target="_blank" rel="noreferrer">Inspect this area in QuickMap ↗</a>
          </div>
        </div>
        <div className="horizons-check-card">
          <div className="horizons-check-top">
            <div>
              <span className="challenge-card-kicker">ON-DEMAND NASA CROSS-CHECK</span>
              <h3>JPL Horizons + LOLA horizon</h3>
              <p>{landingUtc ? `Active landing: ${utcLabel(landingUtc)} · comparison: ${days} ${days === 1 ? 'day' : 'days'}` : 'Run the plan to set a landing time and mission duration.'}</p>
              {landingUtc && intervalDiffers && <p>Mission duration: {missionDays} days. The comparison is rounded to whole days and limited to 45.</p>}
            </div>
            <span className="horizons-source-chip">JPL × LOLA</span>
          </div>
          <p className="horizons-explainer">Fetch Sun and Earth positions for this site and compare them with the terrain skyline. This checks the plan; it does not overwrite it.</p>
          <button type="button" className="btn primary horizons-button" disabled={!landingUtc || !validSite || loading} onClick={compare}>
            {loading ? 'Fetching JPL Horizons…' : result ? 'Refresh JPL comparison' : 'Run JPL Horizons check'}
          </button>
          <div aria-live="polite">
            {loading && <p className="horizons-state">Requesting two observer tables from NASA JPL…</p>}
            {error && <p className="horizons-error" role="alert">{error} The local plan remains available; try again later.</p>}
            {result && <HorizonResults result={result} />}
          </div>
        </div>
      </div>
      <div className="challenge-console-foot">
        <span>LOLA resolution varies by location · QuickMap is an external inspection handoff.</span>
        <span><a href="https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" target="_blank" rel="noreferrer">CSA partner context ↗</a> · <a href={CHALLENGE_BRIEF} target="_blank" rel="noreferrer">Official challenge ↗</a></span>
      </div>
    </section>
  );
}
