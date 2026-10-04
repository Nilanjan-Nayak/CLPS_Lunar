import { LinearFilter, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace, Texture, TextureLoader as ThreeTextureLoader } from 'three';
import type { AssetEntry } from '@/types/domain';
import type { ElevationGrid } from './AssetMetadata';

const loader = new ThreeTextureLoader();

export async function loadColorTexture(url: string, anisotropy = 8, linear = false): Promise<Texture> {
  const t = await loader.loadAsync(url);
  t.colorSpace = linear ? NoColorSpace : SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Decode an RGB-encoded uint16 DEM (R*256+G half-metres, ref radius 1,727,400 m) to km above the 1737.4 km datum. */
export async function loadElevationGrid(url: string, bounds: ElevationGrid['bounds'], entry?: AssetEntry): Promise<ElevationGrid> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`elevation ${res.status} ${url}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  const width = bmp.width, height = bmp.height;
  const img = ctx.getImageData(0, 0, width, height).data;
  const n = width * height;
  const data = new Float32Array(n);
  const scale = Number((entry?.encoding as { scale?: number } | undefined)?.scale ?? 0.5);
  const ref = Number((entry?.encoding as { referenceRadiusM?: number } | undefined)?.referenceRadiusM ?? 1_727_400);
  const datum = Number((entry?.encoding as { datumRadiusM?: number } | undefined)?.datumRadiusM ?? 1_737_400);
  let minKm = Infinity, maxKm = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = img[i * 4] * 256 + img[i * 4 + 1];
    const km = (v * scale + ref - datum) / 1000;
    data[i] = km;
    if (km < minKm) minKm = km;
    if (km > maxKm) maxKm = km;
  }
  bmp.close?.();
  return { width, height, data, bounds, minKm, maxKm };
}
