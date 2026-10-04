"""Global LOLA-derived DEM access (NASA SVS CGI Moon Kit ldem_16_uint, 16 px/deg, 5760×2880).

Same encoding as the web tiles: value (uint16, half-metres above R=1,727.4 km) → elevation_m = v*0.5 − 10000
relative to the 1,737.4 km sphere. The raw GeoTIFF lives in assets/.cache/raw and is (re)downloaded on demand."""
from __future__ import annotations
import math, os, threading, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image
from . import dem_polar

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "assets" / ".cache" / "raw" / "ldem_16_uint.tif"
URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif"
LOD0 = ROOT / "assets" / "lunar" / "elevation" / "ldem-4-global" / "ldem_4_rgb.png"
MOON_R_M = 1_737_400.0
PPD = 16.0

_lock = threading.Lock()
_grid: np.ndarray | None = None
_ppd = PPD
_source = ""


def _load() -> tuple[np.ndarray, float, str]:
    global _grid, _ppd, _source
    with _lock:
        if _grid is not None:
            return _grid, _ppd, _source
        try:
            if not RAW.exists():
                RAW.parent.mkdir(parents=True, exist_ok=True)
                urllib.request.urlretrieve(URL, RAW)  # ~33 MB
            _grid = np.array(Image.open(RAW), dtype=np.float32) * 0.5 - 10_000.0
            _ppd = PPD
            _source = "nasa-cgi-moon-kit-ldem-16-uint (16 px/deg)"
        except Exception:  # offline fallback: the 4 px/deg LOD0 PNG shipped with the app
            rgb = np.array(Image.open(LOD0).convert("RGB"), dtype=np.float32)
            _grid = (rgb[..., 0] * 256 + rgb[..., 1]) * 0.5 - 10_000.0
            _ppd = 4.0
            _source = "nasa-cgi-moon-kit-ldem-4-uint (4 px/deg, fallback)"
        return _grid, _ppd, _source


def source() -> str:
    return _load()[2]


def pixels_per_degree() -> float:
    return _load()[1]


def _wrap_col(c: int, w: int) -> int:
    return c % w


