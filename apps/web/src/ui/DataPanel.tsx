import { Link } from 'react-router-dom';
import { useMission, useSiteTerrain } from '@/services/queries';
import { useSceneStore } from '@/state/sceneStore';
import { fmtM } from '@/utils/format';
import { Badge, KV, Note, Panel } from './primitives';

/**
 * DataPanel — the *scientific data* side of the scene (kept apart from visual assets):
 * terrain context from LOLA-derived tiles, payload science, and the honesty notes about what is and isn't real.
 */
export function DataPanel() {
  const config = useSceneStore((s) => s.config);
  const missionId = config?.focus?.missionId;
  const siteId = config?.focus?.landingSiteId;
  const { data: mission } = useMission(missionId);
  const { data: terrain } = useSiteTerrain(siteId);
  if (!config || (!missionId && !siteId)) return null;
  const showPayloads = config.layers.overlays.payload || config.layers.payloads;
  const showScience = config.layers.overlays.science;
  return (
    <div className="data-stack">
      {terrain && (
        <Panel title={<span>Terrain context <Badge tone="info">LRO LOLA</Badge></span>}>
          {terrain.available && terrain.surface ? (
            <>
              <KV k="Elevation (DEM)" v={<span className="mono">{fmtM(terrain.surface.elevationM)}</span>} />
              <KV k="Published" v={<span className="mono">{fmtM(terrain.site?.publishedElevationM)}{terrain.elevationDiscrepancyM != null ? ` (Δ ${terrain.elevationDiscrepancyM.toFixed(0)} m)` : ''}</span>} />
              <KV k="Slope / aspect" v={<span className="mono">{terrain.surface.slopeDeg.toFixed(1)}° / {terrain.surface.aspectDeg.toFixed(0)}°</span>} />
              <KV k="Sample" v={<span className="mono">LOD{terrain.surface.lod} · {terrain.surface.source} · step {terrain.surface.sampleStepDeg}°</span>} />
              <KV k="Tiles" v={<span className="mono" title={terrain.tiles?.map((t) => t.id).join(', ')}>{terrain.tiles?.length ?? 0} loaded · {terrain.tiles?.[0]?.id ?? '—'}{(terrain.tiles?.length ?? 0) > 1 ? ' …' : ''}</span>} />
              {terrain.dataSource && <Note>{terrain.dataSource.description} · grade: {terrain.dataSource.scientificGrade}</Note>}
            </>
          ) : (
            <Note>{terrain.reason ?? 'No terrain available for this site.'}</Note>
          )}
        </Panel>
      )}
      {showPayloads && mission && (
        <Panel title={<span>Payloads <Badge>{mission.payloads.length}</Badge></span>}>
          {mission.payloads.length === 0 && <Note>No payload records catalogued yet for this mission.</Note>}
          <ul className="payload-list">
            {mission.payloads.map((p) => (
              <li key={p.id}>
                <Link to={`/payloads/${p.id}`}><b>{p.acronym || p.name}</b></Link> <span className="dim">{p.type}</span>
                <div className="small">{p.leadOrganization}</div>
                {showScience && <div className="small dim">{p.summary}</div>}
                {!p.has3DModel && <div className="small warn">no 3D model — information only</div>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {showScience && mission && (
        <Panel title="Science overlay">
          <Note>Scientific features are shown only where verified data exists. Surface slope/elevation come from LOLA gridded data; no fabricated craters, boulders or rover tracks are rendered.</Note>
          <KV k="Trajectory" v={mission.mission.trajectory ? 'verified samples rendered' : mission.mission.trajectoryNote} />
          <KV k="Events" v={mission.events.length} />
        </Panel>
      )}
    </div>
  );
}
