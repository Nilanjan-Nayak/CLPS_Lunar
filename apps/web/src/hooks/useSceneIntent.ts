import { useEffect, useRef } from 'react';
import type { SceneIntent } from '@/scene-manager/SceneConfig';
import { sceneManager } from '@/scene-manager/SceneManager';
import { usePlannerData } from './usePlannerData';

/**
 * Route → intent bridge. A page declares *what* it wants to see; once the API data is there the SceneManager plans
 * and applies it. Re-runs only when the intent (by value) changes or the mission detail arrives.
 */
export function useSceneIntent(intent: SceneIntent | null) {
  const missionId = intent && 'missionId' in intent ? intent.missionId : undefined;
  const { data, ready, error } = usePlannerData(missionId, intent);
  const key = JSON.stringify(intent);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || !data) return;
    if (lastKey.current === key) return;
    lastKey.current = key;
    sceneManager.run(intent, data);
  }, [key, data, intent]);
  return { ready, error, data };
}
