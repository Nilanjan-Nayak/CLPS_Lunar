"""LOLA GDR polar stereographic DEMs (PDS Geosciences Node, LRO LOLA RDR v1, lola_gdr/polar/img).

Products used by default: ldem_75s_240m / ldem_75n_240m — 240 m/px, latitudes 75–90°, int16 LSB, height =
DN × 0.5 m relative to the 1,737.4 km sphere (same datum as the global 16 px/deg grid). Optional finer products
(ldem_80s_80m, ldem_85s_40m, …) can be enabled with the LOLA_POLAR_PRODUCTS environment variable.

Projection (PDS / ISIS polar stereographic on a sphere, 0° meridian "up", east clockwise for the south pole):
    ρ = 2R·tan((90° − |φ|)/2)      x = ρ·sin λ       y = ρ·cos λ  (south)  /  y = −ρ·cos λ (north)
    col = SAMPLE_PROJECTION_OFFSET + x/scale        row = LINE_PROJECTION_OFFSET − y/scale     (0-based, pixel centres)
Orientation was verified against known relief (Mons Mouton high plateau vs. Cabeus / Amundsen depressions)."""
from __future__ import annotations
import math, os, re, threading, urllib.request
from dataclasses import dataclass
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "assets" / ".cache" / "raw"
BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"
MOON_R_M = 1_737_400.0

# product id → (hemisphere, min |lat| covered, m/px)
DEFAULT_PRODUCTS = ["ldem_75s_240m", "ldem_75n_240m"]
KNOWN = {
    "ldem_75s_240m": ("S", 75.0, 240.0), "ldem_75n_240m": ("N", 75.0, 240.0),
    "ldem_75s_120m": ("S", 75.0, 120.0), "ldem_75n_120m": ("N", 75.0, 120.0),
    "ldem_80s_80m": ("S", 80.0, 80.0), "ldem_80n_80m": ("N", 80.0, 80.0),
    "ldem_85s_40m": ("S", 85.0, 40.0), "ldem_85n_40m": ("N", 85.0, 40.0),
    "ldem_875s_20m": ("S", 87.5, 20.0), "ldem_875n_20m": ("N", 87.5, 20.0),
}


