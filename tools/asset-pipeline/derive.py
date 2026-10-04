#!/usr/bin/env python3
"""
NASA Asset Pipeline — step 2: derive web-ready products from raw NASA files.

  * tif-to-jpg      : 4k LROC color TIFF -> JPEG (globe albedo for the Lunar World)
  * dem-to-rgb-png  : LOLA uint16 DEM    -> 8-bit RGB PNG (R = hi byte, G = lo byte) decodable via <canvas>
  * dem-tiles       : LOLA 16 px/deg DEM -> 22.5° x 22.5° LOD1 elevation tiles (RGB-encoded) + index.json
  * color-tiles     : 4k color map       -> matching color tiles
  * exr-to-jpg      : SVS Deep Star Map OpenEXR (linear half-float) -> tone-mapped sRGB JPEG sky map (+ low-res variants)
  * earth-texture   : Visible Earth JPEG/TIFF -> web JPEG (RGB day/night, L clouds) + low-res variants

Every derived folder receives a copy of the raw asset's metadata.json / source.json / LICENSE.txt
(as `derivedFrom`) so provenance survives even though the raw TIFFs live in the non-persisted cache.

Usage: python3 derive.py [--all-tiles]
"""
from __future__ import annotations

import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ASSETS = ROOT / "assets"
PROV = ASSETS / "_provenance"
SOURCES = json.loads((HERE / "nasa-sources.json").read_text())
ALL_TILES = "--all-tiles" in sys.argv

TILE_DEG = 22.5
COLS = int(360 / TILE_DEG)  # 16
ROWS = int(180 / TILE_DEG)  # 8

# Datum: uint16 half-meters relative to 1,727,400 m; lunar datum radius 1,737,400 m
HALF_M = 0.5
REF_RADIUS_M = 1_727_400
DATUM_RADIUS_M = 1_737_400


def log(msg: str) -> None:
    print(msg, flush=True)


def load_landing_sites() -> list[dict]:
    p = ROOT / "services" / "api" / "src" / "data" / "landing-sites.json"
    if not p.exists():
        return []
    return json.loads(p.read_text())


