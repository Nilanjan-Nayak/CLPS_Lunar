import { assetManager } from '@/asset-system/AssetManager';
import { terrainLoader } from '@/lunar-world/terrain/TerrainLoader';
import type { SceneConfig } from './SceneConfig';

/** SceneLoader — warms up everything a SceneConfig needs (assets + terrain tiles) so the flight lands on a ready scene. */
export async function preloadScene(config: SceneConfig) {
  const assetIds = new Set<string>();
  for (const o of config.objects) if (o.assetId) assetIds.add(o.assetId);
  assetManager.preload([...assetIds]);
  if (config.layers.terrain && config.focus && config.terrain.lod >= 1) {
    terrainLoader.prefetchAround(config.focus.latitude, config.focus.longitude, config.terrain.radiusKm).catch(() => undefined);
  }
}
