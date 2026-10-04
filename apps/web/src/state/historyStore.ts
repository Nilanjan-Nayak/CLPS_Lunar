import { create } from 'zustand';
import type { HistoricMission } from '@/types/domain';

/** Chronological playback of historical lunar missions (the "Mission Lunar" card). */
interface HistoryStore {
  missions: HistoricMission[];
  /** number of missions revealed (chronological) */
  cursor: number;
  playing: boolean;
  selectedId: string | null;
  setMissions: (m: HistoricMission[]) => void;
  setCursor: (c: number) => void;
  step: (d: number) => void;
  play: () => void;
  pause: () => void;
  select: (id: string | null) => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  missions: [],
  cursor: 0,
  playing: false,
  selectedId: null,
  setMissions: (missions) => set({ missions: [...missions].sort((a, b) => a.eventDate.localeCompare(b.eventDate)), cursor: missions.length, selectedId: null }),
  setCursor: (cursor) => set({ cursor: Math.max(0, Math.min(cursor, get().missions.length)), selectedId: null }),
  step: (d) => set((s) => ({ cursor: Math.max(0, Math.min(s.cursor + d, s.missions.length)), selectedId: null })),
  play: () => set((s) => ({ playing: true, cursor: s.cursor >= s.missions.length ? 0 : s.cursor })),
  pause: () => set({ playing: false }),
  select: (selectedId) => set({ selectedId }),
}));
