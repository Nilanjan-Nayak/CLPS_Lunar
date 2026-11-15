"""On-demand JPL Horizons cross-check for a lunar surface site.

The mission planner continues to use the local analytical Meeus/IAU model. This
module makes two explicitly requested, read-only Horizons observer queries,
then applies our LOLA horizon mask to their returned Sun/Earth angles. The
result is a sampled comparison, not a replacement for the planning engine or a
flight-certified assessment. Horizons is contacted only through this backend.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from . import dem, ephem

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
STEP_HOURS = 6
# The public SSD APIs ask clients to submit requests serially.
_REQUEST_LOCK = threading.Lock()


class HorizonsUnavailable(Exception):
    """No usable Horizons answer was obtained; callers must not invent data."""


def _utc(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("utc is required, in ISO 8601 with a timezone (e.g. 2026-10-01T12:00:00Z)")
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("utc must be a valid ISO 8601 date and time with a timezone") from exc
    if dt.tzinfo is None:
        raise ValueError("utc must include a timezone (use Z for UTC)")
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    # Bound externally supplied dates to the local analytical solver's intended
    # modern planning range rather than silently extrapolating over centuries.
    if not 1900 <= dt.year <= 2100:
        raise ValueError("Horizons comparisons support dates from 1900 through 2100 UTC")
    return dt


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_horizons(payload: dict) -> tuple[list[dict], str]:
    """Parse only Horizons CSV quantity 4 (airless apparent azimuth/elevation)."""
    if payload.get("error"):
        raise HorizonsUnavailable("NASA JPL Horizons rejected the request")
    text = payload.get("result")
    if not isinstance(text, str) or "$$SOE" not in text or "$$EOE" not in text:
        raise HorizonsUnavailable("NASA JPL Horizons returned no observer ephemeris")
    data = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows: list[dict] = []
    try:
        for row in csv.reader(io.StringIO(data)):
            if not row or not row[0].strip():
                continue
            # CSV columns: calendar UTC, JD(UTC), solar flag, interference
            # flag, azimuth, elevation. JD gives an unambiguous UTC timestamp.
            jd, azimuth, elevation = float(row[1]), float(row[4]), float(row[5])
            if not all(math.isfinite(v) for v in (jd, azimuth, elevation)):
                raise ValueError("non-finite angle")
            seconds = round((jd - 2440587.5) * 86400.0)
            rows.append({"utc": _iso(datetime.fromtimestamp(seconds, timezone.utc)), "jd": jd,
                         "azimuthDeg": azimuth % 360.0, "elevationDeg": elevation})
    except (IndexError, ValueError, OverflowError, OSError) as exc:
        raise HorizonsUnavailable("NASA JPL Horizons returned an unreadable observer table") from exc
    if len(rows) < 2:
        raise HorizonsUnavailable("NASA JPL Horizons returned too few samples")
    # Report the actual dynamics source advertised by the response, rather
    # than assuming that every Horizons product uses the same DE version.
    match = re.search(r"Target body name:[^\n]*\{source:\s*([^}]+)\}", text)
    return rows, match.group(1).strip() if match else "Horizons (source not specified)"


def _fetch(body: str, lat: float, lon: float, altitude_km: float,
           start: datetime, stop: datetime) -> tuple[list[dict], str]:
    params = {
        "format": "json", "COMMAND": f"'{body}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:.8f},{lat:.8f},{altitude_km:.6f}'",
        "START_TIME": f"'{start.strftime('%Y-%m-%d %H:%M:%S')}'",
        "STOP_TIME": f"'{stop.strftime('%Y-%m-%d %H:%M:%S')}'", "STEP_SIZE": f"'{STEP_HOURS} h'",
        "QUANTITIES": "'4'", "APPARENT": "'AIRLESS'", "ANG_FORMAT": "'DEG'",
        "CAL_FORMAT": "'BOTH'", "TIME_DIGITS": "'SECONDS'", "CSV_FORMAT": "'YES'",
        "EXTRA_PREC": "'YES'", "ELEV_CUT": "'-90'",
    }
    req = urllib.request.Request(API_URL + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": "SELENARA-X/1.0 (lunar site research)"})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status != 200:
                raise HorizonsUnavailable("NASA JPL Horizons is temporarily unavailable")
            payload = json.loads(response.read(1_500_000))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise HorizonsUnavailable("NASA JPL Horizons could not be reached; local planning remains available") from exc
    if not isinstance(payload, dict):
        raise HorizonsUnavailable("NASA JPL Horizons returned an invalid response")
    return _parse_horizons(payload)


def _positive_interval(a: float, b: float) -> tuple[float, float] | None:
    """Part of a single sample interval with linearly interpolated clearance > 0."""
    if a <= 0 and b <= 0:
        return None
    if a >= 0 and b >= 0:
        return (0.0, 1.0)
    crossing = max(0.0, min(1.0, -a / (b - a)))
    return (0.0, crossing) if a > 0 else (crossing, 1.0)


def _duration(interval: tuple[float, float] | None) -> float:
    return 0.0 if interval is None else max(0.0, interval[1] - interval[0])


def _overlap(a: tuple[float, float] | None, b: tuple[float, float] | None) -> float:
    if a is None or b is None:
        return 0.0
    return max(0.0, min(a[1], b[1]) - max(a[0], b[0]))


def _angle_delta(local: float, reference: float) -> float:
    return (local - reference + 180.0) % 360.0 - 180.0


def compare_site(lat: float, lon: float, utc: str, days: int = 14) -> dict:
    """Live JPL table + LOLA mask, cached by site/date/duration for one hour."""
    lat, lon = dem.validate_coords(lat, lon)
    start = _utc(utc)
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 45:
        raise ValueError("days must be an integer from 1 to 45")
    if (start + timedelta(days=days)).year > 2100:
        raise ValueError("Horizons comparison must end by 2100-12-31")
    return _compare_cached(lat, lon, _iso(start), days, int(time.time() // 3600))


@lru_cache(maxsize=64)
def _compare_cached(lat: float, lon: float, utc: str, days: int, _hour_bucket: int) -> dict:
    start = _utc(utc)
    stop = start + timedelta(days=days)
    terrain = dem.terrain_features(lat, lon)
    horizon, horizon_fn = dem.best_horizon(lat, lon)
    # Horizon ray tracing uses a 2 m above-ground observer. Horizons expects
    # km above the Moon reference sphere, not distance from its centre.
    elevation_m = float(terrain["elevationM"])
    observer_altitude_km = (elevation_m + 2.0) / 1000.0
    with _REQUEST_LOCK:
        sun, sun_source = _fetch("10", lat, lon, observer_altitude_km, start, stop)
        earth, earth_source = _fetch("399", lat, lon, observer_altitude_km, start, stop)
    expected = days * 24 // STEP_HOURS + 1
    if len(sun) != expected or len(earth) != expected:
        raise HorizonsUnavailable("NASA JPL Horizons returned an incomplete sampled interval")
    series = []
    for index, (s, e) in enumerate(zip(sun, earth)):
        expected_time = start + timedelta(hours=index * STEP_HOURS)
        sample_time = datetime.fromtimestamp((s["jd"] - 2440587.5) * 86400.0, timezone.utc)
        if abs(s["jd"] - e["jd"]) > 1.0 / 86400.0 or abs((sample_time - expected_time).total_seconds()) > 1:
            raise HorizonsUnavailable("NASA JPL Horizons sample times do not align with the requested interval")
        sh, eh = float(horizon_fn(s["azimuthDeg"])), float(horizon_fn(e["azimuthDeg"]))
        sc, ec = s["elevationDeg"] - sh, e["elevationDeg"] - eh
        series.append({
            "utc": s["utc"],
            "sunAzimuthDeg": round(s["azimuthDeg"], 6), "sunElevationDeg": round(s["elevationDeg"], 6),
            "sunHorizonDeg": round(sh, 4), "sunClearanceDeg": round(sc, 6), "sunVisible": sc > 0,
            "earthAzimuthDeg": round(e["azimuthDeg"], 6), "earthElevationDeg": round(e["elevationDeg"], 6),
            "earthHorizonDeg": round(eh, 4), "earthClearanceDeg": round(ec, 6), "earthVisible": ec > 0,
        })
    sun_hours = earth_hours = both_hours = 0.0
    for previous, current in zip(series, series[1:]):
        si = _positive_interval(previous["sunClearanceDeg"], current["sunClearanceDeg"])
        ei = _positive_interval(previous["earthClearanceDeg"], current["earthClearanceDeg"])
        sun_hours += STEP_HOURS * _duration(si)
        earth_hours += STEP_HOURS * _duration(ei)
        both_hours += STEP_HOURS * _overlap(si, ei)
    first = series[0]
    local = ephem.site_geometry(utc, lat, lon)
    span = days * 24.0
    return {
        "kind": "horizons_comparison",
        "source": "NASA/JPL Horizons observer ephemeris",
        "sourceUrl": "https://ssd.jpl.nasa.gov/horizons/",
        "sunEphemeris": sun_source, "earthEphemeris": earth_source,
        "retrievedAtUtc": _iso(datetime.now(timezone.utc)),
        "site": {"latitude": lat, "longitude": lon, "terrainElevationM": elevation_m,
                 "observerHeightM": 2.0, "horizonGrade": horizon.get("grade"),
                 "horizonResolutionM": horizon.get("resolutionM"), "horizonFallbackResolutionM": horizon.get("fallbackResolutionM"),
                 "horizonSource": horizon.get("dataSource"), "horizonNote": horizon.get("note"), "horizonMaxKm": horizon.get("maxKm")},
        "startUtc": first["utc"], "endUtc": series[-1]["utc"], "stepHours": STEP_HOURS,
        "atLanding": first,
        "localAtLanding": {"sunAzimuthDeg": local["sunAzimuthDeg"], "sunElevationDeg": local["sunElevationDeg"],
                           "earthAzimuthDeg": local["earthAzimuthDeg"], "earthElevationDeg": local["earthElevationDeg"]},
        "localMinusHorizonsDeg": {
            "sunAzimuth": round(_angle_delta(local["sunAzimuthDeg"], first["sunAzimuthDeg"]), 4),
            "sunElevation": round(local["sunElevationDeg"] - first["sunElevationDeg"], 4),
            "earthAzimuth": round(_angle_delta(local["earthAzimuthDeg"], first["earthAzimuthDeg"]), 4),
            "earthElevation": round(local["earthElevationDeg"] - first["earthElevationDeg"], 4),
        },
        "summary": {"durationHours": span, "sampleCount": len(series),
                    "sunlitHours": round(sun_hours, 2), "earthVisibleHours": round(earth_hours, 2),
                    "bothVisibleHours": round(both_hours, 2), "sunlitFraction": round(sun_hours / span, 5),
                    "earthVisibleFraction": round(earth_hours / span, 5), "bothVisibleFraction": round(both_hours / span, 5)},
        "series": series,
        "limitations": "On-demand Horizons comparison only; the automatic plan still uses the local analytical model. "
                       "Six-hour sampling with linearly interpolated terrain clearance can miss short windows. "
                       "Body centres, no eclipses, solar-disc size, battery, radio link budget, or relay coverage. "
                       "LOLA horizon resolution and 2 m observer height limit local accuracy; not flight-certified.",
    }
