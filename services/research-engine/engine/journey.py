"""journey.py — Earth launch → Moon landing route, reconstructed from published event anchors.

Everything here is a MODEL, never telemetry: two-body conics (Earth-centred until lunar-orbit insertion, Moon-centred
afterwards) are fitted to the verified anchors of a mission — launch pad + launch UTC, TLI / LOI / DOI / PDI / landing
UTC, orbit altitudes and the landing-site coordinates — using the same Sun/Moon ephemeris the rest of the app uses.

    frame  geocentric ICRF/J2000 equatorial, km, seconds since launch   (segments with frame == "earth-inertial")
           Moon body-fixed IAU axes, km                                 (segments with frame == "moon-fixed")

How the route is built
    1. Launch plane   = the plane through the pad (at launch, inertial) and the Moon's position at LOI — the geometry
                        that defines real lunar launch windows. Prograde (eastward) launch.
    2. Ascent         ≈9 min analytic arc to the parking altitude, ~15° downrange; then a circular parking coast.
    3. TLI            Lambert (universal variables) from the parking-orbit position at the published TLI time to the
                        Moon at the published LOI time; the departure Δv is reported, not assumed.
       phasing        Blue-Ghost-style missions: injection into an ellipse, apogee-raising burns at perigee on the
                        published burn dates, last loop stretched so the final perigee coincides with TLI.
    4. LOI            hyperbolic approach turned into a circular orbit whose plane contains the arrival asymptote AND
                        the landing site (inertial, at landing time); the orbit rate is nudged (few km) so that the
                        descent-orbit insertion happens exactly opposite the powered-descent point at the right time.
    5. DOI → PDI      Hohmann-like descent ellipse (apolune = orbit, perilune = PDI altitude), n + ½ revolutions.
    6. Descent        integrated powered-descent profile (descent.py) for the lander class, ending at the site.
    earth-return      Peregrine-style: one Kepler loop from injection to atmospheric re-entry.

Fidelity labels:  reconstructed (past mission, published anchors) · projected (announced mission, NET window,
                  provider's previous profile) · planned (user plan from mission.plan()).
"""
from __future__ import annotations
import math
from datetime import datetime, timedelta, timezone

from . import ephem
from . import descent as descent_mod

MU_E = 398600.4418        # km³/s²
MU_M = 4902.800066
R_E = 6378.137            # WGS84 equatorial radius (km)
F_E = 1.0 / 298.257223563
R_M = 1737.4
TWO_PI = 2.0 * math.pi

# ------------------------------------------------------------------------------------------------------------------
# small vector helpers (pure python; the engine has no numpy dependency)
def _add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def _cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _norm(a): return math.sqrt(_dot(a, a))
def _unit(a):
    n = _norm(a)
    return (a[0] / n, a[1] / n, a[2] / n)
def _rot(v, axis, ang):
    """Rodrigues rotation of v about the unit axis by ang (radians, right-handed)."""
    c, s = math.cos(ang), math.sin(ang)
    return _add(_add(_mul(v, c), _mul(_cross(axis, v), s)), _mul(axis, _dot(axis, v) * (1.0 - c)))
def _angle_ccw(a, b, n):
    """Angle from a to b counter-clockwise about n (0…2π), both ⟂ n."""
    ang = math.atan2(_dot(_cross(a, b), n), _dot(a, b))
    return ang + TWO_PI if ang < 0 else ang


# ------------------------------------------------------------------------------------------------------------------
# time helpers
def _parse(iso: str) -> datetime:
    return ephem.parse_utc(iso)

def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def _jd(dt: datetime) -> float:
    return ephem.jd_utc(dt)


# ------------------------------------------------------------------------------------------------------------------
# ephemeris wrappers
def moon_state(dt: datetime):
    """Geocentric Moon position (km) and velocity (km/s), ICRF."""
    jd = _jd(dt)
    r = ephem.moon_geocentric_icrf(jd)
    h = 60.0 / 86400.0
    r1 = ephem.moon_geocentric_icrf(jd - h); r2 = ephem.moon_geocentric_icrf(jd + h)
    return r, _mul(_sub(r2, r1), 1.0 / 120.0)

def pad_icrf(lat_deg: float, lon_deg: float, alt_m: float, dt: datetime):
    """Launch pad → geocentric ICRF position (km) at a UTC instant on the 6,371.0 km scene Earth sphere."""
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    r = 6371.0 + alt_m / 1000.0
    ecef = (r * math.cos(la) * math.cos(lo), r * math.cos(la) * math.sin(lo), r * math.sin(la))
    return ephem.ecef_to_icrf(ecef, _jd(dt))

