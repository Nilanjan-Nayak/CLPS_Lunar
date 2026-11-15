import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Note, Panel } from '@/ui/primitives';
import { useLandingSites, usePlanOptions, useResilience } from '@/services/queries';
import { MissionIntelSubnav, parsePlanSearchParams, serializePlanInput } from '@/features/planning/MissionIntelSubnav';
import { ResilienceLab } from '@/features/resilience/ResilienceLab';

export function ResiliencePage() {
  const [q, setQ] = useSearchParams();
  const input = useMemo(() => parsePlanSearchParams(q), [q]);
  const { data: options } = usePlanOptions();
  const { data: sites } = useLandingSites();
  const { data: resilience, isFetching, error } = useResilience(input);

  const updateInput = (patch: Partial<typeof input>) => {
    const next = { ...input, ...patch };
    setQ(new URLSearchParams(serializePlanInput(next, { run: '1' })));
  };

  return (
    <div>
      <MissionIntelSubnav input={input} />
      <div className="page-head">
        <h1>
          Mission Resilience Lab <Badge tone="info">Schedule-Delay Simulator &amp; MRI</Badge>
        </h1>
        <p className="dim">
          Evaluates whether a planned lunar landing survives launch schedule slips (+1, +2, +3, +5, +7, +10, +14, +21, +28 days) by re-running the Python ephemeris,
          LOLA terrain-horizon masking, electrical power balance, and engineering constraint checks for every delayed scenario — then searches for the earliest feasible recovery window.
        </p>
      </div>

      {/* Quick site / lander / date controls */}
      <Panel title="Scenario Baseline Parameters">
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ minWidth: 220 }}>
            Preset landing site
            <select
              value=""
              onChange={(e) => {
                const s = sites?.landingSites.find((x) => x.id === e.target.value);
                if (s && s.latitude != null && s.longitude != null) {
                  updateInput({ latitude: s.latitude, longitude: s.longitude });
                }
              }}
            >
              <option value="">— jump to CLPS site —</option>
              {sites?.landingSites
                .filter((s) => s.latitude != null)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.latitude?.toFixed(2)}°, {s.longitude?.toFixed(2)}°)
                  </option>
                ))}
            </select>
          </label>
          <label style={{ width: 110 }}>
            Latitude (°)
            <input
              type="number"
              step="0.1"
              min={-90}
              max={90}
              value={input.latitude}
              onChange={(e) => updateInput({ latitude: Number(e.target.value) })}
            />
          </label>
          <label style={{ width: 110 }}>
            Longitude (°)
            <input
              type="number"
              step="0.1"
              min={-180}
              max={180}
              value={input.longitude}
              onChange={(e) => updateInput({ longitude: Number(e.target.value) })}
            />
          </label>
          <label style={{ minWidth: 180 }}>
            Lander class
            <select value={input.landerId ?? 'nova-c'} onChange={(e) => updateInput({ landerId: e.target.value })}>
              {options?.landers.map((l) => (
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
          <label style={{ minWidth: 180 }}>
            Baseline landing UTC (optional)
            <input
              type="text"
              placeholder="Auto (next terrain sunrise)"
              value={input.landingDate ?? ''}
              onChange={(e) => updateInput({ landingDate: e.target.value || undefined })}
            />
          </label>
          {input.landingDate && (
            <button type="button" className="btn small" onClick={() => updateInput({ landingDate: undefined })}>
              Reset to Sunrise
            </button>
          )}
        </div>
      </Panel>

      <div style={{ marginTop: 12 }}>
        {isFetching && !resilience && (
          <Panel title="Simulating Schedule Delays…">
            <div className="panel-body">
              <Note>Running 10 schedule-delay scenarios and forward recovery search in the Python research engine…</Note>
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
        {resilience && (
          <ResilienceLab
            data={resilience}
            onApplyLandingDate={(utc) => updateInput({ landingDate: utc })}
          />
        )}
      </div>
    </div>
  );
}
