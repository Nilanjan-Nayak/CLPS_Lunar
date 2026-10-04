import { Earth } from './Earth';
import { Sun } from './Sun';
import { SkyMap } from './SkyMap';
import { NavigationPath } from './MoonOrbit';
import { BodyLabels } from './BodyLabels';
import type { SceneLayers } from '@/scene-manager/SceneConfig';

/** SolarSystem — context/navigation layer: real sky (SVS star map), Sun, Earth (ephemeris-placed), schematic paths. The Moon itself lives in lunar-world. */
export function SolarSystem({ layers }: { layers: SceneLayers }) {
  return (
    <group name="solar-system">
      <SkyMap visible={layers.stars} />
      <Sun visible={layers.sun} />
      <Earth visible={layers.earth} />
      <NavigationPath visible={layers.navigationPath} />
      {layers.navigationPath && <BodyLabels />}
    </group>
  );
}
