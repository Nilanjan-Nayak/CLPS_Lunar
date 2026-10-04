import { useWorldStore } from '@/state/worldStore';
import { useAssetStore } from '@/state/assetStore';
import { useCameraStore } from '@/state/cameraStore';
import { useSceneStore } from '@/state/sceneStore';
import { useTerrainStore } from '@/state/terrainStore';
import { fmtKm } from '@/utils/format';
import { formatLatLon } from '@/utils/geo';

export function StatusBar() {
  const lightingMode = useWorldStore((w) => w.lightingMode);
  const t = useCameraStore((s) => s.telemetry);
  const records = useAssetStore((s) => s.records);
  const tiles = useTerrainStore((s) => s.activeTileIds);
  const imagery = useTerrainStore((s) => s.imageryTileIds);
  const lod0 = useTerrainStore((s) => s.lod0Ready);
  const msg = useSceneStore((s) => s.lastMessage);
  const list = Object.values(records);
  const loading = list.filter((r) => r.status === 'LOADING' || r.status === 'RESOLVING' || r.status === 'REQUESTED').length;
  const loaded = list.filter((r) => r.status === 'LOADED' || r.status === 'ACTIVE').length;
  const failed = list.filter((r) => r.status === 'FAILED').length;
  return (
    <footer className="statusbar mono">
      <span>Moon dist {fmtKm(t.distanceToMoonKm)}</span>
      <span>alt {fmtKm(t.altitudeKm, t.altitudeKm < 100 ? 2 : 0)}</span>
      <span>sub-point {formatLatLon(t.subLat, t.subLon)}</span>
      <span>Earth dist {fmtKm(t.distanceToEarthKm)}</span>
      <span className="sep" />
      <span>DEM LOD0 {lod0 ? 'ready' : 'loading'}</span>
      <span>tiles {tiles.length}</span>
      <span>WAC imagery {imagery.length}</span>
      <span>assets {loaded} loaded{loading ? ` · ${loading} loading` : ''}{failed ? ` · ${failed} failed` : ''}</span>
      {msg && <span className="msg">{msg}</span>}
      <span className="grow" />
      <span className="dim">km frame · Moon body-fixed (IAU) · lighting = {lightingMode === 'ephemeris' ? 'real Sun for the world-clock time' : lightingMode === 'auto' ? 'visualization (planner), not the real Sun' : 'manual'}</span>
    </footer>
  );
}
