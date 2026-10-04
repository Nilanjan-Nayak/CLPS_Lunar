import type { Spacecraft } from '@/types/domain';
import { SpacecraftRegistry, spacecraftRegistry } from './SpacecraftRegistry';

export interface ResolvedSpacecraft {
  assetId: string | null;
  /** Multiplier over true scale so the object stays visible at km-scale camera distances. Declared in the HUD. */
  displayScale?: number;
  reason?: string;
}

/**
 * SpacecraftResolver — Mission data → spacecraftId → registry → asset (or an honest "no asset" answer).
 */
export class SpacecraftResolver {
  constructor(private registry: SpacecraftRegistry = spacecraftRegistry) {}

  resolve(sc: Pick<Spacecraft, 'id' | 'name' | 'type' | 'assetId' | 'assetStatus' | 'assetNote'>): ResolvedSpacecraft {
    const binding = this.registry.get(sc.id);
    const assetId = binding?.assetId ?? sc.assetId ?? null;
    if (!assetId) {
      return { assetId: null, reason: sc.assetNote ?? binding?.assetNote ?? 'No official NASA 3D asset — shown as an information marker.' };
    }
    if (!this.registry.asset(assetId)) {
      return { assetId: null, reason: `Asset '${assetId}' is referenced but missing from the asset manifest — shown as an information marker.` };
    }
    // Orbiters live ~100 km up: a 4 m model needs enlargement to be perceivable; landers are viewed closer.
    const displayScale = sc.type === 'orbiter' ? 400 : 60;
    return { assetId, displayScale };
  }
}

export const spacecraftResolver = new SpacecraftResolver();
