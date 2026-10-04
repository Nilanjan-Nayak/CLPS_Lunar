import { DataTexture, NearestFilter, RedFormat, UnsignedByteType, ClampToEdgeWrapping } from 'three';

export interface LatLonBounds { west: number; east: number; north: number; south: number }

/**
 * CoverageMask — a tiny R8 texture over a lat/lon rectangle that marks which cells are covered by a finer LOD.
 * The coarser mesh discards fragments where the mask is set, so LOD levels *replace* each other instead of
 * z-fighting (LOD0 globe ← LOD1 tiles ← LOD2 imagery patches). Cell grids align with the WMTS tile scheme.
 */
export class CoverageMask {
  readonly texture: DataTexture;
  private data: Uint8Array;
  private dirty = false;

  constructor(readonly bounds: LatLonBounds, readonly cols: number, readonly rows: number) {
    this.data = new Uint8Array(cols * rows);
    this.texture = new DataTexture(this.data as unknown as BufferSource, cols, rows, RedFormat, UnsignedByteType);
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;
  }

  clear() {
    if (this.data.some((v) => v !== 0)) {
      this.data.fill(0);
      this.dirty = true;
    }
  }

  /** Mark every cell whose centre lies inside `b`. */
  cover(b: LatLonBounds) {
    const { west, east, north, south } = this.bounds;
    const dx = (east - west) / this.cols, dy = (north - south) / this.rows;
    const x0 = Math.max(0, Math.floor((b.west - west) / dx + 1e-6)), x1 = Math.min(this.cols - 1, Math.ceil((b.east - west) / dx - 1e-6) - 1);
    const y0 = Math.max(0, Math.floor((north - b.north) / dy + 1e-6)), y1 = Math.min(this.rows - 1, Math.ceil((north - b.south) / dy - 1e-6) - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * this.cols + x;
      if (this.data[i] !== 255) { this.data[i] = 255; this.dirty = true; }
    }
  }

  commit() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose() {
    this.texture.dispose();
  }
}

/** Shared masks: one for the LOD0 globe (16×8 cells = LOD1 tiles) and one per LOD1 tile (64×64 cells = WMTS level-9 grid). */
class TerrainMasks {
  readonly lod0 = new CoverageMask({ west: -180, east: 180, north: 90, south: -90 }, 16, 8);
  private lod1 = new Map<string, CoverageMask>();

  forTile(id: string, bounds: LatLonBounds) {
    let m = this.lod1.get(id);
    if (!m) {
      m = new CoverageMask(bounds, 64, 64);
      this.lod1.set(id, m);
    }
    return m;
  }

  /** Recompute everything from the current active sets (cheap: a few hundred bytes). */
  update(activeLod1: { id: string; bounds: LatLonBounds }[], imagery: { parentId: string; bounds: LatLonBounds }[]) {
    this.lod0.clear();
    for (const t of activeLod1) this.lod0.cover(t.bounds);
    this.lod0.commit();
    for (const m of this.lod1.values()) m.clear();
    for (const t of activeLod1) this.forTile(t.id, t.bounds);
    for (const i of imagery) {
      const parent = activeLod1.find((t) => t.id === i.parentId);
      if (parent) this.forTile(parent.id, parent.bounds).cover(i.bounds);
    }
    for (const m of this.lod1.values()) m.commit();
  }

  release(id: string) {
    this.lod1.get(id)?.dispose();
    this.lod1.delete(id);
  }
}

export const terrainMasks = new TerrainMasks();
