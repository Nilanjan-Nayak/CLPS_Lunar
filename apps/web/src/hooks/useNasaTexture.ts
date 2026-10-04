import { useEffect, useState } from 'react';
import type { Texture } from 'three';
import { assetManager } from '@/asset-system/AssetManager';
import type { AssetEntry } from '@/types/domain';

/** Load (and reference-count) a texture asset — optionally a lower-resolution `variant` — through the AssetManager. */
export function useNasaTexture(assetId: string | null | undefined, variant?: string) {
  const [state, setState] = useState<{ texture: Texture; entry: AssetEntry } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setState(null);
    setError(null);
    assetManager
      .load(assetId, variant)
      .then((a) => {
        if (cancelled || a.kind !== 'texture') return;
        assetManager.acquire(assetId, variant);
        setState({ texture: a.texture, entry: a.entry });
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      if (assetManager.get(assetId, variant)) assetManager.release(assetId, variant);
    };
  }, [assetId, variant]);
  return { texture: state?.texture ?? null, entry: state?.entry ?? null, error };
}
