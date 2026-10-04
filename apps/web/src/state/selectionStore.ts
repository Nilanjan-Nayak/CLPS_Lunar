import { create } from 'zustand';

export type Selectable =
  | { kind: 'mission'; id: string }
  | { kind: 'landing-site'; id: string }
  | { kind: 'region'; id: string }
  | { kind: 'spacecraft'; id: string; missionId?: string }
  | { kind: 'earth' }
  | { kind: 'moon' };

interface SelectionStore {
  selected: Selectable | null;
  hovered: Selectable | null;
  select: (s: Selectable | null) => void;
  hover: (s: Selectable | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selected: null,
  hovered: null,
  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),
}));
