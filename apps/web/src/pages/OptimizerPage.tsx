import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Note, Panel } from '@/ui/primitives';
import { usePlanOptions, useSiteOptimization } from '@/services/queries';
import { MissionIntelSubnav, parsePlanSearchParams, serializePlanInput } from '@/features/planning/MissionIntelSubnav';
import { ParetoExplorer } from '@/features/optimization/ParetoExplorer';

export function OptimizerPage() {
  const [q, setQ] = useSearchParams();
  const navigate = useNavigate();
  const input = useMemo(() => parsePlanSearchParams(q), [q]);
  const { data: options } = usePlanOptions();
  const { data: optimization, isFetching, error } = useSiteOptimization(input);

  const updateInput = (patch: Partial<typeof input>) => {
    const next = { ...input, ...patch };
    setQ(new URLSearchParams(serializePlanInput(next, { run: '1' })));
  };

  return (
    <div>
      <MissionIntelSubnav input={input} />
      <div className="page-head">
        <h1>
          Multi-Site &amp; Pareto Optimizer <Badge tone="ok">5-Objective Non-Dominated Frontier</Badge>
        </h1>
        <p className="dim">
          Evaluates candidate lunar landing sites across polar plateaus, sunlit ridges, nearside maria, and far-side basins. Hard constraints filter infeasible sites first;
          Pareto optimization identifies non-dominated Rank-1 solutions across Solar Availability, Earth Visibility, Terrain Safety, Darkness Survival, and Schedule Resilience (MRI).
        </p>
      </div>

      <Panel title="Optimization Mission Profile &amp; Hard Constraints">
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ minWidth: 200 }}>
            Lander class
            <select value={input.landerId ?? 'nova-c'} onChange={(e) => updateInput({ landerId: e.target.value })}>
              {options?.landers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label style={{ minWidth: 160 }}>
            Launch vehicle
            <select value={input.launchVehicleId ?? 'falcon-9'} onChange={(e) => updateInput({ launchVehicleId: e.target.value })}>
              {options?.launchVehicles.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label style={{ width: 110 }}>
            Surface days
            <input
              type="number"
              min={1}
              max={45}
              value={input.surfaceDays ?? 14}
              onChange={(e) => updateInput({ surfaceDays: Number(e.target.value) })}
            />
          </label>
          <label style={{ width: 110 }}>
            Max slope (°)
            <input
              type="number"
              step="0.5"
              min={2}
              max={20}
              value={input.maxSlopeDeg ?? 8}
              onChange={(e) => updateInput({ maxSlopeDeg: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input
              type="checkbox"
              checked={!!input.useRelay}
              onChange={(e) => updateInput({ useRelay: e.target.checked })}
            />
            <span>Lunar Relay Orbiter available (enables far-side / polar shadow comms)</span>
          </label>
        </div>
      </Panel>

      <div style={{ marginTop: 12 }}>
        {isFetching && !optimization && (
          <Panel title="Evaluating Candidate Sites &amp; Pareto Frontier…">
            <div className="panel-body">
              <Note>Computing LOLA DEM terrain, 360° horizons, sunrise windows, and schedule-delay sweeps across candidate sites…</Note>
            </div>
          </Panel>
        )}
        {error && (
          <Panel title="Engine Error">
            <div className="panel-body">
              <Note>Error: {(error as Error).message}</Note>
            </div>
          </Panel>
        )}
        {optimization && (
          <ParetoExplorer
            data={optimization}
            onApplyCandidate={(cand) => {
              const next = { ...input, latitude: cand.latitude, longitude: cand.longitude, landingDate: cand.optimalLandingUtc };
              navigate(`/navigator?${serializePlanInput(next, { run: '1' })}`);
            }}
          />
        )}
      </div>
    </div>
  );
}
