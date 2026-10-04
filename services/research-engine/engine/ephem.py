"""Low-precision Sun / Earth geometry as seen from a lunar site — pure Python, no SPICE kernels.

    • Sun:   Meeus, *Astronomical Algorithms* ch. 25 (geocentric longitude, ±0.01°)
    • Moon:  Meeus ch. 47, truncated ELP-2000/82 series (≈60 longitude + 30 latitude terms → ≈0.05° / ≈0.1°)
    • Moon orientation: IAU/IAG WGCCRE 2009 report — pole (α0, δ0) and prime meridian W with the 13 libration
      arguments E1…E13 (mean-Earth/polar-axis frame, east-positive longitude)
    • Ecliptic of date → J2000: mean obliquity of date + IAU 1976 precession (Lieske); nutation ignored (±0.005°)
    • TT = UTC + 69.184 s (32.184 s + 37 leap seconds, constant since 2017)

Sub-Earth / sub-solar points on the Moon agree with JPL Horizons (DE441, MOON_ME) to ≤0.6′ at the three epochs checked
(2025-03-06 17:28:50, 2026-09-28 12:00, 2026-10-10 10:00 UTC; see tools/ephemeris/horizons-check.ts) — good enough for
landing-window screening and for pointing the visualisation light, NOT for operations.
Also checked against the published Apollo landing Sun elevations: 11: 10.8°, 12: 5.1°, 14: 10.3°, 15: 12.2°, 17: 13.0°
(model within 0.35°). The often-quoted Apollo 16 value (11.9°) is the pre-delay plan — the landing slipped 5 h 42 min,
so the actual elevation was ≈14.8°, which the model reproduces."""
from __future__ import annotations
import math
from datetime import datetime, timedelta, timezone

MOON_R_KM = 1737.4
D2R = math.pi / 180.0

# --- time -----------------------------------------------------------------------------------------------------------

