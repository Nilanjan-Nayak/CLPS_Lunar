import { useEffect } from 'react';
import { useSelectionStore } from '@/state/selectionStore';

/**
 * Global interaction glue: Escape clears the selection, background click clears it (wired in LunarScene).
 * Object-level picking is done with R3F pointer events on each marker/model.
 */
export function useSceneInteraction() {
  const select = useSelectionStore((s) => s.select);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);
  return { clear: () => select(null) };
}
