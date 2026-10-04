import { useState } from 'react';
import { useSceneStore } from '@/state/sceneStore';
import { useWorldStore } from '@/state/worldStore';
import { Panel } from './primitives';

const LAYERS: { path: string; label: string }[] = [
  { path: 'stars', label: 'Stars' },
  { path: 'sun', label: 'Sun glow' },
  { path: 'earth', label: 'Earth' },
  { path: 'navigationPath', label: 'Earth→Moon schematic path' },
  { path: 'moon', label: 'Moon' },
  { path: 'moonScientificGlobe', label: 'DEM globe (LOLA)' },
  { path: 'terrain', label: 'LOD1 terrain tiles (LOLA 16 px/deg)' },
  { path: 'imagery', label: 'LOD2 imagery (LROC WAC 100 m/px)' },
  { path: 'regions', label: 'Regions' },
  { path: 'landingSites', label: 'Landing sites' },
  { path: 'spacecraft', label: 'Spacecraft' },
  { path: 'trajectories', label: 'Trajectories (verified only)' },
  { path: 'overlays.coordinateGrid', label: 'Coordinate grid' },
  { path: 'overlays.terrain', label: 'Hypsometric tint' },
];

export function SceneConfigPanel() {
  const config = useSceneStore((s) => s.config);
  const toggle = useSceneStore((s) => s.toggleLayer);
  const world = useWorldStore();
  const [open, setOpen] = useState(false);
  const get = (path: string) => {
    if (!config) return false;
    const parts = path.split('.');
    let cur: unknown = config.layers;
    for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
    return !!cur;
  };
  return (
    <Panel title="Scene config" collapsed={!open} onToggle={() => setOpen((o) => !o)} className="scene-config">
      {config && (
        <>
          <div className="mono dim small">mode {config.mode} · {config.objects.length} objects · terrain LOD{config.terrain.lod} r={config.terrain.radiusKm} km</div>
          <div className="toggles">
            {LAYERS.map((l) => (
              <label key={l.path}>
                <input type="checkbox" checked={get(l.path)} onChange={() => toggle(l.path)} /> {l.label}
              </label>
            ))}
          </div>
        </>
      )}
      <div className="sliders">
        <label>
          Elevation exaggeration <b>×{world.elevationExaggeration.toFixed(1)}</b>
          <input type="range" min={1} max={5} step={0.5} value={world.elevationExaggeration} onChange={(e) => world.set({ elevationExaggeration: +e.target.value })} />
        </label>
        <label className="row">
          Lighting
          <select value={world.lightingMode} onChange={(e) => world.set({ lightingMode: e.target.value as typeof world.lightingMode })}>
            <option value="ephemeris">real Sun (world clock, ephemeris ±0.05°)</option>
            <option value="auto">visualization (planner keeps the subject lit)</option>
            <option value="manual">manual sliders</option>
          </select>
        </label>
        {world.lightingMode === 'auto' && config?.lighting && <div className="small dim">{config.lighting.reason}</div>}
        {world.lightingMode === 'ephemeris' && config?.time && <div className="small dim">Scene time: {config.time.reason}. Real Sun, real Earth rotation/phase and the real star sky follow the world clock (bottom bar).</div>}
        {world.lightingMode === 'ephemeris' && (
          <label className="row">
            <input type="checkbox" checked={world.nightAid} onChange={(e) => world.set({ nightAid: e.target.checked })} /> Night aid (earthshine ×1000 on the near-side night — visualization)
          </label>
        )}
        <label>
          Sub-solar longitude <b>{world.subsolarLongitudeDeg}°</b>
          <input type="range" min={-180} max={180} step={1} value={world.subsolarLongitudeDeg} onChange={(e) => world.set({ subsolarLongitudeDeg: +e.target.value, lightingMode: 'manual' })} />
        </label>
        <label>
          Sub-solar latitude <b>{world.subsolarLatitudeDeg}°</b> <span className="dim">(real range ±1.6°; wider for visualization)</span>
          <input type="range" min={-30} max={30} step={0.5} value={world.subsolarLatitudeDeg} onChange={(e) => world.set({ subsolarLatitudeDeg: +e.target.value, lightingMode: 'manual' })} />
        </label>
        <label className="row">
          Sky
          <select value={world.skyRenderer} onChange={(e) => world.set({ skyRenderer: e.target.value as typeof world.skyRenderer })}>
            <option value="svs">NASA SVS Deep Star Maps 2020 (real sky)</option>
            <option value="procedural">procedural stars (fallback)</option>
          </select>
        </label>
        <label className="row">
          Earth renderer
          <select value={world.earthRenderer} onChange={(e) => world.set({ earthRenderer: e.target.value as typeof world.earthRenderer })}>
            <option value="textures">NASA Blue/Black Marble + clouds (oriented, day/night)</option>
            <option value="nasa-glb">NASA VTAD glTF (baked clouds, calibrated)</option>
          </select>
        </label>
        <label className="row">
          Moon renderer
          <select value={world.moonRenderer} onChange={(e) => world.set({ moonRenderer: e.target.value as typeof world.moonRenderer })}>
            <option value="auto">auto (distance)</option>
            <option value="nasa-glb">NASA GLB only</option>
            <option value="dem-globe">DEM globe only</option>
          </select>
        </label>
        <label className="row">
          Quality
          <select value={world.quality} onChange={(e) => world.set({ quality: e.target.value as typeof world.quality })}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="row">
          <input type="checkbox" checked={world.showLabels} onChange={(e) => world.set({ showLabels: e.target.checked })} /> Labels
        </label>
      </div>
    </Panel>
  );
}
