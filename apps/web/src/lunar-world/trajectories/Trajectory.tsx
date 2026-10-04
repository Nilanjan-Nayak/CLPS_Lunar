import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Vector3 } from 'three';
import type { SceneObject } from '@/scene-manager/SceneConfig';

interface Sample { t?: string; x: number; y: number; z: number }

/**
 * Trajectory — renders ONLY verified sampled trajectories delivered by the API (`mission.trajectory.samples`, km,
 * Moon-centric). Currently every CLPS mission in the catalogue has `trajectory: null`, so this stays dormant and the
 * ScenePlanner adds an honesty note instead.
 */
export function Trajectory({ object }: { object: SceneObject }) {
  const samples = (object.data?.samples as Sample[] | undefined) ?? [];
  const points = useMemo(() => samples.map((s) => new Vector3(s.x, s.y, s.z)), [samples]);
  if (points.length < 2) return null;
  return <Line points={points} color="#ffb86b" lineWidth={1.5} transparent opacity={0.9} />;
}

export function TrajectorySystem({ objects, visible }: { objects: SceneObject[]; visible: boolean }) {
  if (!visible) return null;
  return <group name="trajectories">{objects.filter((o) => o.kind === 'trajectory').map((o) => <Trajectory key={o.id} object={o} />)}</group>;
}
