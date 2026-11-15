import { Badge } from '@/ui/primitives';
import type { MissionConstraint } from '@/types/domain';

const TONE: Record<MissionConstraint['status'], 'ok' | 'warn' | 'bad'> = {
  pass: 'ok',
  warn: 'warn',
  fail: 'bad',
};

const LABEL: Record<MissionConstraint['status'], string> = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

/**
 * ConstraintMatrix — renders the 9 structured engineering constraints (propulsion, terrain, illumination,
 * electrical power, communications) with pass/warn/fail badges, actual values, thresholds, and margins.
 */
export function ConstraintMatrix({
  constraints,
  compact = false,
}: {
  constraints?: MissionConstraint[];
  compact?: boolean;
}) {
  if (!constraints || !constraints.length) return null;

  const passCount = constraints.filter((c) => c.status === 'pass').length;
  const warnCount = constraints.filter((c) => c.status === 'warn').length;
  const failCount = constraints.filter((c) => c.status === 'fail').length;

  return (
    <div className="constraint-matrix">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11.5 }}>
        <span className="dim">Structured Engineering Constraints ({constraints.length} checks)</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <Badge tone="ok">{passCount} PASS</Badge>
          {warnCount > 0 && <Badge tone="warn">{warnCount} WARN</Badge>}
          {failCount > 0 && <Badge tone="bad">{failCount} FAIL</Badge>}
        </span>
      </div>
      <table className="table small">
        <thead>
          <tr>
            <th>Status</th>
            <th>Constraint</th>
            <th>Actual</th>
            <th>Limit</th>
            <th>Margin</th>
            {!compact && <th>Assessment</th>}
          </tr>
        </thead>
        <tbody>
          {constraints.map((c) => (
            <tr key={c.id} title={c.summary}>
              <td>
                <Badge tone={TONE[c.status]}>{LABEL[c.status]}</Badge>
              </td>
              <td>
                <strong>{c.name}</strong>
                {compact && <div className="dim" style={{ fontSize: 10.5 }}>{c.summary}</div>}
              </td>
              <td className="mono">{c.actual} {c.unit}</td>
              <td className="mono">{c.threshold} {c.unit}</td>
              <td className="mono" style={{ color: c.margin >= 0 ? '#5eead4' : '#f87171' }}>
                {c.margin >= 0 ? `+${c.margin}` : c.margin} {c.unit}
              </td>
              {!compact && <td className="dim" style={{ fontSize: 11 }}>{c.summary}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
