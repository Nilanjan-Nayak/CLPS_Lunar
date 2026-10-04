export const CAMERA_STATES = [
  'SPACE',
  'EARTH',
  'EARTH_ORBIT',
  'MOON_APPROACH',
  'MOON_ORBIT',
  'LUNAR_SURFACE',
  'LOCATION_FOCUS',
  'MISSION_FOCUS',
] as const;
export type CameraState = (typeof CAMERA_STATES)[number];

export const CAMERA_STATE_LABEL: Record<CameraState, string> = {
  SPACE: 'Space',
  EARTH: 'Earth',
  EARTH_ORBIT: 'Earth orbit',
  MOON_APPROACH: 'Moon approach',
  MOON_ORBIT: 'Moon orbit',
  LUNAR_SURFACE: 'Lunar surface',
  LOCATION_FOCUS: 'Location',
  MISSION_FOCUS: 'Mission',
};

export const CAMERA_STATE_INDEX = Object.fromEntries(CAMERA_STATES.map((s, i) => [s, i])) as Record<CameraState, number>;

export const SCENE_MODES = ['SOLAR_SYSTEM', 'MOON_OVERVIEW', 'LANDING_SITE', 'MISSION', 'MISSION_DETAILED', 'RESEARCH'] as const;
export type SceneMode = (typeof SCENE_MODES)[number];