def parse_utc(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def jd_utc(dt: datetime) -> float:
    return 2440587.5 + dt.timestamp() / 86400.0


def dt_from_jd(jd: float) -> datetime:
    return datetime.fromtimestamp((jd - 2440587.5) * 86400.0, tz=timezone.utc)


# --- Sun (Meeus ch. 25) -------------------------------------------------------------------------------------------------

def sun_ecliptic(T: float) -> tuple[float, float]:
    """Geocentric apparent-ish ecliptic longitude of date (deg) and distance (AU)."""
    L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
    M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
    Mr = M * D2R
    C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * math.sin(Mr) + (0.019993 - 0.000101 * T) * math.sin(2 * Mr) + 0.000289 * math.sin(3 * Mr)
    lon = (L0 + C) % 360.0
    e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T
    nu = Mr + C * D2R
    R = 1.000001018 * (1 - e * e) / (1 + e * math.cos(nu))
    return lon, R


# --- Moon (Meeus ch. 47, truncated) ---------------------------------------------------------------------------------------
# (D, M, M', F, Σl coefficient ×1e-6 deg, Σr coefficient m)
_LR = [
    (0, 0, 1, 0, 6288774, -20905355), (2, 0, -1, 0, 1274027, -3699111), (2, 0, 0, 0, 658314, -2955968), (0, 0, 2, 0, 213618, -569925),
    (0, 1, 0, 0, -185116, 48888), (0, 0, 0, 2, -114332, -3149), (2, 0, -2, 0, 58793, 246158), (2, -1, -1, 0, 57066, -152138),
    (2, 0, 1, 0, 53322, -170733), (2, -1, 0, 0, 45758, -204586), (0, 1, -1, 0, -40923, -129620), (1, 0, 0, 0, -34720, 108743),
    (0, 1, 1, 0, -30383, 104755), (2, 0, 0, -2, 15327, 10321), (0, 0, 1, 2, -12528, 0), (0, 0, 1, -2, 10980, 79661),
    (4, 0, -1, 0, 10675, -34782), (0, 0, 3, 0, 10034, -23210), (4, 0, -2, 0, 8548, -21636), (2, 1, -1, 0, -7888, 24208),
    (2, 1, 0, 0, -6766, 30824), (1, 0, -1, 0, -5163, -8379), (1, 1, 0, 0, 4987, -16675), (2, -1, 1, 0, 4036, -12831),
    (2, 0, 2, 0, 3994, -10445), (4, 0, 0, 0, 3861, -11650), (2, 0, -3, 0, 3665, 14403), (0, 1, -2, 0, -2689, -7003),
    (2, 0, -1, 2, -2602, 0), (2, -1, -2, 0, 2390, 10056), (1, 0, 1, 0, -2348, 6322), (2, -2, 0, 0, 2236, -9884),
    (0, 1, 2, 0, -2120, 5751), (0, 2, 0, 0, -2069, 0), (2, -2, -1, 0, 2048, -4950), (2, 0, 1, -2, -1773, 4130),
    (2, 0, 0, 2, -1595, 0), (4, -1, -1, 0, 1215, -3958), (0, 0, 2, 2, -1110, 0), (3, 0, -1, 0, -892, 3258),
    (2, 1, 1, 0, -810, 2616), (4, -1, -2, 0, 759, -1897), (0, 2, -1, 0, -713, -2117), (2, 2, -1, 0, -700, 2354),
    (2, 1, -2, 0, 691, 0), (2, -1, 0, -2, 596, 0), (4, 0, 1, 0, 549, -1423), (0, 0, 4, 0, 537, -1117),
    (4, -1, 0, 0, 520, -1571), (1, 0, -2, 0, -487, -1739), (2, 1, 0, -2, -399, 0), (0, 0, 2, -2, -381, -4421),
    (1, 1, 1, 0, 351, 0), (3, 0, -2, 0, -340, 0), (4, 0, -3, 0, 330, 0), (2, -1, 2, 0, 327, 0),
    (0, 2, 1, 0, -323, 1165), (1, 1, -1, 0, 299, 0), (2, 0, 3, 0, 294, 0), (2, 0, -1, -2, 0, 8752),
]
# (D, M, M', F, Σb coefficient ×1e-6 deg)
_B = [
    (0, 0, 0, 1, 5128122), (0, 0, 1, 1, 280602), (0, 0, 1, -1, 277693), (2, 0, 0, -1, 173237), (2, 0, -1, 1, 55413),
    (2, 0, -1, -1, 46271), (2, 0, 0, 1, 32573), (0, 0, 2, 1, 17198), (2, 0, 1, -1, 9266), (0, 0, 2, -1, 8822),
    (2, -1, 0, -1, 8216), (2, 0, -2, -1, 4324), (2, 0, 1, 1, 4200), (2, 1, 0, -1, -3359), (2, -1, -1, 1, 2463),
    (2, -1, 0, 1, 2211), (2, -1, -1, -1, 2065), (0, 1, -1, -1, -1870), (4, 0, -1, -1, 1828), (0, 1, 0, 1, -1794),
    (0, 0, 0, 3, -1749), (0, 1, -1, 1, -1565), (1, 0, 0, 1, -1491), (0, 1, 1, 1, -1475), (0, 1, 1, -1, -1410),
    (0, 1, 0, -1, -1344), (1, 0, 0, -1, -1335), (0, 0, 3, 1, 1107), (4, 0, 0, -1, 1021), (4, 0, -1, 1, 833),
]


def moon_ecliptic(T: float) -> tuple[float, float, float]:
    """Geocentric ecliptic longitude, latitude (deg, of date) and distance (km)."""
    Lp = (218.3164477 + 481267.88123421 * T - 0.0015786 * T ** 2 + T ** 3 / 538841 - T ** 4 / 65194000) % 360
    D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T ** 2 + T ** 3 / 545868 - T ** 4 / 113065000) % 360
    M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000) % 360
    Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T ** 2 + T ** 3 / 69699 - T ** 4 / 14712000) % 360
    F = (93.2720950 + 483202.0175233 * T - 0.0036539 * T ** 2 - T ** 3 / 3526000 + T ** 4 / 863310000) % 360
    A1 = (119.75 + 131.849 * T) % 360; A2 = (53.09 + 479264.290 * T) % 360; A3 = (313.45 + 481266.484 * T) % 360
    E = 1 - 0.002516 * T - 0.0000074 * T * T
    sl = 0.0; sr = 0.0; sb = 0.0
    for d, m, mp, f, cl, cr in _LR:
        arg = (d * D + m * M + mp * Mp + f * F) * D2R
        k = E if abs(m) == 1 else (E * E if abs(m) == 2 else 1.0)
        sl += cl * k * math.sin(arg); sr += cr * k * math.cos(arg)
    for d, m, mp, f, cb in _B:
        arg = (d * D + m * M + mp * Mp + f * F) * D2R
        k = E if abs(m) == 1 else (E * E if abs(m) == 2 else 1.0)
        sb += cb * k * math.sin(arg)
    sl += 3958 * math.sin(A1 * D2R) + 1962 * math.sin((Lp - F) * D2R) + 318 * math.sin(A2 * D2R)
    sb += (-2235 * math.sin(Lp * D2R) + 382 * math.sin(A3 * D2R) + 175 * math.sin((A1 - F) * D2R) + 175 * math.sin((A1 + F) * D2R)
           + 127 * math.sin((Lp - Mp) * D2R) - 115 * math.sin((Lp + Mp) * D2R))
    return (Lp + sl / 1e6) % 360, sb / 1e6, 385000.56 + sr / 1000.0