@dataclass
class PolarDem:
    product: str
    hemisphere: str
    min_abs_lat: float
    scale_m: float
    lines: int
    samples: int
    line_off: float
    sample_off: float
    scaling: float
    data: np.ndarray  # int16 memmap (lines × samples)

    @property
    def source(self) -> str:
        return f"NASA LRO LOLA GDR {self.product} ({self.scale_m:g} m/px, polar stereographic, PDS Geosciences Node)"

    def covers(self, lat: float) -> bool:
        return (lat <= -self.min_abs_lat) if self.hemisphere == "S" else (lat >= self.min_abs_lat)

    # --- projection ------------------------------------------------------------------------------------------
    def rc(self, lat: float, lon: float) -> tuple[float, float]:
        """0-based fractional (row, col) of a point; pixel centres at integers."""
        rho = 2.0 * MOON_R_M * math.tan(math.radians(90.0 - abs(lat)) / 2.0)
        x = rho * math.sin(math.radians(lon))
        y = rho * math.cos(math.radians(lon)) * (1.0 if self.hemisphere == "S" else -1.0)
        return self.line_off - y / self.scale_m, self.sample_off + x / self.scale_m

    def latlon(self, row: float, col: float) -> tuple[float, float]:
        x = (col - self.sample_off) * self.scale_m
        y = (self.line_off - row) * self.scale_m * (1.0 if self.hemisphere == "S" else -1.0)
        rho = math.hypot(x, y)
        colat = 2.0 * math.degrees(math.atan(rho / (2.0 * MOON_R_M)))
        lat = -(90.0 - colat) if self.hemisphere == "S" else (90.0 - colat)
        lon = math.degrees(math.atan2(x, y)) if rho > 0 else 0.0
        return lat, ((lon + 180.0) % 360.0) - 180.0

    # --- sampling --------------------------------------------------------------------------------------------
    def elevation(self, lat: float, lon: float) -> float:
        r, c = self.rc(lat, lon)
        r0 = int(math.floor(r)); c0 = int(math.floor(c)); tr = r - r0; tc = c - c0
        r0 = min(max(r0, 0), self.lines - 2); c0 = min(max(c0, 0), self.samples - 2)
        a = float(self.data[r0, c0]); b = float(self.data[r0, c0 + 1]); d = float(self.data[r0 + 1, c0]); e = float(self.data[r0 + 1, c0 + 1])
        return ((a * (1 - tc) + b * tc) * (1 - tr) + (d * (1 - tc) + e * tc) * tr) * self.scaling

    def window(self, lat: float, lon: float, half: int) -> np.ndarray:
        r, c = self.rc(lat, lon)
        r0 = int(round(r)); c0 = int(round(c))
        rs = slice(max(r0 - half, 0), min(r0 + half + 1, self.lines)); cs = slice(max(c0 - half, 0), min(c0 + half + 1, self.samples))
        return self.data[rs, cs].astype(np.float32) * self.scaling

    def features(self, lat: float, lon: float) -> dict:
        """Elevation, slope/aspect (central differences at native scale), σ roughness (~5×5 px) and relief (~11×11 px)."""
        w3 = self.window(lat, lon, 1)
        if w3.shape != (3, 3):
            raise ValueError("outside DEM")
        # local axes: image +col = x, image −row = y; convert gradient to slope magnitude (rotation invariant),
        # aspect expressed relative to local north (direction of the pole for S? no — towards increasing latitude)
        dzdx = float(w3[1, 2] - w3[1, 0]) / (2 * self.scale_m)
        dzdy = float(w3[0, 1] - w3[2, 1]) / (2 * self.scale_m)
        slope = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
        # image-frame downslope azimuth (clockwise from image-up), then rotate into local geographic azimuth:
        # local north (toward +lat) in the image points toward the pole for S (centre) and away for N.
        r, c = self.rc(lat, lon)
        to_pole = math.degrees(math.atan2(self.sample_off - c, -(self.line_off - r)))  # image azimuth of the pole, cw from up
        north_img = to_pole if self.hemisphere == "S" else (to_pole + 180.0)
        down_img = math.degrees(math.atan2(-dzdx, -dzdy))
        # east is clockwise from north for S (viewed from outside) but counter-clockwise for N in image space
        aspect = ((down_img - north_img) * (1.0 if self.hemisphere == "S" else -1.0) + 360.0) % 360.0
        w5 = self.window(lat, lon, 2); w11 = self.window(lat, lon, 5)
        return {
            "elevationM": round(self.elevation(lat, lon), 1),
            "slopeDeg": round(slope, 2),
            "aspectDeg": round(aspect, 1),
            "roughnessM": round(float(np.std(w5)), 1),
            "reliefM": round(float(w11.max() - w11.min()), 1),
            "baselineM": round(self.scale_m, 0),
            "roughnessWindowM": round(5 * self.scale_m, 0),
            "reliefWindowM": round(11 * self.scale_m, 0),
            "resolutionM": self.scale_m,
            "dataSource": self.source,
            "grade": "science (LOLA GDR)",
        }


    def horizon(self, lat: float, lon: float, n_az: int = 36, max_km: float = 60.0) -> dict:
        """Terrain horizon elevation angle (deg) per azimuth bin (clockwise from north) by ray-marching the DEM along
        great circles, including the curvature drop d²/2R. Polar sites are dominated by this mask."""
        e0 = self.elevation(lat, lon) + 2.0  # 2 m above ground (lander sensors / solar array)
        la = math.radians(lat); lo = math.radians(lon)
        R = MOON_R_M
        steps = [k * 250.0 for k in range(1, 21)] + [5000.0 + k * 500.0 for k in range(1, int((max_km * 1000 - 5000) / 500) + 1)]
        out = []
        for i in range(n_az):
            az = math.radians(i * 360.0 / n_az)
            best = -90.0
            for d in steps:
                ang = d / R
                la2 = math.asin(math.sin(la) * math.cos(ang) + math.cos(la) * math.sin(ang) * math.cos(az))
                lo2 = lo + math.atan2(math.sin(az) * math.sin(ang) * math.cos(la), math.cos(ang) - math.sin(la) * math.sin(la2))
                lat2 = math.degrees(la2); lon2 = (math.degrees(lo2) + 540.0) % 360.0 - 180.0
                if not self.covers(lat2):
                    break
                try:
                    e = self.elevation(lat2, lon2)
                except Exception:
                    break
                h = math.degrees(math.atan2(e - e0 - d * d / (2 * R), d))
                if h > best:
                    best = h
            out.append(round(max(best, -5.0), 2))
        return {"azimuthStepDeg": 360.0 / n_az, "elevationDeg": out, "maxKm": max_km, "dataSource": self.source,
                "note": "Geometric terrain horizon from the DEM (2 m above ground); no shadowing by features finer than the DEM."}


