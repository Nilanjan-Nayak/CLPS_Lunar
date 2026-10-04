export { CoordinateGrid } from './CoordinateGrid';
/**
 * Overlay registry — the other overlays are *data* overlays that live in the HUD/data panels
 * (mission, payload, science) or are shader uniforms (terrain hypsometric tint via uOverlay).
 * Kept as an explicit list so the SceneConfig.layers.overlays keys map 1:1 to implementations.
 */
export const OVERLAY_IMPLEMENTATIONS = {
  coordinateGrid: 'scene:CoordinateGrid',
  terrain: 'shader:uOverlay (hypsometric tint on DEM globe + tiles)',
  mission: 'panel:MissionOverlay (InfoPanel)',
  payload: 'panel:PayloadOverlay (DataPanel)',
  science: 'panel:ScienceOverlay (DataPanel, terrain context)',
} as const;
