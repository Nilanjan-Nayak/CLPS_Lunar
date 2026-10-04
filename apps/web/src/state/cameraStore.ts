import { create } from 'zustand';
import type { CameraState } from '@/constants/cameraStates';

export interface CameraFocus { latitude: number; longitude: number; elevationKm?: number | null; label?: string }

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
  telemetry: { distanceToMoonKm: number; altitudeKm: number; subLat: number; subLon: number; distanceToEarthKm: number };
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
  telemetry: { distanceToMoonKm: 0, altitudeKm: 0, subLat: 0, subLon: 0, distanceToEarthKm: 0 },
  requestFlight: (path, focus, legDuration = 2.2) => set({ flight: { id: ++flightSeq, path, focus, legDuration }, focus: focus ?? null }),
  setState: (state) => set({ state }),
  setFlying: (flying) => set({ flying }),
  setTelemetry: (telemetry) => set({ telemetry }),
}));
