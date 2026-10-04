import { useSceneStore } from '@/state/sceneStore';
import { useWorldStore } from '@/state/worldStore';
import { SolarSystem } from '@/solar-system/SolarSystem';
import { ClockDriver } from '@/solar-system/ephemerisDriver';
import { NightAid } from '@/lunar-world/overlays/NightAid';
import { DevCamera } from './DevCamera';
import { Moon } from '@/lunar-world/moon/Moon';
import { LandingSite } from '@/lunar-world/locations/LandingSite';
import { LunarRegion } from '@/lunar-world/locations/LunarRegion';
import { SpacecraftSystem } from '@/lunar-world/spacecraft/SpacecraftSystem';
import { TrajectorySystem } from '@/lunar-world/trajectories/Trajectory';
import { CoordinateGrid } from '@/lunar-world/overlays';
import { CameraRig } from '@/lunar-world/camera/CameraRig';
import { defaultLayers } from '@/scene-manager/SceneConfig';
import { useSceneInteraction } from '@/lunar-world/interaction/useSceneInteraction';
import { HistoricLanding } from '@/features/history/HistoricLanding';
import { PlanSite } from '@/features/planning/PlanSite';
import { AnalysisGrid } from '@/features/planning/AnalysisGrid';
import { MissionSimulation } from '@/features/planning/MissionSimulation';
import { Journey } from '@/lunar-world/trajectories/Journey';

/**
 * LunarScene — declarative projection of the active SceneConfig into the 3D world.
 * Nothing here knows about specific missions: it renders whatever objects/layers the ScenePlanner produced.
 */
export function LunarScene() {
  const config = useSceneStore((s) => s.config);
  const gridSetting = useWorldStore((s) => s.showCoordinateGrid);
  const layers = config?.layers ?? defaultLayers();
  const objects = config?.objects ?? [];
  const { clear } = useSceneInteraction();
  return (
    <>
      <ClockDriver />
      <CameraRig />
      <SolarSystem layers={layers} />
      <NightAid />
      {layers.moon && <Moon scientificGlobe={layers.moonScientificGlobe} terrain={layers.terrain} imagery={layers.imagery} terrainOverlay={layers.overlays.terrain} />}
      <CoordinateGrid visible={gridSetting || layers.overlays.coordinateGrid} />
      {layers.regions && objects.filter((o) => o.kind === 'region').map((o) => <LunarRegion key={o.id} object={o} />)}
      {layers.landingSites && objects.filter((o) => o.kind === 'landing-site').map((o) => <LandingSite key={o.id} object={o} />)}
      {layers.landingSites && objects.filter((o) => o.kind === 'historic-landing').map((o) => <HistoricLanding key={o.id} object={o} />)}
      {objects.filter((o) => o.kind === 'plan-site').map((o) => <PlanSite key={o.id} object={o} />)}
      {layers.overlays.science !== false && objects.filter((o) => o.kind === 'analysis-grid').map((o) => <AnalysisGrid key={o.id} object={o} />)}
      {layers.trajectories && objects.filter((o) => o.kind === 'simulation').map((o) => <MissionSimulation key={o.id} object={o} />)}
      {layers.trajectories && objects.filter((o) => o.kind === 'journey').map((o) => <Journey key={o.id} object={o} />)}
      <SpacecraftSystem objects={objects} visible={layers.spacecraft} />
      <TrajectorySystem objects={objects} visible={layers.trajectories} />
      {import.meta.env.DEV && <DevCamera />}
      {/* background click clears selection */}
      <mesh visible={false} onPointerMissed={clear} />
    </>
  );
}
