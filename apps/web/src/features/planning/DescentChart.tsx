import { useMemo } from 'react';
import type { PlanResult } from '@/types/domain';

/**
 * DescentChart — inline SVG of the simulated powered descent: altitude vs downrange (line), throttle (bars)
 * and speed (thin line). Pure presentation of research-engine samples; `cursorT` (seconds since PDI) draws the
 * playback cursor while the 3-D simulation is in the Landing phase.
 */
export function DescentChart({ plan, cursorT, height = 150 }: { plan: PlanResult; cursorT?: number; height?: number }) {
  const W = 320; const H = height; const L = 34; const R = 30; const T = 8; const B = 20;
  const s = plan.descent.samples;
  const m = useMemo(() => {
    const xMin = Math.min(...s.map((p) => p.downrangeM)) / 1000; // negative uprange
    const xMax = 0;
    const altMax = Math.max(...s.map((p) => p.altitudeM)) / 1000;
    const vMax = Math.max(...s.map((p) => p.speedMps));
    const x = (km: number) => L + ((km - xMin) / (xMax - xMin || 1)) * (W - L - R);
    const yAlt = (km: number) => T + (1 - km / (altMax || 1)) * (H - T - B);
    const yV = (v: number) => T + (1 - v / (vMax || 1)) * (H - T - B);
    const yThr = (th: number) => T + (1 - th) * (H - T - B);
    const altPath = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.downrangeM / 1000).toFixed(1)},${yAlt(p.altitudeM / 1000).toFixed(1)}`).join(' ');
    const vPath = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.downrangeM / 1000).toFixed(1)},${yV(p.speedMps).toFixed(1)}`).join(' ');
    const bw = Math.max(1, (W - L - R) / s.length - 0.5);
    return { xMin, altMax, vMax, x, yAlt, yV, yThr, altPath, vPath, bw };
  }, [s, H]);

  let cursor: { cx: number; cy: number; alt: number; v: number; thr: number } | null = null;
  if (cursorT != null && cursorT >= 0) {
    let i = 0; while (i < s.length - 1 && s[i + 1].t <= cursorT) i++;
    const a = s[i]; const b = s[Math.min(i + 1, s.length - 1)];
    const f = b.t > a.t ? Math.min(1, (cursorT - a.t) / (b.t - a.t)) : 0;
    const dr = (a.downrangeM + (b.downrangeM - a.downrangeM) * f) / 1000; const alt = (a.altitudeM + (b.altitudeM - a.altitudeM) * f) / 1000;
    cursor = { cx: m.x(dr), cy: m.yAlt(alt), alt, v: a.speedMps + (b.speedMps - a.speedMps) * f, thr: a.throttle + (b.throttle - a.throttle) * f };
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Simulated powered-descent profile" style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 8.5 }}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.12)" />
      {ticks.map((k) => <line key={k} x1={L} x2={W - R} y1={T + k * (H - T - B)} y2={T + k * (H - T - B)} stroke="rgba(255,255,255,0.06)" />)}
      {s.map((p, i) => <rect key={i} x={m.x(p.downrangeM / 1000) - m.bw / 2} y={m.yThr(p.throttle)} width={m.bw} height={Math.max(0, H - B - m.yThr(p.throttle))} fill="rgba(251,191,36,0.16)" />)}
      <path d={m.vPath} fill="none" stroke="#60a5fa" strokeWidth={1} strokeDasharray="3 2" />
      <path d={m.altPath} fill="none" stroke="#c084fc" strokeWidth={1.6} />
      {cursor && (
        <g>
          <line x1={cursor.cx} x2={cursor.cx} y1={T} y2={H - B} stroke="#5eead4" strokeWidth={1} />
          <circle cx={cursor.cx} cy={cursor.cy} r={3} fill="#5eead4" />
          <text x={cursor.cx > (L + W - R) / 2 ? cursor.cx - 4 : cursor.cx + 4} textAnchor={cursor.cx > (L + W - R) / 2 ? 'end' : 'start'} y={T + 10} fill="#5eead4">{cursor.alt >= 1 ? `${cursor.alt.toFixed(1)} km` : `${Math.round(cursor.alt * 1000)} m`} · {Math.round(cursor.v)} m/s · thr {Math.round(cursor.thr * 100)}%</text>
        </g>
      )}
      <text x={L - 3} y={T + 8} textAnchor="end" fill="#c084fc">{m.altMax.toFixed(0)} km</text>
      <text x={L - 3} y={H - B} textAnchor="end" fill="#c084fc">0</text>
      <text x={W - R + 3} y={T + 8} fill="#60a5fa">{Math.round(m.vMax)}</text>
      <text x={W - R + 3} y={T + 18} fill="#60a5fa">m/s</text>
      <text x={W - R + 3} y={H - B} fill="#fbbf24">thr</text>
      <text x={L} y={H - 6} fill="rgba(255,255,255,0.55)">PDI {Math.abs(m.xMin).toFixed(0)} km uprange</text>
      <text x={W - R} y={H - 6} textAnchor="end" fill="rgba(255,255,255,0.55)">site · {(plan.descent.durationS / 60).toFixed(1)} min</text>
    </svg>
  );
}