# --- frames ------------------------------------------------------------------------------------------------------------------
ARCSEC = D2R / 3600.0
TT_MINUS_UTC_S = 69.184  # 32.184 s + 37 leap seconds (constant since 2017-01-01)


def mean_obliquity(T: float) -> float:
    """Mean obliquity of the ecliptic of date (IAU 1980), radians."""
    return (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T) * ARCSEC


def _rot_y(v, ang):
    c, s = math.cos(ang), math.sin(ang); x, y, z = v
    return (c * x - s * z, y, s * x + c * z)


def precess_date_to_j2000(v, T: float):
    """Mean equator/equinox of date → J2000 (transpose of the IAU 1976 matrix P = R3(−z)·R2(θ)·R3(−ζ), Lieske et al.)."""
    T2 = T * T; T3 = T2 * T
    zeta = (2306.2181 * T + 0.30188 * T2 + 0.017998 * T3) * ARCSEC
    z = (2306.2181 * T + 1.09468 * T2 + 0.018203 * T3) * ARCSEC
    theta = (2004.3109 * T - 0.42665 * T2 - 0.041833 * T3) * ARCSEC
    # Pᵀ = R3(ζ)·R2(−θ)·R3(z)  (frame rotations applied right-to-left)
    v = _rot_z(v, z)
    v = _rot_y(v, -theta)
    return _rot_z(v, zeta)


def ecl_date_to_eq_j2000(lon_deg: float, lat_deg: float, T: float) -> tuple[float, float, float]:
    """Ecliptic-of-date spherical → equatorial J2000 unit vector (obliquity of date, then IAU 1976 precession Pᵀ)."""
    lon = lon_deg * D2R
    lat = lat_deg * D2R
    x = math.cos(lat) * math.cos(lon); y = math.cos(lat) * math.sin(lon); z = math.sin(lat)
    eps = mean_obliquity(T); ce, se = math.cos(eps), math.sin(eps)
    return precess_date_to_j2000((x, y * ce - z * se, y * se + z * ce), T)


def moon_orientation(jd: float) -> tuple[float, float, float]:
    """IAU 2009 Moon pole RA/Dec and prime-meridian angle W (deg) at TDB≈UTC Julian date."""
    d = jd - 2451545.0; T = d / 36525.0
    E = [0.0,
         125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
         357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.0649930 * d, 276.617 + 0.3287146 * d,
         34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d, 25.053 + 12.9590088 * d]
    s = [0.0] + [math.sin(e * D2R) for e in E[1:]]; c = [0.0] + [math.cos(e * D2R) for e in E[1:]]
    a0 = (269.9949 + 0.0031 * T - 3.8787 * s[1] - 0.1204 * s[2] + 0.0700 * s[3] - 0.0172 * s[4] + 0.0072 * s[6] - 0.0052 * s[10] + 0.0043 * s[13])
    d0 = (66.5392 + 0.0130 * T + 1.5419 * c[1] + 0.0239 * c[2] - 0.0278 * c[3] + 0.0068 * c[4] - 0.0029 * c[6] + 0.0009 * c[7] + 0.0008 * c[10] - 0.0009 * c[13])
    W = (38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.5610 * s[1] + 0.1208 * s[2] - 0.0642 * s[3] + 0.0158 * s[4] + 0.0252 * s[5]
         - 0.0066 * s[6] - 0.0047 * s[7] - 0.0046 * s[8] + 0.0028 * s[9] + 0.0052 * s[10] + 0.0040 * s[11] + 0.0019 * s[12] - 0.0044 * s[13])
    return a0, d0, W % 360.0


def _rot_z(v, ang):
    c, s = math.cos(ang), math.sin(ang); x, y, z = v
    return (c * x + s * y, -s * x + c * y, z)


def _rot_x(v, ang):
    c, s = math.cos(ang), math.sin(ang); x, y, z = v
    return (x, c * y + s * z, -s * y + c * z)


