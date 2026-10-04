import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from 'three';
import { MOON_RADIUS_KM } from '@/constants/frames';
import { elevationResolver } from '@/lunar-world/terrain/ElevationResolver';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useTerrainStore } from '@/state/terrainStore';
import { useWorldStore } from '@/state/worldStore';
import { latLonToVec3 } from '@/utils/geo';
import type { PlanResult } from '@/types/domain';

const LOW = new Color('#ff5a5a'), MID = new Color('#ffd166'), HIGH = new Color('#5ee6a8');

/**
 * AnalysisGrid — the research engine's site-suitability grid (slope / roughness / illumination heuristic on the
 * LOLA-derived DEM) draped on the rendered terrain with vertex colours. Semi-transparent so the WAC imagery stays visible.
 */
export function AnalysisGrid({ object }: { object: SceneObject }) {
  const grid = (object.data?.grid as PlanResult['analysisGrid'] | undefined) ?? null;
  const exaggeration = useWorldStore((s) => s.elevationExaggeration);
  const tiles = useTerrainStore((s) => s.activeTileIds);
  const lod0 = useTerrainStore((s) => s.lod0Ready);
  const geometry = useMemo(() => {
    if (!grid) return null;
    const { rows, cols, bounds, suitability } = grid;
    const g = new BufferGeometry();
    const pos = new Float32Array((rows + 1) * (cols + 1) * 3);
    const col = new Float32Array((rows + 1) * (cols + 1) * 3);
    const c = new Color();
    for (let r = 0; r <= rows; r++) {
      const lat = bounds.north - (r / rows) * (bounds.north - bounds.south);
      for (let q = 0; q <= cols; q++) {
        const lon = bounds.west + (q / cols) * (bounds.east - bounds.west);
        const f = elevationResolver.surface(lat, lon, exaggeration);
        const p = f ? f.position.clone() : latLonToVec3(lat, lon, MOON_RADIUS_KM);
        p.multiplyScalar(1 + 0.06 / p.length()); // 60 m lift
        const i = (r * (cols + 1) + q) * 3;
        pos[i] = p.x; pos[i + 1] = p.y; pos[i + 2] = p.z;
        // vertex colour = average suitability of the touching cells
        let sum = 0, n = 0;
        for (const rr of [r - 1, r]) for (const qq of [q - 1, q]) if (rr >= 0 && rr < rows && qq >= 0 && qq < cols) { sum += suitability[rr * cols + qq]; n++; }
        const v = n ? sum / n : 0;
        if (v < 0.5) c.copy(LOW).lerp(MID, v / 0.5); else c.copy(MID).lerp(HIGH, (v - 0.5) / 0.5);
        col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const a = r * (cols + 1) + q, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, exaggeration, tiles, lod0]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={4}>
      <meshBasicMaterial vertexColors transparent opacity={0.42} depthWrite={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
    </mesh>
  );
}
