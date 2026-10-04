import { WorldRenderer } from './WorldRenderer';
import { LunarScene } from './LunarScene';

/** LunarWorld — mount point for the whole 3D environment (Solar-System context + Moon + mission layer). */
export function LunarWorld() {
  return (
    <WorldRenderer>
      <LunarScene />
    </WorldRenderer>
  );
}