def site_icrf_dir(lat_deg: float, lon_deg: float, dt: datetime):
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    body = (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    return _unit(ephem.body_to_icrf(body, _jd(dt)))

def moon_pole_icrf(dt: datetime):
    return _unit(ephem.body_to_icrf((0.0, 0.0, 1.0), _jd(dt)))


# ------------------------------------------------------------------------------------------------------------------
# two-body machinery: Stumpff functions, universal-variable propagation (Vallado alg. 8), Lambert (Curtis alg. 5.2)
def _stumpff(psi: float):
    if psi > 1e-6:
        s = math.sqrt(psi)
        return (1 - math.cos(s)) / psi, (s - math.sin(s)) / (s ** 3)
    if psi < -1e-6:
        s = math.sqrt(-psi)
        return (1 - math.cosh(s)) / psi, (math.sinh(s) - s) / (s ** 3)
    return 0.5, 1.0 / 6.0


def propagate(r0, v0, dt: float, mu: float):
    """Kepler propagation by dt seconds (any conic) with universal variables. The universal anomaly χ is found by a
    safeguarded Newton/bisection on the (monotonic) time equation, so long, very eccentric arcs converge too."""
    if abs(dt) < 1e-9:
        return r0, v0
    r0n = _norm(r0); v0n = _norm(v0); smu = math.sqrt(mu)
    rv0 = _dot(r0, v0)            # r0·v0 (dot product — NOT the radial speed), as in Vallado's algorithm 8
    alpha = 2.0 / r0n - v0n * v0n / mu
    sign = 1.0 if dt > 0 else -1.0
    if alpha > 1e-9:               # ellipse: reduce to one period, bracket χ ∈ [0, 2π/√α]
        period = TWO_PI / (math.sqrt(alpha) ** 3 * smu)
        dt = dt - math.floor(dt / period) * period
        if dt < 1e-9:
            return r0, v0
        sign = 1.0
        lo, hi = 0.0, TWO_PI / math.sqrt(alpha)
    else:                          # parabola / hyperbola: bracket by expansion
        lo, hi = 0.0, sign * max(1.0, smu * abs(dt) / r0n)
        while True:
            chi = hi; psi = chi * chi * alpha; c2, c3 = _stumpff(psi)
            tval = (chi ** 3 * c3 + rv0 / smu * chi * chi * c2 + r0n * chi * (1.0 - psi * c3)) / smu
            if sign * (tval - dt) > 0 or abs(hi) > 1e9:
                break
            hi *= 2.0
        if sign < 0:
            lo, hi = hi, lo

    def time_of(chi):
        psi = chi * chi * alpha; c2, c3 = _stumpff(psi)
        return (chi ** 3 * c3 + rv0 / smu * chi * chi * c2 + r0n * chi * (1.0 - psi * c3)) / smu

    chi = 0.5 * (lo + hi)
    for _ in range(200):
        psi = chi * chi * alpha; c2, c3 = _stumpff(psi)
        r = chi * chi * c2 + rv0 / smu * chi * (1.0 - psi * c3) + r0n * (1.0 - psi * c2)
        f = time_of(chi) - dt
        if abs(f) < 1e-9 * max(1.0, abs(dt)):
            break
        if f > 0:
            hi = chi
        else:
            lo = chi
        step = f * smu / r if r > 0 else 0.0     # Newton step (dt/dχ = r/√μ)
        cand = chi - step
        chi = cand if (lo < cand < hi) else 0.5 * (lo + hi)
        if hi - lo < 1e-13 * max(1.0, abs(hi)):
            break
    psi = chi * chi * alpha
    c2, c3 = _stumpff(psi)
    r = chi * chi * c2 + rv0 / smu * chi * (1.0 - psi * c3) + r0n * (1.0 - psi * c2)
    f = 1.0 - chi * chi / r0n * c2
    g = dt - chi ** 3 / smu * c3
    gdot = 1.0 - chi * chi / r * c2
    fdot = smu / (r * r0n) * chi * (psi * c3 - 1.0)
    return _add(_mul(r0, f), _mul(v0, g)), _add(_mul(r0, fdot), _mul(v0, gdot))


def _hyp2f1b(z: float) -> float:
    """Hypergeometric 2F1(3, 1, 5/2, z) series (Battin), |z| < 1."""
    Sj = 1.0; Cj = 1.0; err = 1.0; j = 0
    while err > 1e-11 and j < 200:
        Cj1 = Cj * (3.0 + j) * (1.0 + j) / (2.5 + j) * z / (j + 1)
        Sj1 = Sj + Cj1
        err = abs(Cj1); Sj = Sj1; Cj = Cj1; j += 1
    return Sj


def _tof_x(x: float, lam: float, N: int = 0) -> float:
    """Non-dimensional time of flight T(x) (Izzo 2015 / Lancaster–Blanchard)."""
    battin = 0.01; lagrange = 0.2; dist = abs(x - 1.0)
    if battin < dist < lagrange:
        a = 1.0 / (1.0 - x * x)
        if a > 0:
            alfa = 2.0 * math.acos(x); beta = 2.0 * math.asin(math.sqrt(lam * lam / a))
            if lam < 0: beta = -beta
            return (a * math.sqrt(a) * ((alfa - math.sin(alfa)) - (beta - math.sin(beta)) + 2.0 * math.pi * N)) / 2.0
        alfa = 2.0 * math.acosh(x); beta = 2.0 * math.asinh(math.sqrt(-lam * lam / a))
        if lam < 0: beta = -beta
        return (-a * math.sqrt(-a) * ((beta - math.sinh(beta)) - (alfa - math.sinh(alfa)))) / 2.0
    E = x * x - 1.0; rho = abs(E); z = math.sqrt(1.0 + lam * lam * E)
    if dist < battin:
        eta = z - lam * x; S1 = 0.5 * (1.0 - lam - x * eta); Q = 4.0 / 3.0 * _hyp2f1b(S1)
        return (eta ** 3 * Q + 4.0 * lam * eta) / 2.0 + N * math.pi / (rho ** 1.5)
    y = math.sqrt(rho); g = x * z - lam * E
    if E < 0:
        d = N * math.pi + math.acos(max(-1.0, min(1.0, g)))
    else:
        d = math.log(max(1e-300, y * (z - lam * x) + g))
    return (x - lam * z - d / y) / E


def lambert(r1, r2, tof: float, mu: float, normal):
    """Single-revolution Lambert transfer r1 → r2 in tof seconds, motion counter-clockwise about `normal`.
    Izzo (2015) formulation with Householder iterations — well-behaved for transfer angles at and near 180°, which is
    exactly where minimum-energy Earth→Moon departures live. Returns (v1, v2)."""
    r1n, r2n = _norm(r1), _norm(r2)
    nrm = _unit(normal)
    h = _cross(r1, r2)
    if _norm(h) > 1e-6 * r1n * r2n:
        hh = _unit(h)
        if _dot(hh, nrm) < 0:
            hh = _mul(hh, -1.0)
    else:  # collinear: the plane is the one given
        hh = _unit(_sub(nrm, _mul(_unit(r1), _dot(nrm, _unit(r1)))))
    r1h = _unit(r1); r2h = _unit(r2)
    dth = _angle_ccw(_sub(r1h, _mul(hh, _dot(r1h, hh))), _sub(r2h, _mul(hh, _dot(r2h, hh))), hh)
    c = _norm(_sub(r2, r1)); s_ = 0.5 * (r1n + r2n + c)
    lam = math.sqrt(max(0.0, 1.0 - c / s_))
    if dth > math.pi:
        lam = -lam
    T = math.sqrt(2.0 * mu / s_ ** 3) * tof
    # initial guess (Izzo)
    T00 = math.acos(lam) + lam * math.sqrt(1.0 - lam * lam); T1 = 2.0 / 3.0 * (1.0 - lam ** 3)
    if T >= T00:
        x = -(T - T00) / (T - T00 + 4.0)
    elif T <= T1:
        x = T1 * (T1 - T) / (0.4 * (1.0 - lam ** 5) * T) + 1.0
    else:
        x = (T / T00) ** (math.log(2.0) / math.log(T1 / T00)) - 1.0
    for _ in range(40):
        tofx = _tof_x(x, lam)
        f = tofx - T
        y = math.sqrt(max(1e-16, 1.0 - lam * lam * (1.0 - x * x)))
        umx2 = 1.0 - x * x
        if abs(umx2) < 1e-12:
            umx2 = 1e-12
        DT = (3.0 * tofx * x - 2.0 + 2.0 * lam ** 3 * x / y) / umx2
        DDT = (3.0 * tofx + 5.0 * x * DT + 2.0 * (1.0 - lam * lam) * lam ** 3 / y ** 3) / umx2
        DDDT = (7.0 * x * DDT + 8.0 * DT - 6.0 * (1.0 - lam * lam) * lam ** 5 * x / y ** 5) / umx2
        denom = DT * (DT * DT - f * DDT) + DDDT * f * f / 6.0
        if denom == 0:
            break
        dx = f * (DT * DT - f * DDT / 2.0) / denom
        x -= dx
        if abs(dx) < 1e-12:
            break
    if not math.isfinite(x):
        raise ValueError("Lambert: iteration diverged")
    y = math.sqrt(max(0.0, 1.0 - lam * lam * (1.0 - x * x)))
    gamma = math.sqrt(mu * s_ / 2.0); rho = (r1n - r2n) / c; sigma = math.sqrt(max(0.0, 1.0 - rho * rho))
    vr1 = gamma * ((lam * y - x) - rho * (lam * y + x)) / r1n
    vr2 = -gamma * ((lam * y - x) + rho * (lam * y + x)) / r2n
    vt = gamma * sigma * (y + lam * x)
    t1 = _unit(_cross(hh, r1h)); t2 = _unit(_cross(hh, r2h))
    v1 = _add(_mul(r1h, vr1), _mul(t1, vt / r1n))
    v2 = _add(_mul(r2h, vr2), _mul(t2, vt / r2n))
    return v1, v2


def _periapsis(r, v, mu: float) -> float:
    """Periapsis radius of the conic through (r, v)."""
    rn = _norm(r); h = _norm(_cross(r, v)); energy = 0.5 * _dot(v, v) - mu / rn
    e = math.sqrt(max(0.0, 1.0 + 2.0 * energy * h * h / (mu * mu)))
    p = h * h / mu
    return p / (1.0 + e)


def _kepler_E(M: float, e: float) -> float:
    E = M if e < 0.8 else math.pi
    for _ in range(50):
        d = (E - e * math.sin(E) - M) / (1.0 - e * math.cos(E))
        E -= d
        if abs(d) < 1e-12:
            break
    return E


# ------------------------------------------------------------------------------------------------------------------
class _Builder:
    def __init__(self, spec: dict):
        self.spec = spec
        self.launch = _parse(spec["launchUtc"])
        self.segments: list[dict] = []
        self.events: list[dict] = []
        self.notes: list[str] = []
        self.stats: dict = {}

    # -- helpers ----------------------------------------------------------------------------------------------------
    def t(self, dt: datetime) -> float:
        return (dt - self.launch).total_seconds()

    def at(self, sec: float) -> datetime:
        return self.launch + timedelta(seconds=sec)

    def event(self, eid: str, etype: str, dt: datetime, title: str, source: str, note: str | None = None):
        self.events.append({"id": eid, "type": etype, "utc": _iso(dt), "tSec": round(self.t(dt), 1), "title": title, "source": source, **({"note": note} if note else {})})

    def seg(self, sid: str, kind: str, label: str, frame: str, samples: list, note: str, **stats):
        self.segments.append({"id": sid, "kind": kind, "label": label, "frame": frame, "startUtc": _iso(self.at(samples[0][0])), "endUtc": _iso(self.at(samples[-1][0])),
                              "durationS": round(samples[-1][0] - samples[0][0]), "samples": [[round(s[0], 1), round(s[1], 3), round(s[2], 3), round(s[3], 3)] for s in samples],
                              "note": note, "stats": {k: v for k, v in stats.items() if v is not None}})

    # -- Earth phase ------------------------------------------------------------------------------------------------
    def launch_plane(self, target_dir, parking_alt: float):
        """Launch plane through the pad (inertial, at launch) and the arrival direction; prograde. Returns geometry."""
        sp = self.spec; site = sp["launchSite"]
        p0 = pad_icrf(site["latitude"], site["longitude"], site.get("altitudeM", 0.0), self.launch)
        n = _unit(_cross(p0, target_dir))
        if n[2] < 0:
            n = _mul(n, -1.0)  # eastward (prograde) launch
        p0h = _unit(p0)
        e_dir = _unit(_cross(n, p0h))
        r_park = R_E + parking_alt
        T_asc = float(sp.get("ascentS", 540.0)); gamma_end = 1700.0 / R_E
        base = _unit(_add(_mul(p0h, math.cos(gamma_end)), _mul(e_dir, math.sin(gamma_end))))
        omega = math.sqrt(MU_E / r_park ** 3)
        return {"p0": p0, "p0h": p0h, "n": n, "e_dir": e_dir, "r_park": r_park, "T_asc": T_asc, "gamma_end": gamma_end, "base": base, "omega": omega,
                "inclinationDeg": round(math.degrees(math.acos(max(-1.0, min(1.0, n[2])))), 2)}

    def parking_state(self, g: dict, t_sec: float):
        """Position/velocity on the circular parking orbit at t seconds after launch (t ≥ ascent end)."""
        pos = _mul(_rot(g["base"], g["n"], g["omega"] * (t_sec - g["T_asc"])), g["r_park"])
        vel = _mul(_unit(_cross(g["n"], _unit(pos))), math.sqrt(MU_E / g["r_park"]))
        return pos, vel

    def earth_phase(self, g: dict, t_burn: datetime, parking_alt: float, burn_label: str):
        """Ascent + parking coast segments up to the injection/TLI burn; returns (pos, vel, plane normal)."""
        sp = self.spec; site = sp["launchSite"]
        self.stats["launchPlaneInclinationDeg"] = g["inclinationDeg"]
        T_asc = g["T_asc"]; p0 = g["p0"]; p0h = g["p0h"]; e_dir = g["e_dir"]; r_park = g["r_park"]; gamma_end = g["gamma_end"]
        samples = []
        for i in range(0, 61):
            f = i / 60.0
            r = _norm(p0) + (r_park - _norm(p0)) * (f * f * (3 - 2 * f))
            gam = gamma_end * f ** 1.6
            pos = _mul(_add(_mul(p0h, math.cos(gam)), _mul(e_dir, math.sin(gam))), r)
            samples.append((T_asc * f, *pos))
        self.seg("ascent", "ascent", f"Launch & ascent — {site['name']}", "earth-inertial", samples,
                 f"{sp.get('vehicle', 'launch vehicle')} from {site['name']} ({site['latitude']:.3f}°, {site['longitude']:.3f}°); ~{T_asc/60:.0f} min analytic ascent to a {parking_alt:.0f} km parking orbit (schematic arc, real pad and launch time).",
                 parkingAltitudeKm=parking_alt, inclinationDeg=g["inclinationDeg"])
        t0 = T_asc; t1 = max(self.t(t_burn), t0 + 60.0)
        steps = max(2, int((t1 - t0) / 60.0))
        samples = [(t0 + (t1 - t0) * i / steps, *self.parking_state(g, t0 + (t1 - t0) * i / steps)[0]) for i in range(steps + 1)]
        pos, vel = self.parking_state(g, t1)
        self.seg("parking", "parking", "Parking orbit coast", "earth-inertial", samples,
                 f"Circular {parking_alt:.0f} km parking orbit, inclination {g['inclinationDeg']:.1f}° (plane through the pad at launch and the Moon at arrival — the launch-window geometry). Coast {((t1-t0)/60):.0f} min to the {burn_label}.",
                 periodMin=round(TWO_PI / g["omega"] / 60, 1))
        return pos, vel, g["n"]

    def best_burn_time(self, g: dict, target, t_loi: datetime, candidates_s: list[float], v_at_burn=None,
                       depart_time: datetime | None = None) -> tuple[float, float]:
        """Among candidate burn times (s after launch) pick the one whose Lambert departure toward `target` at t_loi costs
        the least Δv relative to the pre-burn velocity (circular parking velocity, or `v_at_burn(pos, vel)` if given).
        `depart_time` overrides the departure epoch (phasing profiles inject at tc but leave from the same perigee point
        at TLI). Departure arcs whose perigee would dip below 120 km are rejected."""
        best = None
        for tc in candidates_s:
            pos, vel = self.parking_state(g, tc)
            if v_at_burn is not None:
                vel = v_at_burn(pos, vel)
            tof = (t_loi - (depart_time or self.at(tc))).total_seconds()
            if tof < 3600:
                continue
            try:
                v1, _ = lambert(pos, target, tof, MU_E, g["n"])
            except ValueError:
                continue
            if _periapsis(pos, v1, MU_E) < R_E + 120.0:
                continue
            dv = _norm(_sub(v1, vel))
            if best is None or dv < best[1]:
                best = (tc, dv)
        if best is None:
            raise ValueError("no feasible injection geometry")
        return best

    def phasing_loops(self, r_inj, v_dir, n, t_inj: datetime, t_tli: datetime, phasing: dict):
        """Injection ellipse + apogee-raising burns at perigee; the last loop is stretched so that a perigee passage
        coincides with TLI. Returns nothing (segments appended); the TLI position is r_inj (perigee)."""
        rp = _norm(r_inj)
        burns = sorted(phasing.get("burns", []), key=lambda b: b["utc"])
        apogees = [float(phasing.get("injectionApogeeKm", 70000.0))] + [float(b["apogeeKm"]) for b in burns]
        burn_times = [self.t(_parse(b["utc"])) for b in burns]
        t = self.t(t_inj); t_end = self.t(t_tli)
        samples = []
        loop_stats = []
        k = 0
        rp_hat = _unit(r_inj); vh = _unit(v_dir)
        while t < t_end - 1:
            ra = R_E + apogees[min(k, len(apogees) - 1)]
            a = 0.5 * (rp + ra); P = TWO_PI * math.sqrt(a ** 3 / MU_E)
            next_burn = burn_times[k] if k < len(burn_times) else None
            last = next_burn is None
            if last:
                # stretch/shrink the final apogee so an integer number of loops ends exactly at TLI
                remaining = t_end - t
                nloops = max(1, round(remaining / P))
                P = remaining / nloops
                a = (MU_E * (P / TWO_PI) ** 2) ** (1.0 / 3.0); ra = 2 * a - rp
                loops_here = nloops
            else:
                loops_here = max(1, round((next_burn - t) / P))
            e = (ra - rp) / (ra + rp)
            for _loop in range(loops_here):
                steps = max(24, int(P / 1200.0))
                for i in range(0, steps + 1 if _loop == loops_here - 1 else steps):
                    M = TWO_PI * i / steps
                    E = _kepler_E(M, e)
                    nu = 2.0 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
                    r = a * (1 - e * math.cos(E))
                    pos = _mul(_add(_mul(rp_hat, math.cos(nu)), _mul(vh, math.sin(nu))), r)
                    samples.append((t + P * i / steps, *pos))
                t += P
            loop_stats.append({"apogeeKm": round(ra - R_E), "perigeeKm": round(rp - R_E), "periodH": round(P / 3600, 1), "loops": loops_here})
            if not last:
                self.event(f"burn-{k+1}", "burn", self.at(t), burns[k].get("title", f"Apogee-raising burn {k+1} → {apogees[k+1]:,.0f} km"), burns[k].get("source", "published date; apogee modeled"))
            k += 1
            last_a = a
        v_inj = math.sqrt(MU_E * (2 / rp - 1 / (0.5 * (rp + R_E + apogees[0]))))
        self.stats["injectionDeltaVMps"] = round((v_inj - math.sqrt(MU_E / rp)) * 1000, 1)
        self.seg("phasing", "phasing", "Earth-orbit phasing loops", "earth-inertial", samples,
                 "Highly elliptical Earth orbits with apogee-raising burns at perigee (burn dates published by the provider; apogee values are modeled). The final loop is stretched so the last perigee passage coincides with the TLI time.",
                 loops=loop_stats, injectionDeltaVMps=self.stats["injectionDeltaVMps"])
        return _mul(vh, math.sqrt(MU_E * (2 / rp - 1 / last_a)))

    # -- Moon phase -------------------------------------------------------------------------------------------------
    def lunar_geometry(self, d_hat, v_inf: float, t_loi: datetime, site: dict | None, orbit_alt: float, t_land: datetime | None,
                       t_doi_pub: datetime | None, t_pdi_pub: datetime | None, desc: dict | None) -> dict:
        """Choose the capture-orbit geometry: plane through the arrival asymptote and the landing site, periapsis from the
        hyperbolic turning angle, and — among the two senses of motion, n0±1 descent-orbit revolutions and k circular
        revolutions — the combination whose circular radius is closest to the published orbit altitude while keeping
        DOI close to its published time."""
        rp_target = R_M + orbit_alt
        pole = moon_pole_icrf(t_loi)
        t_loi_s = self.t(t_loi)
        if site is None or t_land is None or desc is None:
            n = _unit(_cross(d_hat, pole))
            half_turn = math.asin(min(1.0, 1.0 / (1.0 + rp_target * v_inf * v_inf / MU_M)))
            rp_hat = _unit(_rot(d_hat, n, half_turn - math.pi / 2))
            return {"n": n, "rp_hat": rp_hat, "a_orb": rp_target, "omega": math.sqrt(MU_M / rp_target ** 3), "site": False, "half_turn": half_turn}
        s_hat = site_icrf_dir(site["latitude"], site["longitude"], t_land)
        prof = desc["profile"]
        D_desc = prof[-1][0]; X_km = -prof[0][1] / 1000.0; h_pdi = prof[0][2] / 1000.0
        t_pdi = t_pdi_pub if t_pdi_pub is not None else t_land - timedelta(seconds=D_desc)
        t_pdi_s = self.t(t_pdi)
        a_e = 0.5 * (rp_target + R_M + h_pdi); P_e = TWO_PI * math.sqrt(a_e ** 3 / MU_M)
        n0 = max(0, round((t_pdi_s - self.t(t_doi_pub)) / P_e - 0.5)) if t_doi_pub is not None else 0
        best = None
        n_base = _unit(_cross(d_hat, s_hat))
        for sign in (1.0, -1.0):
            n = _mul(n_base, sign)
            half_turn = math.asin(min(1.0, 1.0 / (1.0 + rp_target * v_inf * v_inf / MU_M)))
            rp_hat = _unit(_rot(d_hat, n, half_turn - math.pi / 2))
            g_pdi = _unit(_rot(s_hat, n, -X_km / R_M))
            g_doi = _mul(g_pdi, -1.0)
            theta = _angle_ccw(rp_hat, g_doi, n)
            for n_rev in sorted({max(0, n0 - 1), n0, n0 + 1}):
                t_doi_try = t_pdi_s - (n_rev + 0.5) * P_e
                dt_orb = t_doi_try - t_loi_s
                if dt_orb < 600:
                    continue
                for k in range(0, 6000):
                    omega = (theta + TWO_PI * k) / dt_orb
                    a = (MU_M / omega ** 2) ** (1.0 / 3.0)
                    cost = abs(a - rp_target) + 25.0 * abs(n_rev - n0) + (10.0 if _dot(n, pole) < 0 else 0.0)
                    if best is None or cost < best["cost"]:
                        best = {"cost": cost, "n": n, "rp_hat": rp_hat, "a_orb": a, "omega": omega, "k": k, "n_rev": n_rev, "t_doi_s": t_doi_try,
                                "theta": theta, "g_pdi": g_pdi, "g_doi": g_doi, "s_hat": s_hat, "P_e": P_e, "a_e": a_e, "h_pdi": h_pdi, "X_km": X_km,
                                "D_desc": D_desc, "t_pdi_s": t_pdi_s, "half_turn": half_turn, "site": True}
                    if a < rp_target * 0.7:
                        break
        if best is None:
            raise ValueError("LOI must precede DOI by at least 10 minutes")
        return best

    def lunar_phase(self, geo: dict, v_inf: float, t_loi: datetime, site: dict | None, orbit_alt: float, t_land: datetime | None,
                    t_doi_pub: datetime | None, desc: dict):
        n = geo["n"]; rp_hat = geo["rp_hat"]; a_orb = geo["a_orb"]; omega = geo["omega"]
        pole = moon_pole_icrf(t_loi)
        v_circ = math.sqrt(MU_M / a_orb)
        v_peri_hyp = math.sqrt(v_inf * v_inf + 2 * MU_M / a_orb)
        self.stats["loiDeltaVMps"] = round((v_peri_hyp - v_circ) * 1000, 1)
        self.stats["arrivalVInfKms"] = round(v_inf, 3)
        self.stats["lunarOrbitInclinationDeg"] = round(math.degrees(math.acos(max(-1.0, min(1.0, _dot(n, pole))))), 1)
        self.stats["lunarOrbitAltitudeKm"] = round(a_orb - R_M, 1)
        t_loi_s = self.t(t_loi)

        def body(vec_icrf, sec):
            return ephem.icrf_to_body(vec_icrf, _jd(self.at(sec)))

        if not geo["site"]:
            t_end = t_loi_s + float(self.spec.get("orbitStayS", 86400.0))
            steps = max(50, min(3000, int((t_end - t_loi_s) / 180.0)))
            samples = []
            for i in range(steps + 1):
                tt = t_loi_s + (t_end - t_loi_s) * i / steps
                pos = _mul(_rot(rp_hat, n, omega * (tt - t_loi_s)), a_orb)
                samples.append((tt, *body(pos, tt)))
            self.seg("lunar-orbit", "lunar-orbit", f"Lunar orbit ({orbit_alt:.0f} km)", "moon-fixed", samples,
                     "Circular orbit after LOI; the landing site has not been published, so no descent is drawn.", altitudeKm=orbit_alt)
            self.event("loi", "orbit-insertion", t_loi, f"Lunar orbit insertion (modeled Δv {self.stats['loiDeltaVMps']:.0f} m/s)", self.spec.get("loiSource", "published"))
            return

        g_pdi = geo["g_pdi"]; s_hat = geo["s_hat"]; P_e = geo["P_e"]; a_e = geo["a_e"]; h_pdi = geo["h_pdi"]; X_km = geo["X_km"]
        D_desc = geo["D_desc"]; t_pdi_s = geo["t_pdi_s"]; t_doi_s = geo["t_doi_s"]; n_rev = geo["n_rev"]; k_rev = geo["k"]; theta = geo["theta"]
        t_land_s = self.t(t_land)
        e_e = (a_orb - (R_M + h_pdi)) / (a_orb + R_M + h_pdi)
        a_e = 0.5 * (a_orb + R_M + h_pdi)
        dt_orb = t_doi_s - t_loi_s
        steps = max(60, min(3000, int(dt_orb / 150.0)))
        samples = []
        for i in range(steps + 1):
            tt = t_loi_s + dt_orb * i / steps
            pos = _mul(_rot(rp_hat, n, omega * (tt - t_loi_s)), a_orb)
            samples.append((tt, *body(pos, tt)))
        revs = k_rev + theta / TWO_PI
        self.seg("lunar-orbit", "lunar-orbit", f"Lunar orbit (~{a_orb - R_M:.0f} km, {revs:.1f} rev)", "moon-fixed", samples,
                 f"Circular orbit after LOI (published {orbit_alt:.0f} km; modeled {a_orb - R_M:.0f} km so that the orbit reaches the descent-orbit-insertion point exactly at DOI). Plane contains the arrival asymptote and the landing site; inclination {self.stats['lunarOrbitInclinationDeg']:.1f}°.",
                 altitudeKm=round(a_orb - R_M, 1), revolutions=round(revs, 2), periodMin=round(TWO_PI / omega / 60, 1))
        self.event("loi", "orbit-insertion", t_loi, f"Lunar orbit insertion (modeled Δv {self.stats['loiDeltaVMps']:.0f} m/s)", self.spec.get("loiSource", "published"))
        # --- descent orbit: apolune at DOI point → perilune at PDI point, n + ½ revs ----------------------------------
        v_doi = math.sqrt(MU_M / a_orb) - math.sqrt(MU_M * (2 / a_orb - 1 / a_e))
        self.stats["doiDeltaVMps"] = round(v_doi * 1000, 1)
        dur = t_pdi_s - t_doi_s
        steps = max(80, int(dur / 30.0))
        samples = []
        for i in range(steps + 1):
            tt = t_doi_s + dur * i / steps
            M = math.pi + TWO_PI * (tt - t_doi_s) / P_e             # mean anomaly from apolune
            E = _kepler_E(M % TWO_PI, e_e)
            nu = 2.0 * math.atan2(math.sqrt(1 + e_e) * math.sin(E / 2), math.sqrt(1 - e_e) * math.cos(E / 2))
            r = a_e * (1 - e_e * math.cos(E))
            pos = _mul(_rot(g_pdi, n, nu), r)                        # ν measured from perilune (= PDI point)
            samples.append((tt, *body(pos, tt)))
        self.seg("descent-orbit", "descent-orbit", f"Descent orbit ({a_orb - R_M:.0f} × {h_pdi:.0f} km)", "moon-fixed", samples,
                 f"Descent-orbit insertion lowers perilune to {h_pdi:.0f} km opposite the powered-descent point; {n_rev + 0.5:.1f} revolutions to PDI (DOI modeled at {_iso(self.at(t_doi_s))}" + (f", published {_iso(t_doi_pub)}" if t_doi_pub else "") + ").",
                 periluneKm=round(h_pdi, 1), apoluneKm=round(a_orb - R_M, 1), revolutions=n_rev + 0.5, deltaVMps=self.stats["doiDeltaVMps"])
        self.event("doi", "burn", self.at(t_doi_s), f"Descent orbit insertion (Δv {self.stats['doiDeltaVMps']:.0f} m/s, modeled)", "modeled" if t_doi_pub is None else "published (time re-phased to the modeled orbit)")
        # --- powered descent along the orbit direction, ending at the site ------------------------------------------
        # The descent model works in altitude above the 1,737.4 km datum; the real surface at the site sits at the LOLA
        # elevation (e.g. −1.75 km at Reiner Gamma, +2.6 km at Malapert), so the final kilometres are blended onto the
        # terrain: touchdown is on the DEM surface, the PDI point keeps its datum altitude.
        site_elev_km = _site_elevation_km(site)
        prof = desc["profile"]
        samples = []
        for (tr, dr_m, alt_m) in prof:
            tt = t_pdi_s + tr * (t_land_s - t_pdi_s) / D_desc
            w = max(0.0, min(1.0, tr / D_desc)) ** 2
            pos = _mul(_rot(s_hat, n, dr_m / 1000.0 / R_M), R_M + alt_m / 1000.0 + site_elev_km * w)
            samples.append((tt, *body(pos, tt)))
        la, lo = math.radians(site["latitude"]), math.radians(site["longitude"])
        r_td = R_M + site_elev_km
        samples[-1] = (t_land_s, r_td * math.cos(la) * math.cos(lo), r_td * math.cos(la) * math.sin(lo), r_td * math.sin(la))
        self.stats["siteElevationKm"] = round(site_elev_km, 3)
        self.seg("descent", "descent", "Powered descent & landing", "moon-fixed", samples,
                 desc["note"], durationMin=round(D_desc / 60, 1), downrangeKm=round(X_km, 1), pdiAltitudeKm=round(h_pdi, 1), deltaVMps=desc.get("deltaVMps"))
        self.event("pdi", "burn", self.at(t_pdi_s), f"Powered descent initiation ({D_desc/60:.0f} min, {X_km:.0f} km downrange)", "published" if self.spec.get("pdiUtc") else "modeled (landing − descent duration)")
        self.event("landing", "landing", t_land, f"Touchdown — {site.get('name', 'landing site')} ({site['latitude']:.3f}°, {site['longitude']:.3f}°)", self.spec.get("landingSource", "published"))

    # -- orchestration ---------------------------------------------------------------------------------------------
    def build(self) -> dict:
        sp = self.spec
        profile = sp.get("profile", "direct")
        site = sp.get("launchSite")
        if not site or "latitude" not in site:
            raise ValueError("launchSite with latitude/longitude is required")
        parking_alt = float(sp.get("parkingAltKm", 185.0))
        t_land = _parse(sp["landingUtc"]) if sp.get("landingUtc") else None
        lsite = sp.get("landingSite")
        if lsite and (lsite.get("latitude") is None or lsite.get("longitude") is None):
            lsite = None
        self.event("launch", "launch", self.launch, f"Launch — {site['name']}" + (f" · {sp['vehicle']}" if sp.get("vehicle") else ""), "published" if sp.get("fidelity") == "reconstructed" else sp.get("launchSource", "planned"))

        if profile == "earth-return":
            er = sp["earthReturn"]
            t_tli = _parse(sp["tliUtc"]) if sp.get("tliUtc") else self.launch + timedelta(minutes=45)
            t_re = _parse(er["reentryUtc"])
            # plane through the pad and an arbitrary prograde direction: use the Moon at apogee time as the target so the
            # loop points toward the Moon's orbit (Peregrine was on a lunar-distance ellipse)
            t_apo = t_tli + (t_re - t_tli) / 2
            m_apo, _ = moon_state(t_apo)
            pos, vel, n = self.earth_phase(self.launch_plane(_unit(m_apo), parking_alt), t_tli, parking_alt, "injection burn")
            rp = _norm(pos); ra = R_E + float(er["apogeeKm"])
            P = (t_re - t_tli).total_seconds()
            a = (MU_E * (P / TWO_PI) ** 2) ** (1.0 / 3.0)
            ra_model = 2 * a - rp
            e = (ra_model - rp) / (ra_model + rp)
            rp_hat = _unit(pos); vh = _unit(vel)
            t0 = self.t(t_tli)
            steps = 720
            samples = []
            for i in range(steps + 1):
                M = TWO_PI * i / steps
                E = _kepler_E(M, e)
                nu = 2.0 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
                r = a * (1 - e * math.cos(E))
                samples.append((t0 + P * i / steps, *_mul(_add(_mul(rp_hat, math.cos(nu)), _mul(vh, math.sin(nu))), r)))
            v_p = math.sqrt(MU_E * (2 / rp - 1 / a))
            self.stats["tliDeltaVMps"] = round((v_p - math.sqrt(MU_E / rp)) * 1000, 1)
            self.stats["apogeeKm"] = round(ra_model - R_E)
            self.seg("return", "return", f"Lunar-distance loop & re-entry (apogee ≈{(ra_model - R_E)/1000:.0f},000 km)", "earth-inertial", samples,
                     er.get("note", "One Kepler loop from injection to atmospheric re-entry; period set by the published injection and re-entry times, so the apogee is a model value."),
                     apogeeKm=round(ra_model - R_E), periodDays=round(P / 86400, 2), publishedApogeeKm=er.get("apogeeKm"))
            self.event("tli", "burn", t_tli, f"Injection burn (modeled Δv {self.stats['tliDeltaVMps']:.0f} m/s)", "published")
            for ev in sp.get("extraEvents", []):
                self.event(ev["id"], ev.get("type", "note"), _parse(ev["utc"]), ev["title"], ev.get("source", "published"))
            self.event("reentry", "end", t_re, er.get("reentryTitle", "Controlled re-entry"), "published")
            return self.finish(t_re)

        # --- lunar missions -----------------------------------------------------------------------------------------
        t_loi = _parse(sp["loiUtc"]) if sp.get("loiUtc") else (t_land - timedelta(days=float(sp.get("orbitDays", 1.0))))
        t_tli = _parse(sp["tliUtc"]) if sp.get("tliUtc") else (self.launch + timedelta(minutes=float(sp.get("parkingCoastMin", 45.0))) if profile != "phasing" else t_loi - timedelta(days=float(sp.get("transitDays", 4.0))))
        orbit_alt = float(sp.get("lunarOrbitAltKm", 100.0))
        # descent profile (lander class) — needed before the Moon phase to know the PDI geometry
        desc = self.descent_profile(sp)
        r_moon_loi, _ = moon_state(t_loi)
        t_doi_pub = _parse(sp["doiUtc"]) if sp.get("doiUtc") else None
        t_pdi_pub = _parse(sp["pdiUtc"]) if sp.get("pdiUtc") else None
        # Launch-window geometry. The launch plane must contain the pad (at launch) and the *aim point* at LOI (the
        # capture-orbit periapsis, ~1,800 km from the Moon's centre — with near-180° transfers the aim point, not the
        # Moon's centre, decides the plane), and the burn must happen where the departure is tangential. Plane, burn
        # point, transfer arc and capture geometry are iterated to a consistent solution before any segment is emitted.
        # Published direct-TLI times get ±slack (the exact burn point is not published); phasing injections and
        # projected/planned journeys search the whole first parking revolution.
        published = bool(sp.get("tliUtc")) and profile != "phasing"
        slack_min = float(sp.get("burnSlackMin", 12.0 if published else 95.0))
        if profile == "phasing":
            ph = dict(sp.get("phasing", {}))
            t_inj0 = _parse(ph["injectionUtc"]) if ph.get("injectionUtc") else self.launch + timedelta(minutes=float(sp.get("parkingCoastMin", 55.0)))
            centre = self.t(t_inj0)
            apogees = [float(ph.get("injectionApogeeKm", 70000.0))] + [float(b["apogeeKm"]) for b in ph.get("burns", [])]
        else:
            centre = self.t(t_tli)
        target = r_moon_loi
        g = None; tc = None; v1 = v2 = None; geo = None; v_inf = 0.0; r_tli = None; tof = 0.0
        for _it in range(6):
            g = self.launch_plane(_unit(target), parking_alt)
            lo = max(g["T_asc"] + 60.0, centre - slack_min * 60.0)
            cands = [lo + i * 60.0 for i in range(int(2 * slack_min) + 1)]
            if profile == "phasing":
                a_last = 0.5 * (g["r_park"] + R_E + apogees[-1])
                v_peri = math.sqrt(MU_E * (2 / g["r_park"] - 1 / a_last))
                pre = lambda _p, v, vp=v_peri: _mul(_unit(v), vp)
                t_dep = t_tli
            else:
                pre = None
                t_dep = None
            tc, _dv = self.best_burn_time(g, target, t_loi, cands, v_at_burn=pre, depart_time=t_dep)
            # refine to ~1 s inside the winning minute (the Δv penalty of a 1-min offset is tens of m/s)
            a_, b_ = tc - 60.0, tc + 60.0
            for _ in range(14):
                m1 = a_ + (b_ - a_) / 3; m2 = b_ - (b_ - a_) / 3
                d1 = self.best_burn_time(g, target, t_loi, [m1], v_at_burn=pre, depart_time=t_dep)[1] if m1 > g["T_asc"] + 60 else float("inf")
                d2 = self.best_burn_time(g, target, t_loi, [m2], v_at_burn=pre, depart_time=t_dep)[1] if m2 > g["T_asc"] + 60 else float("inf")
                if d1 < d2: b_ = m2
                else: a_ = m1
            tc = 0.5 * (a_ + b_)
            r_tli, v_park = self.parking_state(g, tc)
            t_dep_eff = t_dep or self.at(tc)
            tof = (t_loi - t_dep_eff).total_seconds()
            v1, v2 = lambert(r_tli, target, tof, MU_E, g["n"])
            rmoon, vmoon = moon_state(t_loi)
            d_hat = _unit(_sub(v2, vmoon)); v_inf = _norm(_sub(v2, vmoon))
            geo = self.lunar_geometry(d_hat, v_inf, t_loi, lsite, orbit_alt, t_land, t_doi_pub, t_pdi_pub, desc if (lsite and t_land) else None)
            new_target = _add(rmoon, _mul(geo["rp_hat"], geo["a_orb"]))
            moved = _norm(_sub(new_target, target))
            target = new_target
            if moved < 0.5:
                break
        # final transfer to the converged aim point (the plane was built for a point < 0.5 km away)
        v1, v2 = lambert(r_tli, target, tof, MU_E, g["n"])
        rmoon, vmoon = moon_state(t_loi)
        d_hat = _unit(_sub(v2, vmoon)); v_inf = _norm(_sub(v2, vmoon))
        geo = self.lunar_geometry(d_hat, v_inf, t_loi, lsite, orbit_alt, t_land, t_doi_pub, t_pdi_pub, desc if (lsite and t_land) else None)
        # emit the Earth-phase segments for the chosen geometry
        tc_dt = self.at(tc)
        if profile == "phasing":
            pos, vel, n = self.earth_phase(g, tc_dt, parking_alt, "injection burn into the phasing ellipse")
            vel = self.phasing_loops(pos, vel, n, tc_dt, t_tli, ph)
            if abs(tc - centre) > 30:
                self.notes.append(f"Injection burn placed at {_iso(tc_dt)} (published/nominal {_iso(t_inj0)}): the perigee of the phasing ellipse is put where the final departure toward the Moon is tangential (apsidal drift over the phasing weeks is not modeled).")
        else:
            if abs(tc - centre) > 30:
                self.notes.append(f"TLI placed at {_iso(tc_dt)} (published/nominal {_iso(t_tli)}): the point on the parking orbit was chosen for a tangential departure toward the Moon.")
            t_tli = tc_dt
            r_tli, vel, n = self.earth_phase(g, t_tli, parking_alt, "trans-lunar injection burn")
        dv_tli = _norm(_sub(v1, vel))
        self.stats["tliDeltaVMps"] = round(dv_tli * 1000, 1)
        self.stats["transferAngleDeg"] = round(math.degrees(_angle_ccw(r_tli, target, n)), 1)
        self.stats["transferDays"] = round(tof / 86400, 2)
        t0 = self.t(t_tli)
        steps = 400
        samples = []
        for i in range(steps + 1):
            u = i / steps
            # denser near both ends (departure and arrival move fastest)
            f = 0.5 - 0.5 * math.cos(math.pi * u)
            r, _v = propagate(r_tli, v1, tof * f, MU_E)
            samples.append((t0 + tof * f, *r))
        self.seg("translunar", "translunar", f"Trans-lunar coast ({tof/86400:.1f} days)", "earth-inertial", samples,
                 f"Two-body Lambert arc from the TLI point to the modeled LOI point (Moon's position from the ephemeris at LOI). Departure Δv {dv_tli*1000:.0f} m/s, arrival v∞ {v_inf:.2f} km/s. Mid-course corrections not modeled.",
                 deltaVMps=self.stats["tliDeltaVMps"], days=self.stats["transferDays"], arrivalVInfKms=round(v_inf, 3))
        self.event("tli", "burn", t_tli, f"Trans-lunar injection (modeled Δv {dv_tli*1000:.0f} m/s)", sp.get("tliSource", "published" if sp.get("tliUtc") else "modeled"))
        if tof > 20 * 86400:
            self.notes.append(f"The {tof/86400:.0f}-day transfer is drawn as a single two-body ellipse (apogee ≈{max(_norm(r[1:]) for r in samples)/1000:,.0f},000 km). A real low-energy / weak-stability-boundary route is shaped by the Sun's gravity, which this model does not include — treat the shape as schematic.")
        for ev in sp.get("extraEvents", []):
            self.event(ev["id"], ev.get("type", "note"), _parse(ev["utc"]), ev["title"], ev.get("source", "published"))
        self.lunar_phase(geo, v_inf, t_loi, lsite, orbit_alt, t_land, t_doi_pub, desc)
        end = t_land if (lsite and t_land) else self.at(self.segments[-1]["samples"][-1][0])
        return self.finish(end)

    def descent_profile(self, sp: dict) -> dict:
        d = sp.get("descent") or {}
        if d.get("samples"):
            prof = [(s["t"], s["downrangeM"], s["altitudeM"]) for s in d["samples"]]
            return {"profile": prof, "note": d.get("note", "Integrated powered-descent profile from the mission plan (research engine)."), "deltaVMps": d.get("deltaVMps")}
        lander = dict(sp.get("lander") or {})
        if sp.get("landerPresetId") and not lander.get("thrustN"):
            from .landers import LANDERS
            preset = next((l for l in LANDERS if l["id"] == sp["landerPresetId"]), None)
            if preset:
                # mass at PDI ≈ dry + payload + ~75 % of the propellant (LOI/DOI spent) — a shape parameter for the descent model only
                lander = {"name": preset["name"], "thrustN": preset["thrustN"], "ispS": preset["ispS"], "minThrottle": preset.get("minThrottle", 0.2),
                          "massAtPdiKg": preset["dryMassKg"] + preset["payloadKg"] + 0.75 * preset["propellantKg"], **lander}
        alt0 = float(d.get("pdiAltKm", 15.0)) * 1000.0
        if lander.get("thrustN") and lander.get("ispS") and lander.get("massAtPdiKg"):
            sim = descent_mod.simulate(float(lander["massAtPdiKg"]), float(lander["thrustN"]), float(lander["ispS"]), float(lander.get("minThrottle", 0.2)), alt0_m=alt0, apo_alt_m=float(sp.get("lunarOrbitAltKm", 100.0)) * 1000.0, throttle_target=0.95)
            prof = [(s["t"], s["downrangeM"], s["altitudeM"]) for s in sim["samples"]]
            note = f"Powered descent integrated for the lander class ({lander.get('name', 'lander')}: {lander['thrustN']/1000:.1f} kN, Isp {lander['ispS']:.0f} s, {lander['massAtPdiKg']:.0f} kg at PDI): {sim['durationS']/60:.1f} min, Δv {sim['deltaVMps']:.0f} m/s. Model, not telemetry."
            dur_pub = d.get("durationS")
            if dur_pub:
                note += f" Published duration ≈{dur_pub/60:.0f} min."
            return {"profile": prof, "note": note, "deltaVMps": sim["deltaVMps"]}
        D = float(d.get("durationS", 660.0)); X = float(d.get("downrangeKm", 400.0)) * 1000.0
        prof = []
        for i in range(0, 121):
            s = i / 120.0
            prof.append((D * s, -X * (1 - s) ** 1.7, alt0 * (1 - s) ** 2))
        return {"profile": prof, "note": f"Schematic powered descent ({D/60:.0f} min, {X/1000:.0f} km downrange) — no lander parameters supplied.", "deltaVMps": None}

    def finish(self, end: datetime) -> dict:
        sp = self.spec
        # Moon track for the whole window (geocentric ICRF), 1 sample / 2 h
        total = (end - self.launch).total_seconds()
        n = max(12, int(total / 7200))
        track = []
        for i in range(n + 1):
            tt = total * i / n
            r, _ = moon_state(self.at(tt))
            track.append([round(tt), round(r[0], 1), round(r[1], 1), round(r[2], 1)])
        self.events.sort(key=lambda e: e["tSec"])
        # honesty labels: only flown missions have *published* event times; projected/planned anchors are model inputs
        fid = sp.get("fidelity", "reconstructed")
        if fid != "reconstructed":
            repl = "projected (illustrative date)" if fid == "projected" else "planned (model input)"
            for e in self.events:
                if e["source"].startswith("published"):
                    e["source"] = repl + e["source"][len("published"):]
                elif e["source"] == "planned":
                    e["source"] = repl
        return {
            "kind": "journey",
            "missionId": sp.get("id"),
            "fidelity": sp.get("fidelity", "reconstructed"),
            "profile": sp.get("profile", "direct"),
            "frame": "earth-inertial segments: geocentric ICRF/J2000 km; moon-fixed segments: Moon body-fixed IAU km; tSec since launch",
            "launchUtc": _iso(self.launch), "endUtc": _iso(end), "totalDays": round(total / 86400, 2),
            "launchSite": sp["launchSite"], "landingSite": sp.get("landingSite"), "vehicle": sp.get("vehicle"),
            "segments": self.segments, "events": self.events, "moonTrack": track,
            "stats": self.stats,
            "notes": [
                {"reconstructed": "Route reconstructed from published event times and sites with two-body orbital mechanics — the shape between the anchors is a model, not flight telemetry.",
                 "projected": "Projected route: the provider's previous flight profile applied to the announced window; dates are illustrative until the launch is scheduled.",
                 "planned": "Route computed for the user's plan by the research engine — a model of what such a mission would fly, not a real mission."}[sp.get("fidelity", "reconstructed")],
                *sp.get("notes", []), *self.notes],
            "sources": sp.get("sourceIds", []),
        }


def _site_elevation_km(site: dict) -> float:
    """Surface elevation at the landing site (km above the datum): LOLA DEM, else the published value, else 0."""
    try:
        from . import dem
        return float(dem.elevation_at(float(site["latitude"]), float(site["longitude"]))) / 1000.0
    except Exception:
        pub = site.get("elevationM") or site.get("publishedElevationM")
        return float(pub) / 1000.0 if pub is not None else 0.0


def build(spec: dict) -> dict:
    return _Builder(spec).build()


def spec_from_plan(plan: dict, launch_site: dict) -> dict:
    """Journey spec for a research-engine plan result (mission.plan output)."""
    cal = plan["ephemeris"]["calendar"]
    phases = {p["id"]: p for p in plan["timeline"]["phases"]}
    launch = ephem.parse_utc(cal["launchUtc"] if len(cal["launchUtc"]) > 17 else cal["launchUtc"].replace("Z", ":00Z"))
    landing = ephem.parse_utc(cal["landingUtc"] if len(cal["landingUtc"]) > 17 else cal["landingUtc"].replace("Z", ":00Z"))
    tr = plan["input"]["transfer"]
    t_tli = launch + timedelta(seconds=phases["separation"]["endS"])
    t_loi = launch + timedelta(seconds=phases["transfer"]["endS"])
    desc = plan["descent"]
    coast = desc["initial"]["coastFromApoluneS"]
    t_pdi = landing - timedelta(seconds=desc["durationS"])
    profile = "phasing" if tr["id"] == "phasing" else "direct"
    spec = {
        "id": "plan", "fidelity": "planned", "profile": profile,
        "launchSite": launch_site, "vehicle": plan["input"]["launchVehicle"]["name"],
        "launchUtc": _iso(launch), "tliUtc": _iso(t_tli), "loiUtc": _iso(t_loi), "pdiUtc": _iso(t_pdi), "doiUtc": _iso(t_pdi - timedelta(seconds=coast)), "landingUtc": _iso(landing),
        "lunarOrbitAltKm": 100.0,
        "landingSite": {"name": plan["summaryCard"]["landingSite"], "latitude": plan["input"]["latitude"], "longitude": plan["input"]["longitude"]},
        "descent": {"samples": desc["samples"], "deltaVMps": desc["deltaVMps"], "note": f"Powered descent integrated for {plan['input']['lander']['name']} ({desc['durationS']/60:.1f} min, Δv {desc['deltaVMps']:.0f} m/s) — research-engine model."},
        "notes": [f"Transfer profile: {tr['name']}. Launch date from the plan calendar ({cal['launchUtc']}) chosen so that landing happens at local sunrise on the requested date."],
        "sourceIds": ["src-research-engine"],
    }
    if profile == "phasing":
        # four raising burns spread over the cruise, last transit 4 days
        transit = 4.0
        t_inj = launch + timedelta(minutes=60)
        t_tli = t_loi - timedelta(days=transit)
        span = (t_tli - t_inj).total_seconds()
        burns = [{"utc": _iso(t_inj + timedelta(seconds=span * f)), "apogeeKm": ap, "title": f"Apogee-raising burn → {ap:,} km", "source": "planned"} for f, ap in ((0.3, 120000), (0.6, 220000))]
        spec.update({"tliUtc": _iso(t_tli), "phasing": {"injectionUtc": _iso(t_inj), "injectionApogeeKm": 70000, "burns": burns}, "transitDays": transit})
    return spec