def horizon_fn(h: dict):
    step = h["azimuthStepDeg"]; vals = h["elevationDeg"]; n = len(vals)
    def f(az_deg: float) -> float:
        x = (az_deg % 360.0) / step; i = int(math.floor(x)) % n; t = x - math.floor(x)
        return vals[i] * (1 - t) + vals[(i + 1) % n] * t
    return f


_lock = threading.Lock()
_loaded: dict[str, PolarDem | None] = {}


def _parse_label(txt: str) -> dict:
    out = {}
    for key in ("LINES", "LINE_SAMPLES", "SCALING_FACTOR", "MAP_SCALE", "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET", "MAXIMUM_LATITUDE", "MINIMUM_LATITUDE", "CENTER_LATITUDE"):
        m = re.search(rf"^\s*{key}\s*=\s*(-?[\d.]+)", txt, re.M)
        if m:
            out[key] = float(m.group(1))
    return out


def load(product: str) -> PolarDem | None:
    """Memory-map a polar product, downloading .img/.lbl into assets/.cache/raw on first use (≈29 MB for 240 m)."""
    with _lock:
        if product in _loaded:
            return _loaded[product]
        try:
            CACHE.mkdir(parents=True, exist_ok=True)
            img = CACHE / f"{product}.img"; lbl = CACHE / f"{product}.lbl"
            for p in (lbl, img):
                if not p.exists():
                    urllib.request.urlretrieve(BASE + p.name, p)
            meta = _parse_label(lbl.read_text(errors="ignore"))
            lines = int(meta["LINES"]); samples = int(meta["LINE_SAMPLES"])
            data = np.memmap(img, dtype="<i2", mode="r", shape=(lines, samples))
            hemi, min_lat, scale = KNOWN.get(product, ("S" if "s_" in product else "N", abs(meta.get("MAXIMUM_LATITUDE", 75.0)) if "s_" in product else abs(meta.get("MINIMUM_LATITUDE", 75.0)), meta.get("MAP_SCALE", 240.0)))
            dem = PolarDem(product, hemi, min_lat, float(meta.get("MAP_SCALE", scale)), lines, samples,
                           float(meta["LINE_PROJECTION_OFFSET"]), float(meta["SAMPLE_PROJECTION_OFFSET"]), float(meta.get("SCALING_FACTOR", 0.5)), data)
            _loaded[product] = dem
        except Exception:  # offline or product missing → caller falls back to the global grid
            _loaded[product] = None
        return _loaded[product]


def products() -> list[str]:
    env = os.environ.get("LOLA_POLAR_PRODUCTS")
    return [p.strip() for p in env.split(",") if p.strip()] if env else list(DEFAULT_PRODUCTS)


def finest_for(lat: float) -> PolarDem | None:
    """Finest configured polar DEM that covers the latitude (None outside 75° or when offline)."""
    best = None
    if abs(lat) < 75.0:
        return None
    for pid in products():
        dem = load(pid)
        if dem and dem.covers(lat) and (best is None or dem.scale_m < best.scale_m):
            best = dem
    return best
