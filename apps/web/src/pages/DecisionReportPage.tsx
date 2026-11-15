import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Note, Panel } from '@/ui/primitives';
import { useDecisionReport } from '@/services/queries';
import { MissionIntelSubnav, parsePlanSearchParams, serializePlanInput } from '@/features/planning/MissionIntelSubnav';
import { DecisionReportView } from '@/features/reporting/DecisionReportView';

export function DecisionReportPage() {
  const [q, setQ] = useSearchParams();
  const input = useMemo(() => parsePlanSearchParams(q), [q]);
  const { data: report, isFetching, error } = useDecisionReport(input);

  const updateInput = (patch: Partial<typeof input>) => {
    const next = { ...input, ...patch };
    setQ(new URLSearchParams(serializePlanInput(next, { run: '1' })));
  };

  return (
    <div>
      <div className="no-print">
        <MissionIntelSubnav input={input} />
      </div>
      <div className="page-head">
        <h1>
          Mission Confidence &amp; Decision Report <Badge tone="info">Exportable Engineering Dossier</Badge>
        </h1>
        <p className="dim">
          Consolidated engineering decision package combining LOLA terrain analysis, terrain-masked Sun/Earth ephemeris, electrical power balance,
          schedule-delay resilience (MRI), Pareto multi-site alternatives, and domain-separated scientific confidence and limitations.
        </p>
      </div>

      {isFetching && !report && (
        <Panel title="Compiling Decision Report…">
          <div className="panel-body">
            <Note>Running baseline mission simulation, schedule-delay resilience sweep, and multi-site Pareto optimization…</Note>
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
      {report && (
        <DecisionReportView
          report={report}
          onSelectSite={(lat, lon, landingUtc) => updateInput({ latitude: lat, longitude: lon, landingDate: landingUtc })}
        />
      )}
    </div>
  );
}
