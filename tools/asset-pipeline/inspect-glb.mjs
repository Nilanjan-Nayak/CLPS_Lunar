#!/usr/bin/env node
/**
 * NASA Asset Pipeline — GLB frame inspection.
 *
 * For planetary GLBs we must know how the equirectangular texture is wrapped so that
 * latitude/longitude → 3D placement (landing sites, terrain tiles) lines up with the model.
 * We read POSITION + TEXCOORD_0 of the largest primitive and find the surface directions of
 * uv=(0.5,0.5) (lon 0°, lat 0°), uv=(0.75,0.5) (lon 90°E) and uv=(0.5,~0) (north pole).
 * The result is written into the asset's metadata.json under `frame`.
 *
 * Usage: node inspect-glb.mjs <path/to/model.glb> [--write]
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const write = process.argv.includes('--write');
if (!file) {
  console.error('usage: inspect-glb.mjs <model.glb> [--write]');
  process.exit(1);
}

const buf = fs.readFileSync(file);
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) throw new Error('not a GLB');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = buf.subarray(binStart);

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(idx) {
  const acc = json.accessors[idx];
  if (acc.bufferView === undefined) throw new Error('accessor without bufferView (sparse/Draco) — not supported by inspector');
  const bv = json.bufferViews[acc.bufferView];
  const [Type, size] = COMP[acc.componentType];
  const n = NUM[acc.type];
  const stride = bv.byteStride || n * size;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const off = base + i * stride + c * size;
      const v = new Type(bin.buffer, bin.byteOffset + off, 1)[0];
      out[i * n + c] = acc.normalized ? v / (Type === Uint16Array ? 65535 : Type === Uint8Array ? 255 : 1) : v;
    }
  }
  return { data: out, n, count: acc.count };
}

// --- node world matrices -------------------------------------------------------------------
const mat4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul: (a, b) => {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
    return r;
  },
  fromTRS: (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => {
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [
      (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
      2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
      2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ];
  },
  apply: (m, v) => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ],
};
const nodeWorld = new Map();
function walk(nodeIdx, parent) {
  const node = json.nodes[nodeIdx];
  const local = node.matrix ? node.matrix : mat4.fromTRS(node.translation, node.rotation, node.scale);
  const world = mat4.mul(parent, local);
  nodeWorld.set(nodeIdx, world);
  (node.children || []).forEach((c) => walk(c, world));
}
const scene = json.scenes[json.scene || 0];
scene.nodes.forEach((n) => walk(n, mat4.identity()));

// --- largest textured primitive --------------------------------------------------------------
let best = null;
for (const [nodeIdx, world] of nodeWorld) {
  const node = json.nodes[nodeIdx];
  if (node.mesh === undefined) continue;
  for (const prim of json.meshes[node.mesh].primitives) {
    if (prim.attributes.POSITION === undefined) continue;
    if (prim.extensions && prim.extensions.KHR_draco_mesh_compression) continue;
    if (json.accessors[prim.attributes.POSITION].bufferView === undefined) continue;
    const count = json.accessors[prim.attributes.POSITION].count;
    if (!best || count > best.count) best = { nodeIdx, world, prim, count, meshName: json.meshes[node.mesh].name, nodeName: node.name };
  }
}
if (!best) throw new Error('no mesh');
const pos = readAccessor(best.prim.attributes.POSITION);
const uv = best.prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(best.prim.attributes.TEXCOORD_0) : null;

let center = [0, 0, 0];
const world = [];
let maxR = 0;
const bboxMin = [Infinity, Infinity, Infinity], bboxMax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.count; i++) {
  const p = mat4.apply(best.world, [pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]]);
  world.push(p);
  for (let c = 0; c < 3; c++) { bboxMin[c] = Math.min(bboxMin[c], p[c]); bboxMax[c] = Math.max(bboxMax[c], p[c]); }
}
center = [0, 1, 2].map((c) => (bboxMin[c] + bboxMax[c]) / 2);
for (const p of world) maxR = Math.max(maxR, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const nearestDir = (u, v) => {
  if (!uv) return null;
  let bi = -1, bd = Infinity;
  for (let i = 0; i < uv.count; i++) {
    const du = uv.data[i * 2] - u, dv = uv.data[i * 2 + 1] - v;
    const d = du * du + dv * dv;
    if (d < bd) { bd = d; bi = i; }
  }
  const p = world[bi];
  return { dir: norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]), uvError: Math.sqrt(bd), uv: [uv.data[bi * 2], uv.data[bi * 2 + 1]] };
};

const lon0 = nearestDir(0.5, 0.5);
const lon90E = nearestDir(0.75, 0.5);
const north = nearestDir(0.5, 0.02);
let handedness = null;
if (lon0 && lon90E && north) {
  const c = [
    lon0.dir[1] * north.dir[2] - lon0.dir[2] * north.dir[1],
    lon0.dir[2] * north.dir[0] - lon0.dir[0] * north.dir[2],
    lon0.dir[0] * north.dir[1] - lon0.dir[1] * north.dir[0],
  ];
  const dot = c[0] * lon90E.dir[0] + c[1] * lon90E.dir[1] + c[2] * lon90E.dir[2];
  // App convention: lon0 = +X, north = +Y, lon90E = -Z  →  lon90E = -(lon0 × north)
  handedness = dot < 0 ? 'matches-app-convention' : 'mirrored';
}

const report = {
  file: path.basename(file),
  generator: json.asset?.generator,
  meshName: best.meshName,
  nodeName: best.nodeName,
  vertexCount: best.count,
  bboxMin, bboxMax, center,
  boundingRadius: maxR,
  uvFrame: uv
    ? {
        lon0: lon0.dir, lon0UvError: lon0.uvError,
        lon90E: lon90E.dir, lon90EUvError: lon90E.uvError,
        north: north.dir, northUvError: north.uvError,
        handedness,
        appConvention: { lon0: [1, 0, 0], north: [0, 1, 0], lon90E: [0, 0, -1] },
      }
    : null,
};
console.log(JSON.stringify(report, null, 2));

if (write) {
  const metaPath = path.join(path.dirname(file), 'metadata.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.frame = { inspectedAt: new Date().toISOString(), ...report };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`\n→ frame written to ${metaPath}`);
  }
}
