#!/usr/bin/env python3
"""
Calibrate the orientation of a baked-texture planet GLB (NASA VTAD "Earth with Clouds") against a geographic map.

The VTAD Earth is a cube-sphere with a cube-cross texture atlas, so the usual "uv (0.5, 0.5) = lon 0" trick does not
apply. Instead we sample the model's own diffuse texture densely over its surface, classify each sample as land / ocean,
and search the rotation (model frame → app frame: lon 0 → +X, north → +Y, lon 90°E → −Z) that best agrees with the
land/ocean mask of NASA Blue Marble NG (2048×1024, equirectangular, lon −180 at the left edge).

Search: the 24 proper cube rotations × spin about the resulting pole (0.5° steps), then a local refinement of all three
Euler angles (0.05° resolution). Cloud / ice pixels (white) are ignored in the score.

Usage: python3 calibrate-earth-glb.py [--write]     (writes frame.rotationDeg / calibration into the asset's metadata.json)
"""
from __future__ import annotations

import io
import itertools
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ASSETS = ROOT / "assets"
GLB = ASSETS / "solar-system/earth/nasa-earth-clouds/EarthClouds_1_12756.glb"
META = GLB.parent / "metadata.json"
BLUE_MARBLE = ASSETS / "solar-system/earth/nasa-blue-marble-ng/world.topo.bathy.200408.2048x1024.jpg"
WRITE = "--write" in sys.argv

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load_glb(path: Path):
    b = path.read_bytes()
    assert b[:4] == b"glTF"
    jl = struct.unpack("<I", b[12:16])[0]
    gltf = json.loads(b[20:20 + jl])
    bin_ = b[20 + jl + 8:]

    def accessor(i):
        acc = gltf["accessors"][i]
        bv = gltf["bufferViews"][acc["bufferView"]]
        dt = np.dtype(COMP[acc["componentType"]])
        n = NUM[acc["type"]]
        off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = bv.get("byteStride") or n * dt.itemsize
        raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * acc["count"], offset=off)
        if stride == n * dt.itemsize:
            return raw.view(dt).reshape(acc["count"], n).astype(np.float64 if dt.kind == "f" else np.int64)
        out = np.empty((acc["count"], n), dtype=dt)
        for k in range(acc["count"]):
            out[k] = np.frombuffer(raw, dtype=dt, count=n, offset=k * stride)
        return out.astype(np.float64 if dt.kind == "f" else np.int64)

    prim = max((p for m in gltf["meshes"] for p in m["primitives"]), key=lambda p: gltf["accessors"][p["attributes"]["POSITION"]]["count"])
    pos = accessor(prim["attributes"]["POSITION"])
    uv = accessor(prim["attributes"]["TEXCOORD_0"])
    idx = accessor(prim["indices"]).reshape(-1) if "indices" in prim else np.arange(len(pos))
    mat = gltf["materials"][prim["material"]]
    tex = gltf["textures"][mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]]
    img = gltf["images"][tex["source"]]
    bv = gltf["bufferViews"][img["bufferView"]]
    data = bin_[bv["byteOffset"]:bv["byteOffset"] + bv["byteLength"]]
    image = Image.open(io.BytesIO(data)).convert("RGB")
    return pos, uv, idx.astype(np.int64), image, gltf


def dense_samples(pos, uv, idx, n=7):
    """Barycentric grid on every triangle → (unit directions, uvs)."""
    tri = idx.reshape(-1, 3)
    P = pos[tri]  # (T,3,3)
    U = uv[tri]   # (T,3,2)
    ws = []
    for i in range(n + 1):
        for j in range(n + 1 - i):
            k = n - i - j
            ws.append(((i + 1 / 3) / (n + 1), (j + 1 / 3) / (n + 1), (k + 1 / 3) / (n + 1)))
    W = np.array(ws)  # (S,3)
    W = W / W.sum(axis=1, keepdims=True)
    D = np.einsum("sk,tkc->tsc", W, P).reshape(-1, 3)
    V = np.einsum("sk,tkc->tsc", W, U).reshape(-1, 2)
    D /= np.linalg.norm(D, axis=1, keepdims=True)
    return D, V


def sample_rgb(image_arr, u, v):
    h, w = image_arr.shape[:2]
    x = np.clip((u * w).astype(int), 0, w - 1)
    y = np.clip((v * h).astype(int), 0, h - 1)
    return image_arr[y, x].astype(np.int32)


def classify(rgb):
    """1 = ocean, 0 = land, −1 = cloud/ice/ignore."""
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    bright = (r + g + b) / 3
    white = (bright > 170) & (np.abs(r - b) < 40) & (np.abs(g - b) < 40)
    ocean = (b > r + 15) & (b >= g) & ~white
    land = (~ocean) & ~white & (bright > 25)
    out = np.full(len(rgb), -1, dtype=np.int8)
    out[ocean] = 1
    out[land] = 0
    return out


def latlon_from_app(d):
    """app frame: lon 0 → +X, north → +Y, lon 90°E → −Z."""
    lat = np.degrees(np.arcsin(np.clip(d[:, 1], -1, 1)))
    lon = np.degrees(np.arctan2(-d[:, 2], d[:, 0]))
    return lat, lon


