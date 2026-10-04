import { BufferAttribute, BufferGeometry } from 'three';
import { latLonToVec3 } from '@/utils/geo';

export interface LatLonBounds { west: number; east: number; north: number; south: number }

/**
 * Lat/lon grid patch on the datum sphere. uv: u = west→east, v = north→south (image row order).
 * The vertex shader re-derives the position from uv + DEM, so `position` only seeds culling/bounds.
 */
export function buildLatLonPatch(bounds: LatLonBounds, segX: number, segY: number, radius: number): BufferGeometry {
  const nx = segX + 1, ny = segY + 1;
  const positions = new Float32Array(nx * ny * 3);
  const uvs = new Float32Array(nx * ny * 2);
  const v3 = latLonToVec3(0, 0, radius);
  let p = 0, q = 0;
  for (let j = 0; j < ny; j++) {
    const v = j / segY;
    const lat = bounds.north + (bounds.south - bounds.north) * v;
    for (let i = 0; i < nx; i++) {
      const u = i / segX;
      const lon = bounds.west + (bounds.east - bounds.west) * u;
      latLonToVec3(lat, lon, radius, v3);
      positions[p++] = v3.x; positions[p++] = v3.y; positions[p++] = v3.z;
      uvs[q++] = u; uvs[q++] = v;
    }
  }
  const indices = new (nx * ny > 65535 ? Uint32Array : Uint16Array)(segX * segY * 6);
  let k = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(new BufferAttribute(indices, 1));
  g.computeBoundingSphere();
  // Displacement can move vertices ±11 km; expand the bounding sphere so frustum culling never clips a tile.
  if (g.boundingSphere) g.boundingSphere.radius += 40;
  return g;
}
