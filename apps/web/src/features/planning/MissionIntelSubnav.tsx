import { Link, useLocation } from 'react-router-dom';
import type { PlanInput } from '@/types/domain';

export const DEFAULT_PLAN_INPUT: PlanInput = {
  latitude: -84.79,
  longitude: 29.2,
  landerId: 'nova-c',
  launchVehicleId: 'falcon-9',
  transferId: 'direct',
  orbitDays: 1,
  surfaceDays: 14,
  dataVolumeGb: 20,
  downlinkMbps: 4,
  payloadKg: 100,
};

const STRING_KEYS = new Set(['landerId', 'launchVehicleId', 'transferId', 'landingDate']);
const BOOL_KEYS = new Set(['useRelay']);

export function parsePlanSearchParams(q: URLSearchParams): PlanInput {
  const out: Record<string, unknown> = { ...DEFAULT_PLAN_INPUT };
  for (const [k, v] of q.entries()) {
    if (k === 'run' || k === 'tab' || v === '') continue;
    if (STRING_KEYS.has(k)) out[k] = v;
    else if (BOOL_KEYS.has(k)) out[k] = v === '1' || v === 'true';
    else {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out as unknown as PlanInput;
}

export function serializePlanInput(input: PlanInput, extra?: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) {
      sp.set(k, String(v));
    }
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  }
  return sp.toString();
}

export function MissionIntelSubnav({ input }: { input: PlanInput }) {
  const loc = useLocation();
  const qs = serializePlanInput(input, { run: '1' });

  const steps = [
    {
      step: '01',
      path: '/plan',
      label: 'Plan & Golden Window',
      sub: 'Power Budget · 360° Horizon · Descent',
    },
    {
      step: '02',
      path: '/resilience',
      label: 'Resilience Lab (MRI)',
      sub: 'Launch-Slip Sweep & Recovery Window',
    },
    {
      step: '03',
      path: '/optimizer',
      label: 'Pareto Site Optimizer',
      sub: '5-Objective Multi-Site Frontier',
    },
    {
      step: '04',
      path: '/report',
      label: 'Confidence & Report',
      sub: '5-Domain Provenance & PDF Brief',
    },
  ];

  const latStr = `${Math.abs(input.latitude).toFixed(2)}°${input.latitude < 0 ? 'S' : 'N'}`;
  const lonStr = `${Math.abs(input.longitude).toFixed(2)}°${input.longitude < 0 ? 'W' : 'E'}`;

  return (
    <nav className="intel-pipeline" aria-label="Mission intelligence studio workflow">
      <div className="intel-pipeline-top">
        <div className="intel-pipeline-brand">
          <span className="intel-pipeline-dot" />
          <span className="mono intel-pipeline-kicker">SELENARA X · MISSION INTELLIGENCE WORKFLOW</span>
          <span className="intel-pipeline-target mono">
            TARGET: {latStr}, {lonStr} · {String(input.landerId).toUpperCase()} · {input.surfaceDays ?? 14}D OPS
          </span>
        </div>
        <Link to={`/navigator?${qs}`} className="intel-pipeline-nav-cta">
          <span aria-hidden="true">⚡</span>
          <span>Launch in 3D Hybrid Navigator</span>
          <span className="mono">LIVE 3D →</span>
        </Link>
      </div>

      <div className="intel-pipeline-steps">
        {steps.map((it) => {
          const active = loc.pathname === it.path;
          return (
            <Link
              key={it.path}
              to={`${it.path}?${qs}`}
              className={`intel-step-card${active ? ' active' : ''}`}
            >
              <span className="intel-step-num mono">{it.step}</span>
              <span className="intel-step-text">
                <strong>{it.label}</strong>
                <small>{it.sub}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