def tiles_of_interest() -> set[tuple[int, int]]:
    """Tiles intersecting known landing sites + the whole south-polar band (CLPS focus) + one ring around each site."""
    wanted: set[tuple[int, int]] = set()
    for site in load_landing_sites():
        lat, lon = site.get("latitude"), site.get("longitude")
        if lat is None or lon is None:
            continue  # sites without published coordinates get no tiles (nothing to place)
        x = int((lon + 180) // TILE_DEG) % COLS
        y = int((90 - lat) // TILE_DEG)
        y = min(max(y, 0), ROWS - 1)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                yy = y + dy
                if 0 <= yy < ROWS:
                    wanted.add(((x + dx) % COLS, yy))
    for x in range(COLS):  # south polar band (lat -67.5 .. -90)
        wanted.add((x, ROWS - 1))
    return wanted


def provenance_copy(asset_id: str, out_dir: Path, extra: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    src_dir = PROV / asset_id
    meta = json.loads((src_dir / "metadata.json").read_text())
    derived = {
        **extra,
        "derivedFrom": {
            "assetId": meta["assetId"],
            "file": meta["file"],
            "sha256": meta["sha256"],
            "source": meta["source"],
            "license": meta["license"],
            "credits": meta["credits"],
            "scientificGrade": meta.get("scientificGrade"),
        },
        "derivedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "pipeline": "tools/asset-pipeline/derive.py",
    }
    (out_dir / "metadata.json").write_text(json.dumps(derived, indent=2))
    shutil.copy(src_dir / "source.json", out_dir / "source.json")
    shutil.copy(src_dir / "LICENSE.txt", out_dir / "LICENSE.txt")


def raw_path(asset: dict) -> Path:
    return ASSETS / asset["dest"]


def encode_rgb(dem: np.ndarray) -> Image.Image:
    hi = (dem >> 8).astype(np.uint8)
    lo = (dem & 0xFF).astype(np.uint8)
    rgb = np.dstack([hi, lo, np.zeros_like(hi)])
    return Image.fromarray(rgb, mode="RGB")


def dem_stats(dem: np.ndarray) -> dict:
    elev_m = dem.astype(np.float64) * HALF_M + REF_RADIUS_M - DATUM_RADIUS_M
    return {
        "minElevationM": float(elev_m.min()),
        "maxElevationM": float(elev_m.max()),
        "meanElevationM": float(elev_m.mean()),
    }


ENCODING = {
    "type": "rgb-uint16",
    "formula": "value = R*256 + G; elevation_m = value*0.5 + 1727400 - 1737400",
    "scale": HALF_M,
    "referenceRadiusM": REF_RADIUS_M,
    "datumRadiusM": DATUM_RADIUS_M,
}


def do_tif_to_jpg(asset: dict, step: dict) -> None:
    out = ASSETS / step["out"]
    if out.exists():
        log(f"  = {out.relative_to(ASSETS)} exists")
        return
    img = Image.open(raw_path(asset)).convert("RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=step.get("quality", 88), optimize=True, progressive=True)
    provenance_copy(
        asset["assetId"],
        out.parent,
        {
            "assetId": f"{asset['assetId']}-jpg",
            "name": asset["name"] + " (web JPEG)",
            "assetType": "texture",
            "textureRole": "albedo",
            "category": "lunar",
            "format": "jpg",
            "file": str(out.relative_to(ASSETS)),
            "sizeBytes": out.stat().st_size,
            "projection": asset["projection"],
            "scientificGrade": False,
        },
    )
    log(f"  ✓ {out.relative_to(ASSETS)} ({out.stat().st_size/1e6:.1f} MB)")


def do_dem_to_rgb_png(asset: dict, step: dict) -> None:
    out = ASSETS / step["out"]
    if out.exists():
        log(f"  = {out.relative_to(ASSETS)} exists")
        return
    dem = np.array(Image.open(raw_path(asset)), dtype=np.uint16)
    out.parent.mkdir(parents=True, exist_ok=True)
    encode_rgb(dem).save(out, "PNG", optimize=True)
    provenance_copy(
        asset["assetId"],
        out.parent,
        {
            "assetId": f"{asset['assetId']}-rgb",
            "name": asset["name"] + " (RGB-encoded PNG, LOD0 global)",
            "assetType": "elevation",
            "category": "lunar",
            "format": "png",
            "lod": 0,
            "file": str(out.relative_to(ASSETS)),
            "sizeBytes": out.stat().st_size,
            "projection": asset["projection"],
            "encoding": ENCODING,
            "stats": dem_stats(dem),
            "scientificGrade": "derived",
        },
    )
    log(f"  ✓ {out.relative_to(ASSETS)} ({out.stat().st_size/1e6:.1f} MB)")


def tile_bounds(x: int, y: int) -> dict:
    return {
        "west": -180 + x * TILE_DEG,
        "east": -180 + (x + 1) * TILE_DEG,
        "north": 90 - y * TILE_DEG,
        "south": 90 - (y + 1) * TILE_DEG,
    }


def do_dem_tiles(asset: dict, step: dict) -> None:
    out_dir = ASSETS / step["out"] / "lod1"
    out_dir.mkdir(parents=True, exist_ok=True)
    dem = np.array(Image.open(raw_path(asset)), dtype=np.uint16)
    h, w = dem.shape
    ppd = w / 360.0
    px = int(round(TILE_DEG * ppd))  # 360 px
    wanted = None if ALL_TILES else tiles_of_interest()
    index_path = ASSETS / step["out"] / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    tiles = {t["id"]: t for t in index.get("tiles", [])}
    made = 0
    for y in range(ROWS):
        for x in range(COLS):
            if wanted is not None and (x, y) not in wanted:
                continue
            tid = f"lod1/{x}_{y}"
            f = out_dir / f"{x}_{y}.png"
            sub = dem[y * px : (y + 1) * px, x * px : (x + 1) * px]
            if not f.exists():
                encode_rgb(sub).save(f, "PNG", optimize=True)
                made += 1
            stats = dem_stats(sub)
            tiles[tid] = {
                **tiles.get(tid, {}),
                "id": tid,
                "lod": 1,
                "x": x,
                "y": y,
                "bounds": tile_bounds(x, y),
                "elevation": {"url": f"/assets/lunar/terrain/tiles/lod1/{x}_{y}.png", "width": px, "height": px, "pixelsPerDegree": ppd},
                "stats": stats,
            }
    index.update(
        {
            "version": 1,
            "scheme": {"type": "equirectangular-grid", "tileDeg": TILE_DEG, "cols": COLS, "rows": ROWS, "origin": "north-west", "centerLonDeg": 0},
            "encoding": ENCODING,
            "datum": {"name": "Lunar sphere R=1737.4 km (LOLA)", "radiusKm": 1737.4},
            "lods": {
                "0": {"source": "nasa-cgi-moon-kit-ldem-4-uint", "pixelsPerDegree": 4, "url": "/assets/lunar/elevation/ldem-4-global/ldem_4_rgb.png", "width": 1440, "height": 720},
                "1": {"source": "nasa-cgi-moon-kit-ldem-16-uint", "pixelsPerDegree": ppd, "tilePx": px},
            },
            "coverage": "all" if ALL_TILES else "landing-sites+south-polar-band (run derive.py --all-tiles for global)",
            "tiles": sorted(tiles.values(), key=lambda t: (t["y"], t["x"])),
        }
    )
    index_path.write_text(json.dumps(index, indent=1))
    provenance_copy(
        asset["assetId"],
        ASSETS / step["out"],
        {
            "assetId": "lunar-terrain-tileset-lod1",
            "name": "Lunar terrain tileset (LOLA-derived elevation tiles + LROC color tiles)",
            "assetType": "terrain-tileset",
            "category": "lunar",
            "format": "tileset",
            "file": "lunar/terrain/tiles/index.json",
            "tileCount": len(tiles),
            "encoding": ENCODING,
            "scientificGrade": "derived",
        },
    )
    total = sum(p.stat().st_size for p in out_dir.glob("*.png"))
    log(f"  ✓ {made} new elevation tiles, {len(tiles)} indexed ({total/1e6:.1f} MB)")


def do_color_tiles(asset: dict, step: dict) -> None:
    out_dir = ASSETS / step["out"] / "lod1"
    out_dir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw_path(asset)).convert("RGB")
    w, h = img.size
    ppd = w / 360.0
    px = int(round(TILE_DEG * ppd))
    index_path = ASSETS / step["out"] / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"tiles": []}
    made = 0
    for t in index.get("tiles", []):
        x, y = t["x"], t["y"]
        f = out_dir / f"{x}_{y}.jpg"
        if not f.exists():
            img.crop((x * px, y * px, (x + 1) * px, (y + 1) * px)).save(f, "JPEG", quality=85, optimize=True)
            made += 1
        t["color"] = {"url": f"/assets/lunar/terrain/tiles/lod1/{x}_{y}.jpg", "width": px, "height": px, "source": asset["assetId"]}
    index_path.write_text(json.dumps(index, indent=1))
    log(f"  ✓ {made} new color tiles")


def _sha256(path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _variants(img: Image.Image, step: dict, quality: int) -> list[dict]:
    out: list[dict] = []
    for v in step.get("variants", []):
        w = int(v["width"])
        h = w // 2
        dest = ASSETS / v["out"]
        if not dest.exists():
            img.resize((w, h), Image.LANCZOS).save(dest, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=0)
        out.append({"file": str(dest.relative_to(ASSETS)), "width": w, "height": h, "sizeBytes": dest.stat().st_size, "sha256": _sha256(dest), "quality": v.get("quality", "low")})
        log(f"  ✓ variant {dest.relative_to(ASSETS)} ({w}x{h})")
    return out


def _texture_meta(asset: dict, step: dict, out: Path, img_size: tuple[int, int], asset_id: str, extra: dict) -> None:
    provenance_copy(
        asset["assetId"],
        out.parent,
        {
            "assetId": asset_id,
            "name": asset["name"].replace(" (raw)", "").replace(", raw", "") + " (web JPEG)",
            "assetType": asset["assetType"].replace("-raw", ""),
            "textureRole": asset.get("textureRole"),
            "category": asset.get("category"),
            "format": "jpg",
            "tier": asset.get("tier", "core"),
            "file": str(out.relative_to(ASSETS)),
            "sizeBytes": out.stat().st_size,
            "sha256": _sha256(out),
            "width": img_size[0],
            "height": img_size[1],
            "projection": asset.get("projection"),
            "scientificGrade": asset.get("scientificGrade"),
            "notes": asset.get("notes", ""),
            **extra,
        },
    )


def do_exr_to_jpg(asset: dict, step: dict) -> None:
    """Deep Star Maps 2020: OpenEXR linear half-float -> tone-mapped 8-bit sRGB JPEG, row-chunked (8k EXR ≈ 1.6 GB as float32)."""
    out = ASSETS / step["out"]
    if out.exists():
        log(f"  = {out.relative_to(ASSETS)} exists")
        return
    try:
        import OpenEXR  # type: ignore
    except ImportError:
        log("  ✗ python module OpenEXR missing — `pip install OpenEXR` and re-run")
        return
    k = float(step.get("toneMapK", 2.5))
    q = int(step.get("jpegQuality", 88))
    with OpenEXR.File(str(raw_path(asset))) as f:
        rgb = f.channels()["RGB"].pixels  # (H, W, 3) float16/float32, linear
        H, W = rgb.shape[:2]
        img = Image.new("RGB", (W, H))
        rows = 256
        for y0 in range(0, H, rows):
            v = np.asarray(rgb[y0 : y0 + rows], dtype=np.float32)
            v = 1.0 - np.exp(-k * np.clip(v, 0.0, None))  # exposure tone map
            v = np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)  # sRGB transfer
            img.paste(Image.fromarray((np.clip(v, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB"), (0, y0))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=q, optimize=True, progressive=True, subsampling=0)
    variants = _variants(img, step, q)
    _texture_meta(
        asset,
        step,
        out,
        (W, H),
        asset["assetId"].removesuffix("-exr"),
        {
            "variants": variants,
            "encoding": {
                "from": f"OpenEXR half-float linear RGB ({raw_path(asset).name})",
                "toneMap": f"v' = 1 - exp(-{k}*v), then sRGB transfer; 8-bit JPEG q{q} 4:4:4",
                "note": "Relative star brightness is NOT photometric after tone mapping; bright stars saturate as in the source.",
            },
        },
    )
    log(f"  ✓ {out.relative_to(ASSETS)} ({W}x{H}, {out.stat().st_size/1e6:.1f} MB)")


def do_earth_texture(asset: dict, step: dict) -> None:
    """Visible Earth raw image -> web JPEG (mode RGB for day/night maps, L for the cloud-opacity map) + low-res variants."""
    out = ASSETS / step["out"]
    if out.exists():
        log(f"  = {out.relative_to(ASSETS)} exists")
        return
    mode = step.get("mode", "RGB")
    q = int(step.get("jpegQuality", 90))
    img = Image.open(raw_path(asset)).convert(mode)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=q, optimize=True, progressive=True)
    variants = _variants(img, step, q)
    extra: dict = {"variants": variants} if variants else {}
    if mode == "L":
        extra["encoding"] = {"from": raw_path(asset).suffix.lstrip(".").upper() + " (white clouds on black)", "to": f"8-bit grayscale JPEG q{q} (luminance = cloud opacity)", "colorSpace": "linear", "note": "Single-channel cloud-cover/opacity map: sample as data (no sRGB decode)."}
    _texture_meta(asset, step, out, img.size, asset["assetId"].removesuffix("-raw"), extra)
    log(f"  ✓ {out.relative_to(ASSETS)} ({img.size[0]}x{img.size[1]}, {out.stat().st_size/1e6:.1f} MB)")


HANDLERS = {
    "exr-to-jpg": do_exr_to_jpg,
    "earth-texture": do_earth_texture,
    "tif-to-jpg": do_tif_to_jpg,
    "dem-to-rgb-png": do_dem_to_rgb_png,
    "dem-tiles": do_dem_tiles,
    "color-tiles": do_color_tiles,
}


def main() -> None:
    # Ensure elevation tiles exist before color tiles (color tiles follow the DEM index)
    order = ["exr-to-jpg", "earth-texture", "tif-to-jpg", "dem-to-rgb-png", "dem-tiles", "color-tiles"]
    for kind in order:
        for asset in SOURCES["assets"]:
            for step in asset.get("derive", []):
                if step["type"] != kind:
                    continue
                if not raw_path(asset).exists():
                    log(f"✗ raw missing for {asset['assetId']} ({asset['dest']}) — run fetch.mjs first")
                    continue
                log(f"▶ {kind}: {asset['assetId']}")
                HANDLERS[kind](asset, step)
    log("Done.")


if __name__ == "__main__":
    main()