def icrf_to_body(v, jd: float):
    """ICRF/J2000 vector → Moon body-fixed (mean Earth/polar axis) via R3(W)·R1(90−δ0)·R3(90+α0)."""
    a0, d0, W = moon_orientation(jd)
    v = _rot_z(v, (90.0 + a0) * D2R)
    v = _rot_x(v, (90.0 - d0) * D2R)
    return _rot_z(v, W * D2R)


def body_to_icrf(v, jd: float):
    """Moon body-fixed (IAU) → ICRF/J2000: inverse of icrf_to_body (transposed rotations in reverse order)."""
    a0, d0, W = moon_orientation(jd)
    v = _rot_z(v, -W * D2R)
    v = _rot_x(v, -(90.0 - d0) * D2R)
    return _rot_z(v, -(90.0 + a0) * D2R)


def moon_geocentric_icrf(jd_utc: float) -> tuple[float, float, float]:
    """Geocentric Moon position (km) in ICRF/J2000 equatorial axes at a UTC Julian date (Meeus series, ≈0.05°)."""
    jd = jd_utc + TT_MINUS_UTC_S / 86400.0
    T = (jd - 2451545.0) / 36525.0
    mlon, mlat, mdist = moon_ecliptic(T)
    return tuple(c * mdist for c in ecl_date_to_eq_j2000(mlon, mlat, T))


def earth_rotation_angle(jd_utc: float) -> float:
    """IAU 2000 Earth Rotation Angle (radians), UT1 ≈ UTC."""
    t = jd_utc - 2451545.0
    f = (0.779057273264 + 1.00273781191135448 * t) % 1.0
    return 2.0 * math.pi * f


def gmst(jd_utc: float) -> float:
    """Greenwich Mean Sidereal Time (radians), IAU 2006 (ERA + precession-in-RA polynomial)."""
    T = (jd_utc + TT_MINUS_UTC_S / 86400.0 - 2451545.0) / 36525.0
    poly = (0.014506 + 4612.156534 * T + 1.3915817 * T * T - 0.00000044 * T ** 3 - 0.000029956 * T ** 4 - 0.0000000368 * T ** 5) * ARCSEC
    return (earth_rotation_angle(jd_utc) + poly) % (2.0 * math.pi)


def ecef_to_icrf(v, jd_utc: float):
    """Earth-fixed vector → ICRF/J2000 (rotate by GMST about the mean pole of date, then precess to J2000; nutation ignored)."""
    T = (jd_utc + TT_MINUS_UTC_S / 86400.0 - 2451545.0) / 36525.0
    return precess_date_to_j2000(_rot_z(v, -gmst(jd_utc)), T)


def _latlon(v) -> tuple[float, float]:
    x, y, z = v; n = math.sqrt(x * x + y * y + z * z)
    return math.degrees(math.asin(z / n)), (math.degrees(math.atan2(y, x)) + 540.0) % 360.0 - 180.0


def geometry(jd: float) -> dict:
    """Sub-solar and sub-Earth points (deg, east +) plus Moon-centred body-fixed Earth and Sun vectors (km). jd = UTC."""
    jd = jd + TT_MINUS_UTC_S / 86400.0  # dynamical time for the series and the IAU orientation
    T = (jd - 2451545.0) / 36525.0
    slon, sdist_au = sun_ecliptic(T)
    mlon, mlat, mdist = moon_ecliptic(T)
    sun_geo = [c * sdist_au * 149597870.7 for c in ecl_date_to_eq_j2000(slon, 0.0, T)]
    moon_geo = [c * mdist for c in ecl_date_to_eq_j2000(mlon, mlat, T)]
    earth_from_moon = tuple(-m for m in moon_geo)
    sun_from_moon = tuple(s - m for s, m in zip(sun_geo, moon_geo))
    e_b = icrf_to_body(earth_from_moon, jd); s_b = icrf_to_body(sun_from_moon, jd)
    ss_lat, ss_lon = _latlon(s_b); se_lat, se_lon = _latlon(e_b)
    return {"subSolarLat": ss_lat, "subSolarLon": ss_lon, "subEarthLat": se_lat, "subEarthLon": se_lon,
            "earthVecKm": e_b, "sunVecKm": s_b, "earthDistanceKm": mdist}


def site_frame(lat: float, lon: float):
    la, lo = lat * D2R, lon * D2R
    up = (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    north = (-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la))
    east = (-math.sin(lo), math.cos(lo), 0.0)
    return up, north, east


