import { Box3, Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { AssetEntry } from '@/types/domain';

const draco = new DRACOLoader();
draco.setDecoderPath('/draco/');
const gltf = new GLTFLoader();
gltf.setDRACOLoader(draco);

export interface ModelLoadResult {
  scene: Group;
  boundingRadius: number;
  center: Vector3;
  sizeMax: number;
}

export async function loadModel(entry: AssetEntry, onProgress?: (p: number) => void): Promise<ModelLoadResult> {
  const g = await gltf.loadAsync(entry.url, (ev) => {
    if (ev.total) onProgress?.(ev.loaded / ev.total);
  });
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const sizeMax = Math.max(size.x, size.y, size.z);
  let boundingRadius = entry.frame?.boundingRadius ?? 0;
  if (!boundingRadius) {
    boundingRadius = 0;
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const m = o as Mesh;
        m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere!;
        const c = bs.center.clone().applyMatrix4(m.matrixWorld);
        const s = m.getWorldScale(new Vector3());
        boundingRadius = Math.max(boundingRadius, c.distanceTo(center) + bs.radius * Math.max(s.x, s.y, s.z));
      }
    });
  }
  scene.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return { scene, boundingRadius, center, sizeMax };
}
