import { create } from 'zustand';

/** WorldSettings — rendering/visualization knobs. Everything here is presentation, never data. */
export interface WorldSettings {
  /** Sun direction as a sub-solar point on the Moon. In 'ephemeris' mode the ClockDriver writes it from the world clock. */
  subsolarLongitudeDeg: number;
  subsolarLatitudeDeg: number;
  /**
   * ephemeris = the real Sun for the world-clock time (default; live UTC unless a scene/user/mission sets the clock)
   * auto      = the ScenePlanner's visualization lighting (keeps the subject lit — explicitly not the real Sun)
   * manual    = user-controlled sliders
   */
  lightingMode: 'ephemeris' | 'auto' | 'manual';
  /** faint fill light on the lunar night side so unlit terrain stays readable (visualization aid, declared in the HUD) */
  nightAid: boolean;
  elevationExaggeration: number; // 1 = true scale
  showLabels: boolean;
  showCoordinateGrid: boolean;
  moonRenderer: 'auto' | 'nasa-glb' | 'dem-globe';
  /** textures = NASA Blue Marble / Black Marble / cloud maps on an oriented sphere (day-night terminator, real rotation);
   *  nasa-glb = the NASA VTAD "Earth with Clouds" model (baked clouds; orientation calibrated from its texture) */
  earthRenderer: 'textures' | 'nasa-glb';
  /** svs = NASA SVS Deep Star Maps 2020 (real sky, oriented to the current time); procedural = synthetic fallback */
  skyRenderer: 'svs' | 'procedural';
  quality: 'low' | 'medium' | 'high';
}

interface WorldStore extends WorldSettings {
  set: (patch: Partial<WorldSettings>) => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  subsolarLongitudeDeg: 25,
  subsolarLatitudeDeg: 1.5,
  lightingMode: 'ephemeris',
  nightAid: true,
  elevationExaggeration: 1,
  showLabels: true,
  showCoordinateGrid: false,
  moonRenderer: 'auto',
  earthRenderer: 'textures',
  skyRenderer: 'svs',
  quality: 'medium',
  set: (patch) => set(patch),
}));
