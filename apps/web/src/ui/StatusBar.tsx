import { useWorldStore } from '@/state/worldStore';
import { useAssetStore } from '@/state/assetStore';
import { useCameraStore } from '@/state/cameraStore';
import { useSceneStore } from '@/state/sceneStore';
import { useTerrainStore } from '@/state/terrainStore';
import { fmtKm } from '@/utils/format';
import { formatLatLon } from '@/utils/geo';

/** StatusBar — one-line telemetry / loading strip under the dock (camera, terrain streaming, asset lifecycle, lighting truth). */
export function StatusBar() {
  const lightingMode = useWorldStore((w) => w.lightingMode);
  const t = useCameraStore((s) => s.telemetry);
  const records = useAssetStore((s) => s.records);
  const tiles = useTerrainStore((s) => s.activeTileIds);
  const imagery = useTerrainStore((s) => s.imageryTileIds);
  const lod0 = useTerrainStore((s) => s.lod0Ready);
  const msg = useSceneStore((s) => s.lastMessage);
  const detail = useTerrainStore((s) => s.detailStrength);
  const list = Object.values(records);
  const loading = list.filter((r) => r.status === 'LOADING' || r.status === 'RESOLVING' || r.status === 'REQUESTED').length;
  const loaded = list.filter((r) => r.status === 'LOADED' || r.status === 'ACTIVE').length;
  const failed = list.filter((r) => r.status === 'FAILED').length;
  const lighting = lightingMode === 'ephemeris' ? 'lighting: real Sun for the world-clock time' : lightingMode === 'auto' ? 'lighting: visualization (planner), not the real Sun' : 'lighting: manual';
  return (
    <footer className="statusbar mono" aria-label="Telemetry">
      <span className="status-group" title="camera telemetry">
        <span>☾ {fmtKm(t.distanceToMoonKm)}</span>
        {t.aglKm != null && t.surfaceMode ? (
          <span title={`height above the local LOLA terrain (terrain ${(t.groundKm ?? 0) >= 0 ? '+' : ''}${Math.round((t.groundKm ?? 0) * 1000)} m vs the 1737.4 km datum)`}>AGL {fmtKm(Math.max(0, t.aglKm), t.aglKm < 100 ? 2 : 0)}</span>
        ) : (
          <span title="height above the Moon's mean sphere (1737.4 km)">alt {fmtKm(t.altitudeKm, t.altitudeKm < 100 ? 2 : 0)}</span>
        )}
        <span>sub-point {formatLatLon(t.subLat, t.subLon)}</span>
        <span>⊕ {fmtKm(t.distanceToEarthKm)}</span>
      </span>
      <span className="sep" />
      <span className="status-group" title="streaming">
        <span className={lod0 ? '' : 'warn'}>DEM {lod0 ? 'ready' : 'loading'}</span>
        <span>tiles {tiles.length}</span>
        <span>WAC {imagery.length}</span>
        <span>assets {loaded}{loading ? ` · ${loading} loading` : ''}{failed ? ` · ${failed} failed` : ''}</span>
      </span>
      {msg && <><span className="sep" /><span className="msg" title={msg}>{msg}</span></>}
      <span className="grow" />
      <span className="dim status-truth" title={`${lighting}${detail > 0 ? ' · close-range micro-detail is procedural shading (visualization aid), not measured relief' : ''}`}>km frame · Moon body-fixed (IAU) · {lighting}{detail > 0 ? ` · detail: procedural ${Math.round(detail * 100)}% (aid)` : ''}</span>
    </footer>
  );
}
