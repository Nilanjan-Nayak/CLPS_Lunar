import { useEffect, useState } from 'react';
import { Group } from 'three';
import { assetManager } from '@/asset-system/AssetManager';
import type { LoadedAsset } from '@/asset-system/AssetMetadata';

/** Load (and reference-count) a model asset through the AssetManager; returns a cloned scene graph per consumer. */
export function useNasaModel(assetId: string | null | undefined) {
  const [state, setState] = useState<{ scene: Group; asset: Extract<LoadedAsset, { kind: 'model' }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    assetManager
      .load(assetId)
      .then((a) => {
        if (cancelled || a.kind !== 'model') return;
        assetManager.acquire(assetId);
        setState({ scene: a.scene.clone(true), asset: a });
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      if (assetManager.get(assetId)) assetManager.release(assetId);
    };
  }, [assetId]);
  return { model: state, error };
}