def elev_az(vec_km, lat: float, lon: float) -> tuple[float, float]:
    """Topocentric elevation / azimuth (deg, az clockwise from north) of a Moon-centred body-fixed vector."""
    up, north, east = site_frame(lat, lon)
    site = tuple(u * MOON_R_KM for u in up)
    d = tuple(v - s for v, s in zip(vec_km, site))
    n = math.sqrt(sum(c * c for c in d)); d = tuple(c / n for c in d)
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))
    return math.degrees(math.asin(max(-1.0, min(1.0, dot(d, up))))), (math.degrees(math.atan2(dot(d, east), dot(d, north))) + 360.0) % 360.0


def site_geometry(iso_or_jd, lat: float, lon: float) -> dict:
    jd = iso_or_jd if isinstance(iso_or_jd, float) else jd_utc(parse_utc(iso_or_jd))
    g = geometry(jd)
    se, sa = elev_az(g["sunVecKm"], lat, lon); ee, ea = elev_az(g["earthVecKm"], lat, lon)
    return {"utc": dt_from_jd(jd).isoformat(timespec="minutes").replace("+00:00", "Z"), "jd": jd,
            "sunElevationDeg": round(se, 2), "sunAzimuthDeg": round(sa, 1), "earthElevationDeg": round(ee, 2), "earthAzimuthDeg": round(ea, 1),
            "subSolarLat": round(g["subSolarLat"], 2), "subSolarLon": round(g["subSolarLon"], 2),
            "subEarthLat": round(g["subEarthLat"], 2), "subEarthLon": round(g["subEarthLon"], 2), "earthDistanceKm": round(g["earthDistanceKm"])}


def profile(lat: float, lon: float, start_iso: str, days: float, step_hours: float = 6.0) -> list[dict]:
    jd0 = jd_utc(parse_utc(start_iso)); n = int(days * 24 / step_hours) + 1
    return [site_geometry(jd0 + i * step_hours / 24.0, lat, lon) for i in range(n)]


def _sun_elev(jd, lat, lon):
    return elev_az(geometry(jd)["sunVecKm"], lat, lon)[0]


def landing_windows(lat: float, lon: float, from_iso: str, count: int = 6, target_elev_deg: float = 7.0, horizon_deg: float = 0.0, horizon_fn=None) -> list[dict]:
    """Next `count` times the Sun rises through `target_elev_deg` at the site (≈ 'land shortly after local sunrise'),
    with the sunlit span that follows, the Earth's elevation (comms) and the day's peak Sun. Geometric horizon only
    unless `horizon_deg` (terrain mask) is given."""
    jd = jd_utc(parse_utc(from_iso)); out = []
    step = 2.0 / 24.0
    prev = _sun_elev(jd, lat, lon) - target_elev_deg
    t = jd
    while len(out) < count and t < jd + 800:
        t += step
        cur = _sun_elev(t, lat, lon) - target_elev_deg
        if prev < 0 <= cur:
            a, b = t - step, t
            for _ in range(20):
                m = 0.5 * (a + b)
                if _sun_elev(m, lat, lon) - target_elev_deg < 0: a = m
                else: b = m
            t_cross = 0.5 * (a + b)
            # sunlit span after crossing (until the Sun drops below the horizon) and peak elevation
            peak = -90.0; sunset = None; tt = t_cross; sunlit_h = 0.0
            while tt < t_cross + 40 and sunset is None:
                e, az = elev_az(geometry(tt)["sunVecKm"], lat, lon); peak = max(peak, e)
                mask = horizon_fn(az) if horizon_fn else horizon_deg
                if e > mask: sunlit_h += 4.0
                if e < horizon_deg: sunset = tt
                tt += 4.0 / 24.0
            g = site_geometry(t_cross, lat, lon)
            # Earth visibility over the following 14 days
            ee = [elev_az(geometry(t_cross + k / 4.0)["earthVecKm"], lat, lon)[0] for k in range(0, 57)]
            g["sunVisible"] = g["sunElevationDeg"] > (horizon_fn(g["sunAzimuthDeg"]) if horizon_fn else horizon_deg)
            out.append({**g, "dayHoursAfter": round(((sunset or t_cross + 40) - t_cross) * 24.0, 1), "sunlitHoursAfter": round(sunlit_h, 1), "peakSunElevationDeg": round(peak, 2),
                        "earthElevationMinDeg14d": round(min(ee), 2), "earthElevationMaxDeg14d": round(max(ee), 2),
                        "targetSunElevationDeg": target_elev_deg, "horizonDeg": horizon_deg})
        prev = cur
    return out