def elevation_at(lat: float, lon: float) -> float:
    """Bilinear elevation (m) relative to the 1,737.4 km sphere; pixel centres at (i+0.5)/ppd."""
    g, ppd, _ = _load()
    h, w = g.shape
    fx = (lon + 180.0) * ppd - 0.5
    fy = (90.0 - lat) * ppd - 0.5
    x0 = math.floor(fx); y0 = math.floor(fy)
    tx = fx - x0; ty = fy - y0
    y0c = min(max(y0, 0), h - 1); y1c = min(max(y0 + 1, 0), h - 1)
    x0c = _wrap_col(x0, w); x1c = _wrap_col(x0 + 1, w)
    a = g[y0c, x0c]; b = g[y0c, x1c]; c = g[y1c, x0c]; d = g[y1c, x1c]
    return float((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty)


def window(lat: float, lon: float, half: int) -> np.ndarray:
    """(2·half+1)² neighbourhood of DEM samples centred on the nearest pixel (columns wrap in longitude)."""
    g, ppd, _ = _load()
    h, w = g.shape
    cx = int(math.floor((lon + 180.0) * ppd)); cy = int(math.floor((90.0 - lat) * ppd))
    rows = [min(max(cy + dy, 0), h - 1) for dy in range(-half, half + 1)]
    cols = [(cx + dx) % w for dx in range(-half, half + 1)]
    return g[np.ix_(rows, cols)]


def terrain_features_regional(lat: float, lon: float) -> dict:
    """Regional-scale features from the global 16 px/deg grid (≈1.9 km/px) — the scale the outcome model was trained on."""
    g, ppd, src = _load()
    deg = 1.0 / ppd
    dy_m = deg * math.pi / 180.0 * MOON_R_M
    dx_m = dy_m * max(math.cos(math.radians(lat)), 0.05)
    w3 = window(lat, lon, 1)
    dzdx = float(w3[1, 2] - w3[1, 0]) / (2 * dx_m)
    dzdy = float(w3[0, 1] - w3[2, 1]) / (2 * dy_m)
    slope = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
    aspect = (math.degrees(math.atan2(-dzdx, -dzdy)) + 360.0) % 360.0  # downslope direction, clockwise from north
    w5 = window(lat, lon, 2)
    w11 = window(lat, lon, 5)
    return {
        "elevationM": round(elevation_at(lat, lon), 1),
        "slopeDeg": round(slope, 2),
        "aspectDeg": round(aspect, 1),
        "roughnessM": round(float(np.std(w5)), 1),          # σ of elevation in a ~5×5 px (~10 km) window
        "reliefM": round(float(w11.max() - w11.min()), 1),  # max−min in ~11×11 px (~20 km)
        "baselineM": round(dy_m, 0),
        "roughnessWindowM": round(5 * dy_m, 0),
        "reliefWindowM": round(11 * dy_m, 0),
        "resolutionM": round(dy_m, 0),
        "maxSunElevationDeg": round(min(90.0, 90.0 - abs(lat) + 1.54), 1),  # noon Sun altitude (obliquity 1.54°)
        "polar": abs(lat) >= 80.0,
        "dataSource": src,
        "grade": "regional (CGI Moon Kit, LOLA-derived, 16 px/deg)",
    }


def terrain_features(lat: float, lon: float) -> dict:
    """Best available terrain features: LOLA GDR polar DEM (240 m, |lat| ≥ 75°) when present, else the regional grid.
    Always carries `regional` (16 px/deg values) so model features stay on the training scale."""
    regional = terrain_features_regional(lat, lon)
    fine = dem_polar.finest_for(lat)
    if fine is None:
        return regional
    try:
        f = fine.features(lat, lon)
    except ValueError:
        return regional
    return {**regional, **f, "regional": {k: regional[k] for k in ("elevationM", "slopeDeg", "aspectDeg", "roughnessM", "reliefM", "baselineM", "dataSource")}}


def suitability(slope_deg: float, roughness_m: float, max_sun_deg: float) -> float:
    """Engineering heuristic 0–1 (NOT a NASA product): 50 % slope, 30 % roughness, 20 % illumination."""
    s = 1.0 - min(max((slope_deg - 2.0) / 13.0, 0.0), 1.0)
    r = 1.0 - min(max((roughness_m - 30.0) / 270.0, 0.0), 1.0)
    i = min(max((max_sun_deg - 5.0) / 15.0, 0.0), 1.0)
    return round(0.5 * s + 0.3 * r + 0.2 * i, 3)


def analysis_grid(lat: float, lon: float, half_km: float | None = None, n: int = 32, half_deg: float | None = None) -> dict:
    """n×n grid of slope / roughness / suitability in a metric box around a point (default ±30 km on the regional grid,
    ±15 km when a LOLA GDR polar DEM covers the site). Row-major from north-west; longitudes widen with 1/cos(lat)."""
    fine = dem_polar.finest_for(lat)
    if half_deg is not None:
        half_km = half_deg * math.pi / 180.0 * MOON_R_M / 1000.0
    if half_km is None:
        half_km = 15.0 if fine else 30.0
    dlat = half_km * 1000.0 / MOON_R_M * 180.0 / math.pi
    dlon = dlat / max(math.cos(math.radians(lat)), 0.02)
    lats = [lat + dlat - (i + 0.5) * (2 * dlat / n) for i in range(n)]
    lons = [lon - dlon + (j + 0.5) * (2 * dlon / n) for j in range(n)]
    slope, rough, score, elev = [], [], [], []
    for la in lats:
        for lo in lons:
            lo_w = ((lo + 180.0) % 360.0) - 180.0
            la_c = max(-89.99, min(89.99, la))
            f = None
            if fine is not None and fine.covers(la_c):
                try:
                    f = fine.features(la_c, lo_w)
                except ValueError:
                    f = None
            if f is None:
                f = terrain_features_regional(la_c, lo_w)
            slope.append(f["slopeDeg"]); rough.append(f["roughnessM"]); elev.append(f["elevationM"])
            score.append(suitability(f["slopeDeg"], f["roughnessM"], min(90.0, 90.0 - abs(la_c) + 1.54)))
    src = fine.source if fine else _load()[2]
    cell_m = 2 * half_km * 1000.0 / n
    return {
        "bounds": {"north": lat + dlat, "south": lat - dlat, "west": lon - dlon, "east": lon + dlon},
        "rows": n, "cols": n, "order": "row-major from north-west", "halfKm": half_km, "cellM": round(cell_m),
        "slopeDeg": slope, "roughnessM": rough, "elevationM": elev, "suitability": score,
        "dataSource": src, "grade": "science (LOLA GDR)" if fine else "regional (16 px/deg)",
        "method": f"central-difference slope + 5×5 σ roughness on {'the LOLA GDR ' + str(int(fine.scale_m)) + ' m polar DEM' if fine else 'the LOLA-derived 16 px/deg DEM'}; heuristic score",
    }
