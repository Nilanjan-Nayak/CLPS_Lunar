import { useMemo, useState } from 'react';
import type { EphemSample, TerrainHorizon } from '@/types/domain';

/**
 * PolarHorizonPlot — 360° polar sky-dome visualization of the local LOLA DEM terrain horizon mask,
 * with the Sun trajectory over surface operations and the Earth position at landing.
 * Supports two radial scales:
 *   • 'horizon' (0°..30° band expanded) so low polar terrain ridges (1°–15°) and grazing Sun paths are clearly legible
 *   • 'full'    (0°..90° full hemisphere) for mid/low-latitude high-Sun missions
 */
export function PolarHorizonPlot({
  horizon,
  atLanding,
  samples,
  size = 250,
}: {
  horizon?: TerrainHorizon | null;
  atLanding?: EphemSample | null;
  samples?: EphemSample[];
  size?: number;
}) {
  const maxHorizon = useMemo(() => (horizon ? Math.max(5, ...horizon.elevationDeg) : 10), [horizon]);
  const maxSun = useMemo(
    () => Math.max(atLanding?.sunElevationDeg ?? 10, ...(samples?.map((s) => s.sunElevationDeg) ?? [15])),
    [atLanding, samples],
  );
  const [zoomBand, setZoomBand] = useState<'horizon' | 'full'>(() => (maxSun <= 32 ? 'horizon' : 'full'));

  if (!horizon) return null;

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 24;
  const maxElev = zoomBand === 'horizon' ? Math.max(25, Math.ceil(( Math.max(maxHorizon, Math.min(maxSun, 35)) + 5) / 5) * 5) : 90;

  // Map (azimuthDeg, elevationDeg) -> SVG (x, y) where outer circle = 0° horizon and center = maxElev°
  const project = (azDeg: number, elevDeg: number) => {
    const clamped = Math.max(-4, Math.min(maxElev, elevDeg));
    const frac = Math.max(0, 1 - clamped / maxElev);
    const r = frac * R;
    const rad = ((azDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  // Build closed polygon for the obstructed terrain band between outer rim (0°) and horizon.elevationDeg[i]
  const n = horizon.elevationDeg.length;
  const outerRim = Array.from({ length: n + 1 }, (_, i) => {
    const az = (i % n) * horizon.azimuthStepDeg;
    const p = project(az, 0);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });
  const innerMask = Array.from({ length: n + 1 }, (_, i) => {
    const idx = (n - (i % n)) % n;
    const az = idx * horizon.azimuthStepDeg;
    const el = Math.max(0, horizon.elevationDeg[idx]);
    const p = project(az, el);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });
  const horizonOutline = Array.from({ length: n + 1 }, (_, i) => {
    const idx = i % n;
    const az = idx * horizon.azimuthStepDeg;
    const el = Math.max(0, horizon.elevationDeg[idx]);
    const p = project(az, el);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');

  const rings = zoomBand === 'horizon' ? [0, 5, 10, 15, 20, maxElev].filter((v, i, a) => v <= maxElev && a.indexOf(v) === i) : [0, 15, 30, 60, 90];

  const sunTrackPts = (samples ?? []).filter((s) => s.sunElevationDeg >= -2);
  const sunAt = atLanding ? project(atLanding.sunAzimuthDeg, Math.max(0, atLanding.sunElevationDeg)) : null;
  const earthAt = atLanding && atLanding.earthElevationDeg >= -3 ? project(atLanding.earthAzimuthDeg, Math.max(0, atLanding.earthElevationDeg)) : null;

  return (
    <div className="polar-horizon-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: 11 }}>
        <span className="dim">360° Polar Sky-Dome ({horizon.grade?.startsWith('science') ? 'LOLA GDR 240 m' : 'LOLA 16 px/deg'})</span>
        <div className="seg" role="group" aria-label="Polar horizon radial scale">
          <button type="button" className={zoomBand === 'horizon' ? 'on' : ''} onClick={() => setZoomBand('horizon')} title="Expand 0°–30° horizon band">0–{maxElev}°</button>
          <button type="button" className={zoomBand === 'full' ? 'on' : ''} onClick={() => setZoomBand('full')} title="Full 0°–90° hemisphere">0–90°</button>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="360 degree polar terrain horizon plot"
        style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 9, overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="skyDomeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(15,23,42,0.85)" />
            <stop offset="100%" stopColor="rgba(30,41,59,0.55)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="url(#skyDomeGrad)" stroke="rgba(148,163,184,0.35)" strokeWidth={1.2} />

        {/* Concentric elevation rings */}
        {rings.map((deg) => {
          const r = Math.max(0, 1 - deg / maxElev) * R;
          return (
            <g key={deg}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeDasharray={deg === 0 ? undefined : '2 2'} />
              {deg > 0 && deg < maxElev && (
                <text x={cx + 3} y={cy - r + 9} fill="rgba(226,232,240,0.45)" fontSize={8}>{deg}°</text>
              )}
            </g>
          );
        })}

        {/* Azimuth spokes every 45° */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((az) => {
          const p = project(az, 0);
          return <line key={az} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.16)" />;
        })}

        {/* Shaded terrain obstruction ring */}
        <polygon
          points={`${outerRim.join(' ')} ${innerMask.join(' ')}`}
          fill="rgba(244,63,94,0.24)"
        />
        <path d={horizonOutline} fill="none" stroke="rgba(251,113,133,0.9)" strokeWidth={1.5} />

        {/* Sun path segments over mission */}
        {sunTrackPts.map((pt, i) => {
          if (i === 0) return null;
          const prev = sunTrackPts[i - 1];
          // Avoid drawing a chord across the dome if azimuth wraps poorly unless close
          const p0 = project(prev.sunAzimuthDeg, Math.max(0, prev.sunElevationDeg));
          const p1 = project(pt.sunAzimuthDeg, Math.max(0, pt.sunElevationDeg));
          const blocked = pt.sunVisible === false || prev.sunVisible === false;
          return (
            <line
              key={i}
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
              stroke={blocked ? '#f87171' : '#fbbf24'}
              strokeWidth={blocked ? 1.4 : 1.8}
              strokeDasharray={blocked ? '2 2' : undefined}
              opacity={0.85}
            />
          );
        })}

        {/* Earth at landing */}
        {earthAt && (
          <g>
            <circle cx={earthAt.x} cy={earthAt.y} r={5} fill="#38bdf8" stroke="#020617" strokeWidth={1.3}>
              <title>{`Earth at landing: ${atLanding?.earthElevationDeg}° el, ${atLanding?.earthAzimuthDeg}° az`}</title>
            </circle>
            <text x={earthAt.x + 7} y={earthAt.y + 3} fill="#7dd3fc" fontWeight={700}>⊕</text>
          </g>
        )}

        {/* Sun at landing */}
        {sunAt && (
          <g>
            <circle
              cx={sunAt.x}
              cy={sunAt.y}
              r={5.5}
              fill={atLanding?.sunVisible === false ? '#ef4444' : '#fbbf24'}
              stroke="#020617"
              strokeWidth={1.3}
            >
              <title>{`Sun at landing: ${atLanding?.sunElevationDeg}° el, ${atLanding?.sunAzimuthDeg}° az (${atLanding?.sunVisible === false ? 'BLOCKED by terrain' : 'visible'})`}</title>
            </circle>
            <text x={sunAt.x + 7} y={sunAt.y + 3} fill="#fde68a" fontWeight={700}>☀</text>
          </g>
        )}

        {/* Cardinal labels */}
        <text x={cx} y={12} textAnchor="middle" fill="#e2e8f0" fontWeight={700}>N 0°</text>
        <text x={size - 10} y={cy + 3} textAnchor="middle" fill="#94a3b8" fontWeight={600}>E</text>
        <text x={cx} y={size - 5} textAnchor="middle" fill="#94a3b8" fontWeight={600}>S 180°</text>
        <text x={10} y={cy + 3} textAnchor="middle" fill="#94a3b8" fontWeight={600}>W</text>
      </svg>
      <div className="dim" style={{ fontSize: 10.5, textAlign: 'center', lineHeight: 1.35 }}>
        <span style={{ color: '#fb7185' }}>■</span> Terrain mask (max {Math.max(...horizon.elevationDeg).toFixed(1)}°) ·{' '}
        <span style={{ color: '#fbbf24' }}>━ ☀</span> Sun track &amp; landing ·{' '}
        <span style={{ color: '#38bdf8' }}>● ⊕</span> Earth LOS
      </div>
    </div>
  );
}
