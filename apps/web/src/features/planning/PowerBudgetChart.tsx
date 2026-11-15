import { useMemo } from 'react';
import { Badge, KV } from '@/ui/primitives';
import type { GoldenWindows, PowerBudget } from '@/types/domain';

/**
 * PowerBudgetChart — visualizes the Mission Power Budget (Feature 6) and Golden Mission Window overlap (Feature 3):
 *   • Solar electrical generation P_solar(t) (W) vs spacecraft load P_load(t) (W)
 *   • Battery state-of-charge SOC(t) (%) vs minimum safe DOD floor
 *   • Shaded Golden Mission Window intervals (simultaneous terrain-masked sunlight, SOC >= floor, and Earth visibility)
 */
export function PowerBudgetChart({
  powerBudget,
  goldenWindows,
  height = 165,
}: {
  powerBudget?: PowerBudget | null;
  goldenWindows?: GoldenWindows | null;
  height?: number;
}) {
  const W = 380;
  const H = height;
  const L = 34;
  const R = 32;
  const T = 14;
  const B = 22;

  const chart = useMemo(() => {
    if (!powerBudget || !powerBudget.series.length) return null;
    const s = powerBudget.series;
    const tMax = Math.max(24, s[s.length - 1]?.tHours ?? 336);
    const pMax = Math.max(450, powerBudget.summary.peakSolarPowerW, powerBudget.parameters.operationalLoadW) * 1.12;
    const x = (tH: number) => L + (tH / tMax) * (W - L - R);
    const yW = (w: number) => T + (1 - Math.min(Math.max(w, 0), pMax) / pMax) * (H - T - B);
    const ySoc = (pct: number) => T + (1 - Math.min(Math.max(pct, 0), 100) / 100) * (H - T - B);

    const solarPath = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.tHours).toFixed(1)},${yW(p.solarPowerW).toFixed(1)}`).join(' ');
    const loadPath = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.tHours).toFixed(1)},${yW(p.loadPowerW).toFixed(1)}`).join(' ');
    const socPath = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.tHours).toFixed(1)},${ySoc(p.socPct).toFixed(1)}`).join(' ');

    return { s, tMax, pMax, x, yW, ySoc, solarPath, loadPath, socPath };
  }, [powerBudget, H]);

  if (!powerBudget || !chart) return null;
  const { summary, parameters } = powerBudget;
  const days = Math.ceil(chart.tMax / 24);
  const dayStep = days <= 10 ? 2 : 3;
  const dayTicks = Array.from({ length: Math.floor(days / dayStep) + 1 }, (_, i) => i * dayStep);

  return (
    <div className="power-budget-view">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
        <div className="stat-box" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '6px 9px' }}>
          <div className="dim" style={{ fontSize: 10 }}>ENERGY BALANCE</div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: summary.energyMarginKwh >= 0 ? '#5eead4' : '#f87171' }}>
            {summary.generatedKwh.toFixed(1)} / {summary.requiredKwh.toFixed(1)} kWh
          </div>
          <div className="dim" style={{ fontSize: 10 }}>margin {summary.energyMarginKwh >= 0 ? '+' : ''}{summary.energyMarginKwh.toFixed(1)} kWh ({summary.energyBalanceRatio}×)</div>
        </div>
        <div className="stat-box" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '6px 9px' }}>
          <div className="dim" style={{ fontSize: 10 }}>BATTERY SOC FLOOR</div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: summary.minSocPct >= parameters.minSafeSocPct ? '#8fd3ff' : '#f87171' }}>
            min {summary.minSocPct.toFixed(0)}% <span className="dim" style={{ fontWeight: 400 }}>/ {parameters.minSafeSocPct.toFixed(0)}%</span>
          </div>
          <div className="dim" style={{ fontSize: 10 }}>{parameters.batteryCapacityWh} Wh · max dark {summary.maxContinuousDarknessHours.toFixed(1)}/{summary.darknessSurvivalHours.toFixed(1)} h</div>
        </div>
        <div className="stat-box" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 8, padding: '6px 9px' }}>
          <div className="dim" style={{ fontSize: 10 }}>GOLDEN WINDOW</div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
            {goldenWindows ? `${goldenWindows.totalGoldenDays.toFixed(1)} d` : `${(summary.goldenWindowFraction * days).toFixed(1)} d`}
          </div>
          <div className="dim" style={{ fontSize: 10 }}>
            {Math.round((goldenWindows?.overlapFraction ?? summary.goldenWindowFraction) * 100)}% overlap (Sun+SOC+Earth)
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Mission power generation, load, battery SOC, and golden window chart"
        style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 8.5 }}
      >
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.12)" />

        {/* Shaded Golden Window intervals (emerald) and Darkness intervals (red) */}
        {chart.s.map((pt, i) => {
          if (i === 0) return null;
          const prev = chart.s[i - 1];
          const x0 = chart.x(prev.tHours);
          const x1 = chart.x(pt.tHours);
          if (pt.goldenActive) {
            return <rect key={`g-${i}`} x={x0} y={T} width={Math.max(1, x1 - x0)} height={H - T - B} fill="rgba(52,211,153,0.11)" />;
          }
          if (!pt.sunVisible) {
            return <rect key={`d-${i}`} x={x0} y={T} width={Math.max(1, x1 - x0)} height={H - T - B} fill="rgba(244,63,94,0.16)" />;
          }
          return null;
        })}

        {/* Safe SOC floor line */}
        <line
          x1={L}
          x2={W - R}
          y1={chart.ySoc(parameters.minSafeSocPct)}
          y2={chart.ySoc(parameters.minSafeSocPct)}
          stroke="rgba(248,113,113,0.55)"
          strokeDasharray="3 2"
        />

        {/* Curves: Load W, Solar W, Battery SOC % */}
        <path d={chart.loadPath} fill="none" stroke="rgba(148,163,184,0.75)" strokeWidth={1.2} strokeDasharray="3 2" />
        <path d={chart.solarPath} fill="none" stroke="#fbbf24" strokeWidth={1.6} />
        <path d={chart.socPath} fill="none" stroke="#34d399" strokeWidth={1.6} />

        {/* Left axis: Watts */}
        <text x={L - 4} y={T + 7} textAnchor="end" fill="#fbbf24">{Math.round(chart.pMax)}W</text>
        <text x={L - 4} y={chart.yW(parameters.operationalLoadW) + 3} textAnchor="end" fill="rgba(226,232,240,0.65)">{Math.round(parameters.operationalLoadW)}W</text>
        <text x={L - 4} y={H - B} textAnchor="end" fill="rgba(226,232,240,0.5)">0W</text>

        {/* Right axis: Battery SOC % */}
        <text x={W - R + 4} y={T + 7} textAnchor="start" fill="#34d399">100%</text>
        <text x={W - R + 4} y={chart.ySoc(parameters.minSafeSocPct) + 3} textAnchor="start" fill="#f87171">{Math.round(parameters.minSafeSocPct)}%</text>
        <text x={W - R + 4} y={H - B} textAnchor="start" fill="rgba(226,232,240,0.5)">0%</text>

        {/* X axis: surface days */}
        {dayTicks.map((d) => (
          <text key={d} x={chart.x(d * 24)} y={H - 7} textAnchor="middle" fill="rgba(226,232,240,0.55)">+{d}d</text>
        ))}

        {/* Legend */}
        <text x={L + 6} y={T + 10} fill="#fbbf24">━ P_solar (W)</text>
        <text x={L + 84} y={T + 10} fill="#94a3b8">╌ P_load (W)</text>
        <text x={L + 158} y={T + 10} fill="#34d399">━ Battery SOC (%)</text>
        <text x={W - R - 4} y={T + 10} textAnchor="end" fill="#6ee7b7">■ Golden Window</text>
      </svg>

      <div style={{ marginTop: 6 }}>
        <KV
          k="Solar array & load"
          v={`${parameters.solarPanelAreaM2} m² × ${(parameters.panelEfficiency * 100).toFixed(0)}% GaAs · peak ${summary.peakSolarPowerW.toFixed(0)} W · ops load ${parameters.operationalLoadW.toFixed(0)} W (base ${parameters.baseLoadW.toFixed(0)} + payload ${parameters.payloadLoadW.toFixed(0)} W) · night ${parameters.nightSurvivalLoadW.toFixed(0)} W`}
        />
        <KV
          k="Darkness survival"
          v={
            <span>
              <Badge tone={summary.survivesDarkness ? 'ok' : 'bad'}>
                {summary.survivesDarkness ? 'PASS' : 'EXCEEDS BATTERY'}
              </Badge>{' '}
              active darkness {summary.maxContinuousDarknessHours.toFixed(1)} h vs battery survival limit {summary.darknessSurvivalHours.toFixed(1)} h ({parameters.usableBatteryWh} Wh usable at {(parameters.maxDod * 100).toFixed(0)}% DOD)
            </span>
          }
        />
      </div>
    </div>
  );
}
