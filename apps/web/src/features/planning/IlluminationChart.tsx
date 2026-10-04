import { useMemo } from 'react';
import type { PlanResult } from '@/types/domain';

/**
 * IlluminationChart — Sun (amber) and Earth (blue) elevation at the site over the whole mission calendar, from the
 * research engine's ephemeris samples (Meeus + IAU 2009 model, ≤0.05° vs JPL Horizons). Shaded bands: surface-operations window;
 * hatched marks: Sun below the terrain horizon (LOLA GDR DEM) while nominally above the geometric horizon.
 */
export function IlluminationChart({ plan, cursorT, height = 150 }: { plan: PlanResult; cursorT?: number; height?: number }) {
  const eph = plan.ephemeris;
  const W = 320; const H = height; const L = 30; const R = 8; const T = 10; const B = 22;
  const m = useMemo(() => {
    if (!eph) return null;
    const s = eph.samples; const tMax = s[s.length - 1].t ?? 1;
    const yMax = Math.max(15, ...s.map((p) => Math.max(p.sunElevationDeg, p.earthElevationDeg))) + 5;
    const yMin = Math.min(-15, ...s.map((p) => Math.min(p.sunElevationDeg, p.earthElevationDeg))) - 5;
    const x = (t: number) => L + (t / tMax) * (W - L - R);
    const y = (deg: number) => T + (1 - (deg - yMin) / (yMax - yMin)) * (H - T - B);
    const path = (key: 'sunElevationDeg' | 'earthElevationDeg') => s.map((p, i) => `${i ? 'L' : 'M'}${x(p.t ?? 0).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const surface = plan.timeline.phases.find((p) => p.id === 'surface');
    const landing = plan.timeline.phases.find((p) => p.id === 'landing');
    const masked = s.filter((p) => p.sunElevationDeg > 0 && p.sunVisible === false);
    return { s, tMax, yMax, yMin, x, y, sun: path('sunElevationDeg'), earth: path('earthElevationDeg'), surface, landing, masked };
  }, [eph, plan.timeline.phases]);
  if (!eph || !m) return null;
  const days = Math.ceil(m.tMax / 86400);
  const step = [1, 2, 3, 5, 7, 10, 14, 20, 30].find((st) => days / st <= 9) ?? 30;
  const dayTicks = Array.from({ length: Math.floor(days / step) + 1 }, (_, i) => i * step);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sun and Earth elevation at the site over the mission" style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 8.5 }}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.12)" />
      {m.surface && <rect x={m.x(m.surface.startS)} y={T} width={m.x(m.surface.endS) - m.x(m.surface.startS)} height={H - T - B} fill="rgba(94,234,212,0.08)" />}
      {m.landing && <line x1={m.x(m.landing.endS)} x2={m.x(m.landing.endS)} y1={T} y2={H - B} stroke="#c084fc" strokeDasharray="2 2" />}
      <line x1={L} x2={W - R} y1={m.y(0)} y2={m.y(0)} stroke="rgba(255,255,255,0.35)" />
      {m.masked.map((p, i) => <line key={i} x1={m.x(p.t ?? 0)} x2={m.x(p.t ?? 0)} y1={m.y(0)} y2={m.y(p.sunElevationDeg)} stroke="rgba(248,113,113,0.6)" strokeWidth={1.2} />)}
      <path d={m.earth} fill="none" stroke="#60a5fa" strokeWidth={1.2} strokeDasharray="3 2" />
      <path d={m.sun} fill="none" stroke="#fbbf24" strokeWidth={1.6} />
      {cursorT != null && cursorT >= 0 && <line x1={m.x(cursorT)} x2={m.x(cursorT)} y1={T} y2={H - B} stroke="#5eead4" strokeWidth={1} />}
      <text x={L - 3} y={m.y(m.yMax - 2) + 3} textAnchor="end" fill="rgba(255,255,255,0.6)">{Math.round(m.yMax - 2)}°</text>
      <text x={L - 3} y={m.y(0) + 3} textAnchor="end" fill="rgba(255,255,255,0.6)">0°</text>
      <text x={L - 3} y={m.y(m.yMin + 2) + 3} textAnchor="end" fill="rgba(255,255,255,0.6)">{Math.round(m.yMin + 2)}°</text>
      {dayTicks.map((d) => <text key={d} x={m.x(d * 86400)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.5)">{d}d</text>)}
      <text x={W - R} y={T + 9} textAnchor="end" fill="#fbbf24">☀ Sun</text>
      <text x={W - R} y={T + 19} textAnchor="end" fill="#60a5fa">⊕ Earth</text>
      {m.surface && <text x={m.x(m.surface.startS) + 3} y={H - B - 4} fill="#5eead4">surface ops</text>}
    </svg>
  );
}

/** Small strip chart of the terrain horizon (elevation vs azimuth) from the LOLA GDR DEM. */
export function HorizonStrip({ plan, height = 60 }: { plan: PlanResult; height?: number }) {
  const h = plan.site.horizon;
  if (!h) return null;
  const W = 320; const H = height; const L = 26; const R = 6; const T = 6; const B = 14;
  const max = Math.max(5, ...h.elevationDeg) + 1;
  const x = (az: number) => L + (az / 360) * (W - L - R);
  const y = (deg: number) => T + (1 - Math.max(0, deg) / max) * (H - T - B);
  const pts = h.elevationDeg.map((e, i) => `${x(i * h.azimuthStepDeg).toFixed(1)},${y(e).toFixed(1)}`);
  const sun = plan.ephemeris?.atLanding; const earth = plan.ephemeris?.atLanding;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Terrain horizon by azimuth" style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 8 }}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.12)" />
      <polygon points={`${x(0)},${y(0)} ${pts.join(' ')} ${x(360)},${y(h.elevationDeg[0])} ${x(360)},${y(0)}`} fill="rgba(148,163,184,0.35)" stroke="rgba(226,232,240,0.8)" strokeWidth={1} />
      {sun && <circle cx={x(sun.sunAzimuthDeg)} cy={y(sun.sunElevationDeg)} r={3} fill="#fbbf24"><title>Sun at landing</title></circle>}
      {earth && earth.earthElevationDeg <= max && <circle cx={x(earth.earthAzimuthDeg)} cy={y(earth.earthElevationDeg)} r={3} fill="#60a5fa"><title>Earth at landing</title></circle>}
      {[0, 90, 180, 270, 360].map((az) => <text key={az} x={x(az)} y={H - 3} textAnchor="middle" fill="rgba(255,255,255,0.5)">{['N', 'E', 'S', 'W', 'N'][az / 90]}</text>)}
      <text x={L - 3} y={T + 8} textAnchor="end" fill="rgba(255,255,255,0.6)">{Math.round(max)}°</text>
      <text x={L - 3} y={H - B} textAnchor="end" fill="rgba(255,255,255,0.6)">0°</text>
    </svg>
  );
}
