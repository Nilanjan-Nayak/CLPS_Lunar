import type { AssetEntry } from '@/types/domain';
import { assetRegistry } from './AssetRegistry';

/** AssetResolver — maps roles ("moon-model", "earth-model", "moon-albedo", …) to concrete manifest entries. */
export const resolveByRole = {
  earthModel: (): AssetEntry | undefined => assetRegistry.byType('planet-model')[0],
  moonModel: (): AssetEntry | undefined => assetRegistry.byType('moon-model').find((e) => e.assetId === 'nasa-svs-moon-small-glb') ?? assetRegistry.byType('moon-model')[0],
  moonAlbedo4k: (): AssetEntry | undefined => assetRegistry.get('nasa-cgi-moon-kit-color-poles-4k-jpg'),
  moonAlbedo2k: (): AssetEntry | undefined => assetRegistry.get('nasa-cgi-moon-kit-color-2k'),
  moonElevationGlobal: (): AssetEntry | undefined => assetRegistry.byType('elevation').find((e) => e.lod === 0),
  terrainTileset: (): AssetEntry | undefined => assetRegistry.byType('terrain-tileset')[0],
  /** real sky: NASA SVS Deep Star Maps (ICRF equirectangular) */
  skyMap: (): AssetEntry | undefined => byRole('sky-celestial'),
  /** NASA Visible Earth colour maps for the oriented Earth globe */
  earthDay: (): AssetEntry | undefined => byRole('earth-day'),
  earthNight: (): AssetEntry | undefined => byRole('earth-night'),
  earthClouds: (): AssetEntry | undefined => byRole('earth-clouds'),
};

function byRole(role: string): AssetEntry | undefined {
  return assetRegistry.all().find((e) => e.textureRole === role);
}
