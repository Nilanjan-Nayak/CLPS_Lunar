import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { STARFIELD_RADIUS_KM } from '@/constants/frames';

/** Procedural star sphere (deterministic). Not a star catalogue — background only. */
export function StarField({ count = 6000, visible = true }: { count?: number; visible?: boolean }) {
  const geometry = useMemo(() => {
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      pos[i * 3] = r * Math.cos(a) * STARFIELD_RADIUS_KM;
      pos[i * 3 + 1] = z * STARFIELD_RADIUS_KM;
      pos[i * 3 + 2] = r * Math.sin(a) * STARFIELD_RADIUS_KM;
      const t = rnd();
      c.setHSL(t < 0.15 ? 0.6 : t < 0.3 ? 0.08 : 0.12, t < 0.3 ? 0.5 : 0.05, 0.55 + rnd() * 0.45);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geometry} visible={visible} frustumCulled={false} name="stars">
      <pointsMaterial size={1.7} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}
