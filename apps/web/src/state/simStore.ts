import { create } from 'zustand';
import { Vector3 } from 'three';
import type { PlanPhase, PlanResult } from '@/types/domain';

/** Real seconds each phase should take on screen when speed = 1× (mission time is compressed per phase). */
export const PHASE_SCREEN_SECONDS: Record<PlanPhase['id'], number> = { launch: 5, separation: 4, transfer: 14, loi: 10, landing: 26, surface: 8, relay: 6 };

/** Mutable camera request written by the simulation every frame and consumed by the CameraRig (no store churn). */
export const simCamera = { active: false, position: new Vector3(), target: new Vector3(), up: new Vector3(0, 1, 0) };

interface SimStore {
  plan: PlanResult | null;
  /** mission elapsed time (s) */
  t: number;
  playing: boolean;
  speed: number;
  follow: boolean;
  finished: boolean;
  readout: { phaseId: PlanPhase['id'] | null; altitudeKm: number; speedMps: number; massKg: number; throttle: number; distanceToMoonKm: number };
  setPlan: (p: PlanResult | null) => void;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setT: (t: number) => void;
  setSpeed: (s: number) => void;
  setFollow: (f: boolean) => void;
  setReadout: (r: SimStore['readout']) => void;
}

export const useSimStore = create<SimStore>((set) => ({
  plan: null,
  t: 0,
  playing: false,
  speed: 1,
  follow: true,
  finished: false,
  readout: { phaseId: null, altitudeKm: 0, speedMps: 0, massKg: 0, throttle: 0, distanceToMoonKm: 0 },
  setPlan: (plan) => set({ plan, t: 0, playing: false, finished: false }),
  play: () => set((s) => ({ playing: true, t: s.finished ? 0 : s.t, finished: false })),
  pause: () => set({ playing: false }),
  restart: () => set({ t: 0, playing: true, finished: false }),
  setT: (t) => set({ t, finished: false }),
  setSpeed: (speed) => set({ speed }),
  setFollow: (follow) => set({ follow }),
  setReadout: (readout) => set({ readout }),
}));

export function phaseAt(plan: PlanResult, t: number): PlanPhase {
  const ph = plan.timeline.phases;
  return ph.find((p) => t < p.endS) ?? ph[ph.length - 1];
}

/** mission seconds advanced per real second inside a phase (so every phase is watchable). */
export function missionRate(phase: PlanPhase, speed: number) {
  return (phase.durationS / PHASE_SCREEN_SECONDS[phase.id]) * speed;
}

export function formatMissionTime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return d > 0 ? `T+${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m` : `T+${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
