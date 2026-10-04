import { create } from 'zustand';
import type { SceneConfig, SceneLayers } from '@/scene-manager/SceneConfig';

interface SceneStore {
  config: SceneConfig | null;
  history: string[];
  lastMessage: string | null;
  setConfig: (config: SceneConfig) => void;
  toggleLayer: (path: string) => void;
  setMessage: (m: string | null) => void;
}

function setPath(layers: SceneLayers, path: string): SceneLayers {
  const next = JSON.parse(JSON.stringify(layers)) as SceneLayers;
  const parts = path.split('.');
  let cur: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] as Record<string, unknown>;
  const key = parts[parts.length - 1];
  cur[key] = !cur[key];
  return next;
}

export const useSceneStore = create<SceneStore>((set) => ({
  config: null,
  history: [],
  lastMessage: null,
  setConfig: (config) => set((s) => ({ config, history: [...s.history.slice(-19), config.title] })),
  toggleLayer: (path) => set((s) => (s.config ? { config: { ...s.config, layers: setPath(s.config.layers, path) } } : s)),
  setMessage: (lastMessage) => set({ lastMessage }),
}));
