"""Physics-based powered-descent simulation (2-D, point mass, central gravity, closed-loop E-guidance).

Start: perilune of a 100 × 15 km descent orbit (Apollo/CLPS-like), horizontal at orbital speed, ~v0·tgo/2 uprange.
Guidance: linear-acceleration (E-guidance) law re-solved every step for the remaining time-to-go, with effective
gravity μ/r² − vx²/r; the thrust command is clamped to [minThrottle·Tmax, Tmax]. Output is a SIMULATION driven by
the user's lander parameters — it is not a flight trajectory of any real mission."""
from __future__ import annotations
import math

MU = 4.9028e12          # m³/s²  lunar GM
R = 1_737_400.0         # m
G0 = 9.80665


def orbit_speed(rp: float, ra: float) -> float:
    a = 0.5 * (rp + ra)
    return math.sqrt(MU * (2.0 / rp - 1.0 / a))


def simulate(m0: float, thrust_n: float, isp_s: float, min_throttle: float = 0.1, alt0_m: float = 15_000.0,
             apo_alt_m: float = 100_000.0, throttle_target: float = 0.9, dt: float = 0.5, sample_every: float = 4.0) -> dict:
    ve = isp_s * G0
    r0 = R + alt0_m
    v0 = orbit_speed(r0, R + apo_alt_m)
    tgo0 = m0 * v0 / (throttle_target * thrust_n)          # constant-deceleration estimate
    tgo0 = min(max(tgo0, 240.0), 1800.0)
    best = None
    for _attempt in range(12):
        res = _run(m0, thrust_n, ve, min_throttle, r0, v0, tgo0, dt, sample_every)
        best = res
        if res["peakThrottle"] <= 1.0 and res["touchdownSpeedMps"] < 3.0:
            break
        tgo0 *= 1.06                                       # not enough thrust authority → stretch the profile
    best["initial"] = {"altitudeM": alt0_m, "speedMps": round(v0, 1), "descentOrbitKm": [round(alt0_m / 1000), round(apo_alt_m / 1000)],
                       "coastFromApoluneS": round(math.pi * math.sqrt(((r0 + R + apo_alt_m) / 2) ** 3 / MU))}
    return best


def _run(m0, thrust_n, ve, min_throttle, r0, v0, tgo, dt, sample_every) -> dict:
    # inertial 2-D frame: target on the surface at angle 0 → (R, 0); spacecraft starts uprange at negative angle
    theta0 = -(v0 * tgo / 2.0) / R
    rx, ry = r0 * math.cos(theta0), r0 * math.sin(theta0)
    vx_i, vy_i = -v0 * math.sin(theta0), v0 * math.cos(theta0)   # prograde (increasing angle)
    m = m0; t = 0.0; dv = 0.0; peak = 0.0; below_min = 0.0
    samples = []; next_sample = 0.0
    vT = (0.0, -1.0)
    touchdown_speed = None
    while t < tgo + 120.0:
        rmag = math.hypot(rx, ry); ur = (rx / rmag, ry / rmag); ut = (-ur[1], ur[0])
        theta = math.atan2(ry, rx)
        x = R * theta; z = rmag - R
        vx = vx_i * ut[0] + vy_i * ut[1]; vz = vx_i * ur[0] + vy_i * ur[1]
        if z <= 0.0:
            touchdown_speed = math.hypot(vx, vz); break
        rem = tgo - t
        g_eff_z = -MU / rmag ** 2 + vx * vx / rmag
        terminal = rem < 8.0 or z < 30.0
        if terminal:
            # terminal descent: null horizontal speed, hold ~1 m/s sink rate (E-guidance is singular as tgo → 0)
            atx = -0.5 * vx
            atz = 0.5 * (vT[1] - vz) - g_eff_z
        else:
            c1x = 12.0 * (x + (vx + vT[0]) * rem / 2.0) / rem ** 3
            c1z = 12.0 * (z + (vz + vT[1]) * rem / 2.0) / rem ** 3
            c0x = (vT[0] - vx) / rem - c1x * rem / 2.0
            c0z = (vT[1] - vz) / rem - c1z * rem / 2.0
            atx = c0x; atz = c0z - g_eff_z
        amag = math.hypot(atx, atz)
        thr = amag * m / thrust_n
        if thr < min_throttle:
            below_min += dt
        thr_c = min(max(thr, min_throttle), 1.0)
        if not terminal:
            peak = max(peak, thr)
        if amag > 1e-9:
            scale = thr_c * thrust_n / m / amag
            atx *= scale; atz *= scale
        ax = atx * ut[0] + atz * ur[0] - MU / rmag ** 2 * ur[0]
        ay = atx * ut[1] + atz * ur[1] - MU / rmag ** 2 * ur[1]
        if t >= next_sample:
            samples.append({"t": round(t, 1), "downrangeM": round(x, 1), "altitudeM": round(z, 1), "vxMps": round(vx, 2), "vzMps": round(vz, 2),
                            "speedMps": round(math.hypot(vx, vz), 2), "massKg": round(m, 1), "throttle": round(thr_c, 3)})
            next_sample += sample_every
        vx_i += ax * dt; vy_i += ay * dt
        rx += vx_i * dt; ry += vy_i * dt
        used = thr_c * thrust_n / ve * dt
        m -= used; dv += thr_c * thrust_n / m * dt
        t += dt
    if touchdown_speed is None:
        touchdown_speed = math.hypot(vx, vz)
    x_end = R * math.atan2(ry, rx)
    for s in samples:
        s["downrangeM"] = round(s["downrangeM"] - x_end, 1)
    samples.append({"t": round(t, 1), "downrangeM": 0.0, "altitudeM": 0.0, "vxMps": 0.0, "vzMps": 0.0, "speedMps": round(touchdown_speed, 2), "massKg": round(m, 1), "throttle": 0.0})
    pdi_km = round(samples[0]["downrangeM"] / 1000.0, 1) if samples else round(-(v0 * tgo / 2.0) / 1000.0, 1)
    return {"tgoS": round(tgo), "durationS": round(t, 1), "deltaVMps": round(dv, 1), "propellantKg": round(m0 - m, 1), "finalMassKg": round(m, 1),
            "peakThrottle": round(peak, 3), "secondsBelowMinThrottle": round(below_min, 1), "touchdownSpeedMps": round(touchdown_speed, 2),
            "downrangeAtPdiKm": pdi_km, "samples": samples}
