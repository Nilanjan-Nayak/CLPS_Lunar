import { create } from 'zustand';
import type { CameraState } from '@/constants/cameraStates';

export interface CameraFocus { latitude: number; longitude: number; elevationKm?: number | null; label?: string }

export interface CameraTelemetry {
  distanceToMoonKm: number;
  /** above the Moon's mean sphere (1737.4 km) */
  altitudeKm: number;
  /** above the local terrain (LOLA DEM at the camera sub-point) — null until the DEM is loaded */
  aglKm: number | null;
  /** terrain elevation under the camera (km above the datum) */
  groundKm: number | null;
  subLat: number;
  subLon: number;
  distanceToEarthKm: number;
  /** view direction in the local east-north-up frame at the camera sub-point */
  headingDeg: number;
  pitchDeg: number;
  /** distance from the camera to the orbit target (what you are looking at) */
  targetDistanceKm: number;
  /** ground width across the viewport at the target distance (for the scale bar) */
  viewWidthKm: number;
  /** true while the surface navigation regime is active (target on the ground, camera < 1500 km) */
  surfaceMode: boolean;
}

export interface FlightRequest {
  id: number;
  path: CameraState[];
  focus: CameraFocus | null;
  /** seconds per leg (the last leg gets a little longer) */
  legDuration: number;
}

interface CameraStore {
  state: CameraState;
  focus: CameraFocus | null;
  flight: FlightRequest | null;
  flying: boolean;
  /** live telemetry written by the rig every ~100 ms for the HUD */
  telemetry: CameraTelemetry;
  requestFlight: (path: CameraState[], focus: CameraFocus | null, legDuration?: number) => void;
  setState: (s: CameraState) => void;
  setFlying: (f: boolean) => void;
  setTelemetry: (t: CameraStore['telemetry']) => void;
}

let flightSeq = 0;
export const useCameraStore = create<CameraStore>((set) => ({
  state: 'SPACE',
  focus: null,
  flight: null,
  flying: false,
  telemetry: { distanceToMoonKm: 0, altitudeKm: 0, aglKm: null, groundKm: null, subLat: 0, subLon: 0, distanceToEarthKm: 0, headingDeg: 0, pitchDeg: 0, targetDistanceKm: 0, viewWidthKm: 0, surfaceMode: false },
  requestFlight: (path, focus, legDuration = 2.2) => set({ flight: { id: ++flightSeq, path, focus, legDuration }, focus: focus ?? null }),
  setState: (state) => set({ state }),
  setFlying: (flying) => set({ flying }),
  setTelemetry: (telemetry) => set({ telemetry }),
}));
