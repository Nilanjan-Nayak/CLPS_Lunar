import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { useSceneStore } from '@/state/sceneStore';
import { useTerrainStore } from '@/state/terrainStore';
import { useWorldStore } from '@/state/worldStore';
import { useSunDirection } from '@/hooks/useSunDirection';
import { vec3ToLatLon } from '@/utils/geo';
import type { LoadedTile } from './TerrainCache';
import { radiusForAltitude } from './TerrainLOD';
import { terrainLoader } from './TerrainLoader';
import { TerrainTile } from './TerrainTile';
import { imageryLoader, type LoadedImageryTile } from './ImageryLoader';
import { ImageryTile } from './ImageryTile';
import { terrainMasks } from './CoverageMask';

/**
 * TerrainSystem — camera-driven tile streaming.
 *   camera → sub-point + altitude → TerrainLOD radius (∪ scene focus radius) → required tiles → TerrainLoader → TerrainTile meshes
 * Tiles outside the working set are evicted (LRU) so memory stays bounded.
 */
export function TerrainSystem({ enabled, imagery, overlay }: { enabled: boolean; imagery: boolean; overlay: boolean }) {
  const camera = useThree((s) => s.camera);
  const exaggeration = useWorldStore((s) => s.elevationExaggeration);
  const quality = useWorldStore((s) => s.quality);
  const sunDir = useSunDirection();
  const [active, setActive] = useState<LoadedTile[]>([]);
  const [imageryTiles, setImageryTiles] = useState<{ tile: LoadedImageryTile; parent: LoadedTile }[]>([]);
  const last = useRef(0);
  const tmp = useRef(new Vector3());
  const focus = useSceneStore((s) => s.config?.focus ?? null);
  const focusRadius = useSceneStore((s) => s.config?.terrain.radiusKm ?? 0);
  const segments = quality === 'high' ? 180 : quality === 'low' ? 72 : 120;

  useEffect(() => {
    terrainLoader.ensureIndex().catch(() => undefined);
    imageryLoader.ensureIndex().catch(() => undefined);
  }, []);

  useFrame(({ clock }) => {
    if (!enabled) return;
    const t = clock.getElapsedTime();
    if (t - last.current < 0.4) return;
    last.current = t;
    if (!terrainLoader.tileIndex) return;

    tmp.current.copy(camera.position);
    const { latitude, longitude, radius } = vec3ToLatLon(tmp.current);
    const altitude = radius - MOON_RADIUS_KM;
    const camRadius = radiusForAltitude(altitude);
    const wanted = new Map<string, import('@/types/domain').TileEntry>();
    for (const e of terrainLoader.availableAround(latitude, longitude, camRadius)) wanted.set(e.id, e);
    if (focus && focusRadius > 0 && altitude < 12000) for (const e of terrainLoader.availableAround(focus.latitude, focus.longitude, focusRadius)) wanted.set(e.id, e);

    const list = [...wanted.values()].slice(0, 12);
    const ready = terrainLoader.ensure(list);
    const keep = new Set(list.map((l) => l.id));
    terrainLoader.evict(keep);
    const store = useTerrainStore.getState();
    for (const e of list) if (!store.tiles[e.id] || store.tiles[e.id] === 'LOADED') store.setTile(e.id, ready.some((r) => r.entry.id === e.id) ? 'ACTIVE' : 'REQUESTED');
    const ids = ready.map((r) => r.entry.id);
    if (ids.length !== active.length || ids.some((id, i) => active[i]?.entry.id !== id)) {
      setActive(ready);
      store.setActive(ids);
    }

    // LOD2 imagery (100 m/px WAC) around the camera sub-point, draped on whichever LOD1 tile is loaded underneath.
    const level = imagery && imageryLoader.layer ? imageryLoader.levelForAltitude(altitude) : null;
    let next: { tile: LoadedImageryTile; parent: LoadedTile }[] = [];
    if (level != null) {
      const viewRadius = Math.min(900, Math.max(25, altitude * 1.6));
      const wantedImg = imageryLoader.tilesAround(latitude, longitude, viewRadius, level, level >= 8 ? 24 : 16);
      const readyImg = imageryLoader.ensure(wantedImg, 8);
      imageryLoader.evict(new Set(wantedImg.map((w) => w.id)));
      for (const t of readyImg) {
        const c = { lat: (t.entry.bounds.north + t.entry.bounds.south) / 2, lon: (t.entry.bounds.west + t.entry.bounds.east) / 2 };
        const parent = ready.find((p) => c.lat <= p.entry.bounds.north && c.lat >= p.entry.bounds.south && c.lon >= p.entry.bounds.west && c.lon < p.entry.bounds.east);
        if (parent) next.push({ tile: t, parent });
      }
    }
    const nextIds = next.map((n) => n.tile.entry.id + '@' + n.parent.entry.id);
    const curIds = imageryTiles.map((n) => n.tile.entry.id + '@' + n.parent.entry.id);
    const lod1Changed = ids.length !== active.length || ids.some((id, i) => active[i]?.entry.id !== id);
    if (lod1Changed || nextIds.length !== curIds.length || nextIds.some((id, i) => curIds[i] !== id)) {
      setImageryTiles(next);
      store.setImagery(next.map((n) => n.tile.entry.id));
      terrainMasks.update(ready.map((r) => ({ id: r.entry.id, bounds: r.entry.bounds })), next.map((n) => ({ parentId: n.parent.entry.id, bounds: n.tile.entry.bounds })));
    }
  });

  useEffect(() => {
    if (!enabled && active.length) {
      setActive([]);
      setImageryTiles([]);
      useTerrainStore.getState().setActive([]);
      useTerrainStore.getState().setImagery([]);
      terrainMasks.update([], []);
    }
  }, [enabled, active.length]);

  if (!enabled) return null;
  return (
    <group name="terrain-lod1">
      {active.map((tile) => (
        <TerrainTile key={tile.entry.id} tile={tile} fallbackColor={null} exaggeration={exaggeration} sunDir={sunDir} overlay={overlay} segments={segments} />
      ))}
      <group name="imagery-lod2">
        {imageryTiles.map(({ tile, parent }) => (
          <ImageryTile key={tile.entry.id + '@' + parent.entry.id} tile={tile} parent={parent} exaggeration={exaggeration} sunDir={sunDir} overlay={overlay} />
        ))}
      </group>
    </group>
  );
}