def euler_xyz(rx, ry, rz):
    """three.js Euler order 'XYZ' (intrinsic): R = Rx · Ry · Rz applied to column vectors."""
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def matrix_to_euler_xyz(R):
    """Inverse of euler_xyz (three.js Euler.setFromRotationMatrix, order XYZ)."""
    ry = math.asin(max(-1.0, min(1.0, R[0, 2])))
    if abs(R[0, 2]) < 0.9999999:
        rx = math.atan2(-R[1, 2], R[2, 2])
        rz = math.atan2(-R[0, 1], R[0, 0])
    else:
        rx = math.atan2(R[2, 1], R[1, 1])
        rz = 0.0
    return rx, ry, rz


def cube_rotations():
    mats = []
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product([1, -1], repeat=3):
            M = np.zeros((3, 3))
            for r, c in enumerate(perm):
                M[r, c] = signs[r]
            if np.linalg.det(M) > 0.5:
                mats.append(M)
    return mats  # 24


def main():
    pos, uv, idx, image, gltf = load_glb(GLB)
    print(f"GLB: {len(pos)} vertices, {len(idx)//3} triangles, texture {image.size}")
    D, V = dense_samples(pos, uv, idx, n=7)
    tex = np.asarray(image)
    cls_model = classify(sample_rgb(tex, V[:, 0], V[:, 1]))
    keep = cls_model >= 0
    D, cls_model = D[keep], cls_model[keep]
    print(f"samples: {len(D)} usable ({(cls_model == 1).mean() * 100:.1f}% ocean in the model texture)")

    bm = np.asarray(Image.open(BLUE_MARBLE).convert("RGB"))
    H, W = bm.shape[:2]

    def score_matrix(R):
        d = D @ R.T  # model → app
        lat, lon = latlon_from_app(d)
        x = np.clip(((lon + 180) / 360 * W).astype(int), 0, W - 1)
        y = np.clip(((90 - lat) / 180 * H).astype(int), 0, H - 1)
        ref = classify(bm[y, x].astype(np.int32))
        m = ref >= 0
        return float((ref[m] == cls_model[m]).mean())

    # 1) coarse: cube rotation × spin about the app Y axis (the pole after the cube rotation)
    best = (0.0, None)
    for C in cube_rotations():
        for spin in np.arange(0, 360, 0.5):
            R = euler_xyz(0, math.radians(spin), 0) @ C
            s = score_matrix(R)
            if s > best[0]:
                best = (s, R)
    print(f"coarse best agreement {best[0] * 100:.2f}%")
    # 2) refine all three angles around the best
    R0 = best[1]
    rx, ry, rz = matrix_to_euler_xyz(R0)
    step = 1.0
    cur = (best[0], (rx, ry, rz))
    while step > 0.02:
        improved = False
        for dx, dy, dz in itertools.product([-1, 0, 1], repeat=3):
            if dx == dy == dz == 0:
                continue
            e = (cur[1][0] + math.radians(step * dx), cur[1][1] + math.radians(step * dy), cur[1][2] + math.radians(step * dz))
            s = score_matrix(euler_xyz(*e))
            if s > cur[0] + 1e-6:
                cur = (s, e)
                improved = True
        if not improved:
            step /= 2
    score, (rx, ry, rz) = cur
    # snap to exact right angles when within the search resolution (the XYZ decomposition is gimbal-locked at ±90°)
    def snap(a):
        d = math.degrees(a)
        q = round(d / 90) * 90
        return math.radians(q) if abs(d - q) < 0.1 else a
    rx, ry, rz = snap(rx), snap(ry), snap(rz)
    R = euler_xyz(rx, ry, rz)
    score = score_matrix(R)
    deg = [round(math.degrees(a), 2) + 0.0 for a in (rx, ry, rz)]
    print(f"refined agreement {score * 100:.2f}%  Euler XYZ (deg) = {deg}")
    # where do the app axes come from in model space? (columns of Rᵀ)
    north_model = R.T @ np.array([0, 1, 0]); lon0_model = R.T @ np.array([1, 0, 0]); e90_model = R.T @ np.array([0, 0, -1])
    print(f"model-frame directions: north {np.round(north_model, 3).tolist()}, lon0 {np.round(lon0_model, 3).tolist()}, 90E {np.round(e90_model, 3).tolist()}")
    # sanity: sub-point check — sample the model colour at a few known land/ocean sites
    checks = {"Sahara (20N,10E)": (20, 10, 0), "Amazon (5S,60W)": (-5, -60, 0), "Pacific (0,160W)": (0, -160, 1), "Indian Ocean (20S,80E)": (-20, 80, 1), "Tibet (33N,90E)": (33, 90, 0), "S. Atlantic (30S,20W)": (-30, -20, 1)}
    Rt = R.T
    for name, (la, lo, want) in checks.items():
        d_app = np.array([math.cos(math.radians(la)) * math.cos(math.radians(lo)), math.sin(math.radians(la)), -math.cos(math.radians(la)) * math.sin(math.radians(lo))])
        d_model = Rt @ d_app
        # nearest dense sample
        j = int(np.argmax(D @ d_model))
        print(f"  {name:24s} model says {'ocean' if cls_model[j] == 1 else 'land '}  expected {'ocean' if want else 'land'}")
    if WRITE:
        meta = json.loads(META.read_text())
        fr = meta.setdefault("frame", {})
        fr["rotationDeg"] = deg
        fr["rotationOrder"] = "XYZ"
        fr["calibration"] = f"image-matched: land/ocean agreement {score * 100:.1f}% vs Blue Marble NG over {len(D)} surface samples (tools/asset-pipeline/calibrate-earth-glb.py)"
        fr["uvLayout"] = "baked-cube-projection"
        META.write_text(json.dumps(meta, indent=2))
        print(f"wrote {META.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
