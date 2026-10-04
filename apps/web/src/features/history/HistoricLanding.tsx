import { useSurfaceAnchor } from '@/hooks/useSurfaceFrame';
import type { SceneObject } from '@/scene-manager/SceneConfig';
import { useHistoryStore } from '@/state/historyStore';
import { useSceneStore } from '@/state/sceneStore';
import { LocationMarker } from '@/lunar-world/locations/LocationMarker';
import type { HistoricMission } from '@/types/domain';

export const OUTCOME_COLOR: Record<string, string> = { success: '#5ee6a8', partial: '#ffd166', failure: '#ff6b6b' };
export const OUTCOME_GLYPH: Record<string, string> = { success: '●', partial: '◐', failure: '✕' };

/**
 * HistoricLanding — marker for a catalogued historical impact/landing attempt (NSSDCA/LROC coordinates).
 * In HISTORY scenes the chronological cursor decides which markers are revealed and which one carries the label.
 */
export function HistoricLanding({ object }: { object: SceneObject }) {
  const anchor = useSurfaceAnchor(object.placement?.latitude, object.placement?.longitude);
  const isHistory = useSceneStore((s) => s.config?.intent.type === 'HISTORY');
  const missions = useHistoryStore((s) => s.missions);
  const cursor = useHistoryStore((s) => s.cursor);
  const selectedId = useHistoryStore((s) => s.selectedId);
  const select = useHistoryStore((s) => s.select);
  const hist = object.data?.hist as HistoricMission | undefined;
  if (!anchor || !hist) return null;
  const rank = isHistory ? missions.findIndex((m) => m.id === hist.id) : -1;
  if (isHistory && rank >= cursor) return null;
  const current = isHistory ? (selectedId ? selectedId === hist.id : rank === cursor - 1) : selectedId === hist.id;
  const year = hist.eventDate.slice(0, 4);
  return (
    <LocationMarker
      anchor={anchor}
      label={hist.name}
      sublabel={`${year} · ${hist.agency} · ${hist.missionType} · ${hist.outcome}${hist.site?.precision === 'approx' ? ' · approx. site' : ''}`}
      color={OUTCOME_COLOR[hist.outcome] ?? '#8fd3ff'}
      glyph={OUTCOME_GLYPH[hist.outcome]}
      selected={current}
      approximate={hist.site?.precision === 'approx'}
      labelMaxDistanceKm={isHistory ? 1200 : 3200}
      onClick={() => select(hist.id)}
    />
  );
}
