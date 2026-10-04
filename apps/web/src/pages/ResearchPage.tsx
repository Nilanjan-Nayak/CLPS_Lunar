import { Link, useSearchParams } from 'react-router-dom';
import { useMission, useMissions, useSiteTerrain } from '@/services/queries';
import { KV, Note, Panel } from '@/ui/primitives';
import { fmtM } from '@/utils/format';

/**
 * Research (Phase 11 surface): everything shown here is pulled from the mission's verified sources, LOLA terrain context
 * and payload catalogue. The research-engine service will later add document search + citations on top of this contract.
 */
export function ResearchPage() {
  const [q, setQ] = useSearchParams();
  const missionId = q.get('mission') ?? '';
  const { data: missions } = useMissions();
  const { data } = useMission(missionId || undefined);
  const { data: terrain } = useSiteTerrain(data?.landingSite?.id);
  return (
    <div>
      <div className="page-head">
        <h1>Research</h1>
        <p className="dim">Source-backed mission research. Select a mission to see its verified claims, terrain science context and payload objectives.</p>
        <select value={missionId} onChange={(e) => setQ(e.target.value ? { mission: e.target.value } : {})}>
          <option value="">— choose a mission —</option>
          {missions?.missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {data && (
        <div className="two-col">
          <div>
            <Panel title={`${data.mission.name} — verified claims`}>
              {data.sources.map((s) => (
                <div key={s.id} className="row-item">
                  <a href={s.url} target="_blank" rel="noreferrer"><b>{s.title}</b></a> <span className="dim small">{s.publisher} · {s.date ?? 'n.d.'} · {s.type}</span>
                  <ul className="small">{s.claims.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              ))}
            </Panel>
            <Panel title="Payload science objectives">
              {data.payloads.length === 0 && <Note>No payload records catalogued yet.</Note>}
              {data.payloads.map((p) => <KV key={p.id} k={<Link to={`/payloads/${p.id}`}>{p.acronym || p.name}</Link>} v={p.summary} />)}
            </Panel>
          </div>
          <div>
            <Panel title="Terrain science context (LRO LOLA)">
              {terrain?.available && terrain.surface ? (
                <>
                  <KV k="Elevation" v={fmtM(terrain.surface.elevationM)} />
                  <KV k="Slope" v={`${terrain.surface.slopeDeg.toFixed(1)}°`} />
                  <KV k="Aspect" v={`${terrain.surface.aspectDeg.toFixed(0)}°`} />
                  <KV k="Published vs DEM" v={terrain.elevationDiscrepancyM != null ? `${terrain.elevationDiscrepancyM.toFixed(0)} m` : '—'} />
                  <KV k="Dataset" v={terrain.dataSource?.description} />
                  <Note>Grade: {terrain.dataSource?.scientificGrade}. Slope is computed over a {terrain.surface.sampleStepDeg}° sample step — a landing-scale slope needs higher-resolution LOLA/NAC DTMs.</Note>
                </>
              ) : (
                <Note>{terrain?.reason ?? 'Select a mission with a published landing site.'}</Note>
              )}
            </Panel>
            <Panel title="Research engine">
              <Note>Phase 11 (services/research-engine) will add document ingestion, citation ranking and the AI research summariser. Until then this page only shows catalogued, source-backed facts.</Note>
              <Link className="btn primary" to={`/missions/${data.mission.id}/scene?detail=complete`}>Open in 3D</Link>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
