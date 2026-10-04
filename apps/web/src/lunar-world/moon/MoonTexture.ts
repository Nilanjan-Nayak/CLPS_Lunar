import { Texture } from 'three';
import { assetManager } from '@/asset-system/AssetManager';
import { resolveByRole } from '@/asset-system/AssetResolver';
import { assetRegistry } from '@/asset-system/AssetRegistry';

/** Global albedo for the scientific globe (4k with LDAM polar fill, 2k fallback). flipY=false so v=0 is north. */
export async function loadMoonAlbedo(quality: 'low' | 'medium' | 'high'): Promise<{ texture: Texture; assetId: string }> {
  await assetRegistry.ensureLoaded();
  const entry = (quality === 'low' ? resolveByRole.moonAlbedo2k() : resolveByRole.moonAlbedo4k()) ?? resolveByRole.moonAlbedo2k();
  if (!entry) throw new Error('No Moon albedo texture in the asset manifest');
  const a = await assetManager.load(entry.assetId);
  if (a.kind !== 'texture') throw new Error('albedo asset is not a texture');
  a.texture.flipY = false;
  a.texture.needsUpdate = true;
  assetManager.acquire(entry.assetId);
  return { texture: a.texture, assetId: entry.assetId };
}

export async function loadMoonGlobalElevation() {
  await assetRegistry.ensureLoaded();
  const entry = resolveByRole.moonElevationGlobal();
  if (!entry) throw new Error('No global elevation asset in the manifest');
  const a = await assetManager.load(entry.assetId);
  if (a.kind !== 'elevation') throw new Error('elevation asset is not an elevation grid');
  assetManager.acquire(entry.assetId);
  return { grid: a.grid, assetId: entry.assetId };
}
