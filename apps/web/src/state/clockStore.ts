import { create } from 'zustand';

/**
 * World clock — the single time base of the virtual environment.
 *
 *   live     wall-clock UTC (default): the Sun, Earth and stars are where they are *now*
 *   fixed    a chosen epoch, optionally running at `rate` × real time (0 = paused); set by the user (pinned) or by a
 *            scene (e.g. "IM-2 landing 2025-03-06 17:28:50Z") — scene-set times are not pinned and a new scene may replace them
 *   mission  driven by the mission simulation (launch UTC + simulated seconds)
 *
 * Per-frame consumers (Earth rotation, sky, Sun) read `worldClock.epochMs`, which the ClockDriver advances every frame;
 * the zustand state is published at a few Hz for the UI.
 */
export type ClockMode = 'live' | 'fixed' | 'mission';

export const CLOCK_RATES: { rate: number; label: string }[] = [
  { rate: 0, label: 'paused' },
  { rate: 1, label: '1×' },
  { rate: 60, label: '1 min/s' },
  { rate: 600, label: '10 min/s' },
  { rate: 3600, label: '1 h/s' },
  { rate: 21600, label: '6 h/s' },
  { rate: 86400, label: '1 day/s' },
];

interface ClockState {
  epochMs: number;
  mode: ClockMode;
  /** world seconds per real second while mode === 'fixed' */
  rate: number;
  /** true when the user picked the time explicitly → scenes must not override it */
  pinned: boolean;
  /** who set the time (shown in the HUD) */
  source: string;
  setLive: () => void;
  /** jump to an epoch; `pinned` defaults to true (user action) */
  setFixed: (epochMs: number, opts?: { rate?: number; source?: string; pinned?: boolean }) => void;
  setRate: (rate: number) => void;
  /** mission simulation hand-over (called by MissionSimulation while it is mounted) */
  setMission: (epochMs: number, source: string) => void;
  /** publish the running epoch (ClockDriver, few Hz) */
  publish: (epochMs: number) => void;
}

/** mutable, per-frame time base (kilohertz-safe: no React) */
export const worldClock = { epochMs: Date.now() };

export const useClockStore = create<ClockState>((set, get) => ({
  epochMs: Date.now(),
  mode: 'live',
  rate: 1,
  pinned: false,
  source: 'live UTC',
  setLive: () => { worldClock.epochMs = Date.now(); set({ mode: 'live', rate: 1, pinned: false, source: 'live UTC', epochMs: worldClock.epochMs }); },
  setFixed: (epochMs, opts) => {
    worldClock.epochMs = epochMs;
    set({ mode: 'fixed', epochMs, rate: opts?.rate ?? (get().mode === 'fixed' ? get().rate : 0), pinned: opts?.pinned ?? true, source: opts?.source ?? 'you' });
  },
  setRate: (rate) => set((s) => (s.mode === 'live' ? { mode: 'fixed', rate, pinned: true, source: 'you', epochMs: worldClock.epochMs } : { rate })),
  setMission: (epochMs, source) => { worldClock.epochMs = epochMs; set({ mode: 'mission', epochMs, source }); },
  publish: (epochMs) => set({ epochMs }),
}));

export const formatUtc = (ms: number, seconds = true) => {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, seconds ? 19 : 16).replace('T', ' ') + 'Z';
};
