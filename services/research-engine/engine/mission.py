"""Mission calculation: phases, Δv / propellant budgets, payload capacity, comms, electrical power budget,
Golden Mission Windows, and structured engineering constraints — from the user's plan parameters.
Everything here is a model (documented formulas); results are labelled 'simulation' in the API."""
from __future__ import annotations
import math
from datetime import datetime, timedelta, timezone
from . import dem, dem_polar, descent, ephem, model, power, resilience
from .landers import LANDERS, LAUNCH_VEHICLES, TRANSFERS

G0 = 9.80665
HOVER_RESERVE_MPS = 50.0     # hazard-avoidance divert / hover reserve (informational)
ORBIT_ALT_KM = 100.0


def _by_id(items, id_, default):
    return next((i for i in items if i["id"] == id_), default)


def plan(inp: dict) -> dict:
    lat, lon = dem.validate_coords(float(inp["latitude"]), float(inp["longitude"]))
    preset = _by_id(LANDERS, inp.get("landerId", "generic-clps-100kg"), LANDERS[0])
    dry = max(float(inp.get("dryMassKg", preset["dryMassKg"])), 50.0)
    prop = max(float(inp.get("propellantKg", preset["propellantKg"])), 10.0)
    payload = max(float(inp.get("payloadKg", preset["payloadKg"])), 0.0)
    thrust = max(float(inp.get("thrustN", preset["thrustN"])), 100.0)
    isp = max(float(inp.get("ispS", preset["ispS"])), 100.0)
    min_thr = min(max(float(inp.get("minThrottle", preset["minThrottle"])), 0.05), 0.95)
    lv = _by_id(LAUNCH_VEHICLES, inp.get("launchVehicleId", "falcon-9"), LAUNCH_VEHICLES[0])
    tr = _by_id(TRANSFERS, inp.get("transferId", "direct"), TRANSFERS[0])
    orbit_days = min(max(float(inp.get("orbitDays", 1.0)), 0.2), 60.0)
    surface_days = min(max(float(inp.get("surfaceDays", 14.0)), 0.5), 60.0)
    data_gb = max(float(inp.get("dataVolumeGb", 20.0)), 0.1)
    mbps = max(float(inp.get("downlinkMbps", 4.0)), 0.1)
    year = int(inp.get("year", 2027))
    ve = isp * G0

    terrain = dem.terrain_features(lat, lon)                       # finest available (LOLA GDR 240 m at the poles)
    terrain_regional = dem.terrain_features_regional(lat, lon)     # training scale for the outcome model
    grid = dem.analysis_grid(lat, lon, half_km=(float(inp["gridHalfKm"]) if "gridHalfKm" in inp else None), n=int(inp.get("gridN", 32)))
    fine = dem_polar.finest_for(lat)
    horizon, hfn = dem.best_horizon(lat, lon)
    x = model.feature_vector(lat, lon, terrain_regional, hazard=bool(inp.get("hazardAvoidance", True)), crewed=bool(inp.get("crewed", False)),
                             commercial=bool(inp.get("commercial", True)), year=year)
    pred = model.predict(x); near = model.neighbours(x, k=5)

    # --- Δv chain -------------------------------------------------------------------------------------------
    r_orb = (1737.4 + ORBIT_ALT_KM) * 1000.0
    v_circ = math.sqrt(descent.MU / r_orb)
    v_inf = tr["vInfKms"] * 1000.0
    loi = 0.0 if tr.get("carrierDoesLoi") else math.sqrt(v_inf ** 2 + 2 * descent.MU / r_orb) - v_circ
    doi = v_circ - math.sqrt(descent.MU * (2 / r_orb - 1 / ((r_orb + 1737.4e3 + 15_000) / 2)))
    m_tli = dry + payload + prop
    m1 = m_tli * math.exp(-tr["extraDeltaVMps"] / ve)
    m2 = m1 * math.exp(-loi / ve)
    m3 = m2 * math.exp(-doi / ve)
    sim = descent.simulate(m3, thrust, isp, min_thr, throttle_target=0.95)
    m_td = sim["finalMassKg"]
    used = m_tli - m_td
    dv_total = tr["extraDeltaVMps"] + loi + doi + sim["deltaVMps"] + HOVER_RESERVE_MPS
    reserve_kg = m_td * (1 - math.exp(-HOVER_RESERVE_MPS / ve))
    margin = prop - used - reserve_kg
    max_payload = prop / (math.exp(dv_total / ve) - 1.0) - dry

    # --- timeline ----------------------------------------------------------------------------------------------
    H = 3600.0; D = 86400.0
    coast = sim["initial"]["coastFromApoluneS"]
    t = 0.0; phases = []
    def add(pid, name, dur, **kw):
        nonlocal t
        phases.append({"id": pid, "name": name, "startS": round(t), "endS": round(t + dur), "durationS": round(dur), **kw}); t += dur
    add("launch", "Launch", 0.2 * H, note=f"{lv['name']} ascent to parking orbit (schematic).")
    add("separation", "Separation & TLI", 1.0 * H, note="Trans-lunar injection by the upper stage, spacecraft separation and checkout (schematic).")
    add("transfer", "Transfer to Moon", tr["cruiseDays"] * D, deltaVMps=tr["extraDeltaVMps"], note=tr["note"])
    add("loi", "Lunar orbit insertion & orbit", orbit_days * D, deltaVMps=round(loi, 1), note=(f"LOI by the carrier stage; lander separates in {ORBIT_ALT_KM:.0f} km orbit; " if tr.get("carrierDoesLoi") else f"LOI into {ORBIT_ALT_KM:.0f} km circular orbit (v∞ {tr['vInfKms']} km/s); ") + f"DOI burn {doi:.1f} m/s at the end.")
    add("landing", "Landing", coast + sim["durationS"], deltaVMps=round(sim["deltaVMps"], 1), note=f"Coast to 15 km perilune ({coast/60:.0f} min) then powered descent {sim['durationS']/60:.1f} min (simulated).")
    add("surface", "Surface operations", surface_days * D, note="One lunar day ≈ 14.8 Earth days for solar-powered landers (night survival needs heaters/RHUs).")
    downlink_h = data_gb * 8000.0 / (mbps * 3600.0)
    psi = math.degrees(math.acos(max(-1.0, min(1.0, math.cos(math.radians(lat)) * math.cos(math.radians(lon))))))
    earth_elev = 90.0 - psi                                          # mean geometry (no libration)

    # --- calendar from the ephemeris model: land shortly after local terrain-masked sunrise ---------------------
    pre_landing_s = next(p for p in phases if p["id"] == "landing")["endS"]   # launch … touchdown
    peak_possible = min(90.0, 90.0 - abs(lat) + 1.54)
    target_sun = round(min(7.0, max(1.0, peak_possible - 2.0)), 2)
    now_iso = (datetime.now(timezone.utc) + timedelta(seconds=pre_landing_s)).strftime("%Y-%m-%dT%H:%M:%SZ")
    requested = inp.get("landingDate")
    from_iso = (requested if "T" in str(requested) else f"{requested}T00:00:00Z") if requested else now_iso
    try:
        windows = ephem.landing_windows(lat, lon, from_iso, count=5, target_elev_deg=target_sun, horizon_fn=hfn)
    except Exception:
        windows = []
    if requested and "T" in str(requested):
        landing_dt = ephem.parse_utc(str(requested))
    elif windows:
        landing_dt = ephem.parse_utc(windows[0]["utc"])
    else:
        landing_dt = ephem.parse_utc(from_iso)
    launch_dt = landing_dt - timedelta(seconds=pre_landing_s)
    fmt = lambda dt: dt.strftime("%Y-%m-%dT%H:%MZ")
    for p in phases:
        p["startUtc"] = fmt(launch_dt + timedelta(seconds=p["startS"])); p["endUtc"] = fmt(launch_dt + timedelta(seconds=p["endS"]))
    surf_phase = next(p for p in phases if p["id"] == "surface")
    surf_start = launch_dt + timedelta(seconds=surf_phase["startS"]); surf_end = launch_dt + timedelta(seconds=surf_phase["endS"])
    at_landing = ephem.site_geometry(fmt(landing_dt).replace("Z", ":00Z"), lat, lon)
    sun_mask_td = float(hfn(at_landing["sunAzimuthDeg"])) if hfn else 0.0
    earth_mask_td = float(hfn(at_landing["earthAzimuthDeg"])) if hfn else 0.0
    at_landing["sunVisible"] = at_landing["sunElevationDeg"] > sun_mask_td
    at_landing["earthVisible"] = at_landing["earthElevationDeg"] > earth_mask_td
    at_landing["sunClearanceDeg"] = round(at_landing["sunElevationDeg"] - sun_mask_td, 2)
    at_landing["earthClearanceDeg"] = round(at_landing["earthElevationDeg"] - earth_mask_td, 2)
    total_s_est = surf_phase["endS"] + downlink_h * H
    step_h = max(3.0, total_s_est / 3600.0 / 160.0)
    samples = ephem.profile(lat, lon, fmt(launch_dt).replace("Z", ":00Z"), total_s_est / D + step_h / 24.0, step_hours=step_h)
    for smp in samples:
        smp["t"] = round((ephem.parse_utc(smp["utc"]) - launch_dt).total_seconds())
        smp["sunVisible"] = smp["sunElevationDeg"] > (hfn(smp["sunAzimuthDeg"]) if hfn else 0.0)
        smp["earthVisible"] = smp["earthElevationDeg"] > (hfn(smp["earthAzimuthDeg"]) if hfn else 0.0)
        for k in ("jd",):
            smp.pop(k, None)
    surf = [smp for smp in samples if surf_start <= ephem.parse_utc(smp["utc"]) <= surf_end] or samples[-1:]
    sun_frac = sum(1 for smp in surf if smp["sunVisible"]) / len(surf)
    earth_frac = sum(1 for smp in surf if smp["earthVisible"]) / len(surf)
    earth_min = min(smp["earthElevationDeg"] for smp in surf); earth_max = max(smp["earthElevationDeg"] for smp in surf)
    relay = earth_max < 5.0 or earth_frac < 0.5
    add("relay", "Data relay / downlink", downlink_h * H, note=(f"{data_gb:g} GB at {mbps:g} Mbit/s ≈ {downlink_h:.1f} h; "
        + (f"Earth below ~5° or hidden for most of surface ops (visible {earth_frac*100:.0f} % of the time) → relay orbiter recommended." if relay
           else f"direct-to-Earth possible (Earth elevation {earth_min:.0f}–{earth_max:.0f}° during surface ops, ephemeris model).")))
    phases[-1]["startUtc"] = fmt(launch_dt + timedelta(seconds=phases[-1]["startS"])); phases[-1]["endUtc"] = fmt(launch_dt + timedelta(seconds=phases[-1]["endS"]))
    total_days = t / D
    horizon_max = max(horizon["elevationDeg"]) if horizon else 0.0
    horizon_max_az = horizon["elevationDeg"].index(horizon_max) * horizon["azimuthStepDeg"] if horizon else None

    # --- Power Budget & Golden Mission Window (Features 3 & 6) --------------------------------------------------
    power_budget = power.compute_power_budget(
        inp,
        preset,
        samples,
        float(surf_phase["startS"]),
        float(surf_phase["endS"]),
        horizon_fn=hfn,
    )
    golden_windows = power.compute_golden_windows(
        power_budget,
        windows,
        surface_days,
        relay_enabled=bool(inp.get("useRelay", False)),
    )

    # --- Structured Engineering Constraints & Viability Score ----------------------------------------------------
    constraints = resilience.evaluate_constraints(
        propellant_margin_kg=margin,
        stack_mass_tli_kg=m_tli,
        lv_capacity_kg=float(lv["tliCapacityKg"]),
        lv_name=str(lv["name"]),
        peak_throttle=float(sim["peakThrottle"]),
        slope_deg=float(terrain["slopeDeg"]),
        baseline_m=float(terrain["baselineM"]),
        sun_elev_td_deg=float(at_landing["sunElevationDeg"]),
        sun_clearance_td_deg=float(at_landing["sunClearanceDeg"]),
        sun_visible_td=bool(at_landing["sunVisible"]),
        sunlit_fraction=sun_frac,
        sunlit_hours=float(power_budget["summary"]["sunlitHours"]),
        requested_surface_days=surface_days,
        earth_vis_fraction=earth_frac,
        earth_min_deg=earth_min,
        relay_enabled=bool(inp.get("useRelay", False)),
        power_summary=power_budget["summary"],
        power_params=power_budget["parameters"],
    )
    viability_score = resilience.compute_viability_score(
        constraints,
        sun_frac,
        earth_frac,
        float(terrain["slopeDeg"]),
        power_budget["summary"],
        margin,
    )

    flags = []
    if margin < 0:
        hint = f"reduce payload to ≤ {max_payload:.0f} kg or choose a lower-energy transfer" if max_payload > 0 else "no payload closes — add propellant, raise Isp or choose a lower-energy transfer"
        flags.append(f"Propellant short by {abs(margin):.0f} kg for this Δv chain ({hint}).")
    if m_tli > lv["tliCapacityKg"]: flags.append(f"Stack mass {m_tli:.0f} kg exceeds the approximate TLI capacity of {lv['name']} ({lv['tliCapacityKg']} kg).")
    if sim["peakThrottle"] > 1.0: flags.append("Thrust-limited descent: commanded thrust exceeded the engine maximum; profile stretched.")
    if sim["secondsBelowMinThrottle"] > 20: flags.append(f"Engine below minimum throttle for {sim['secondsBelowMinThrottle']:.0f} s near touchdown — consider a deeper-throttling engine or pulsed operation.")
    if terrain["slopeDeg"] > 8: flags.append(f"Slope {terrain['slopeDeg']}° at {terrain['baselineM']:.0f} m baseline ({terrain.get('grade', '')}) exceeds typical lander limits (≈8–12° local) — cf. IM-1 (12° slope, tipped).")
    if terrain["polar"]: flags.append("Polar site: low Sun elevation (long shadows, altimeter/vision challenges) — cf. IM-1 / IM-2.")
    if relay: flags.append("Earth low or hidden for much of surface ops — plan a relay (cf. Chang'e 4 Queqiao, ESA Lunar Pathfinder).")
    if not at_landing["sunVisible"]: flags.append(f"Sun below the {'terrain' if hfn else 'geometric'} horizon at the chosen landing time ({at_landing['sunElevationDeg']}° elevation) — shift the landing date.")
    if windows and windows[0]["sunlitHoursAfter"] < surface_days * 24: flags.append(f"Only ≈{windows[0]['sunlitHoursAfter']:.0f} h of sunlight follow the first landing window (requested {surface_days:g} d) — plan night survival or shorten surface ops.")
    if horizon_max > 5: flags.append(f"Terrain horizon rises to {horizon_max:.1f}° toward azimuth {horizon_max_az:.0f}° ({horizon.get('grade', 'LOLA DEM')}) — Sun/Earth masking modelled in the illumination profile.")
    if sun_frac < 0.6: flags.append(f"Site is sunlit only {sun_frac*100:.0f} % of the surface-ops period (ephemeris + terrain horizon) — solar power / thermal risk.")
    if not power_budget["summary"]["powerFeasible"]:
        flags.append(f"Electrical power deficit: battery drops to {power_budget['summary']['minSocPct']:.0f}% SOC (longest darkness {power_budget['summary']['maxContinuousDarknessHours']:.1f} h vs survival limit {power_budget['summary']['darknessSurvivalHours']:.1f} h).")

    azimuth = 90.0 if abs(lat) < 70 else (180.0 if lat < 0 else 0.0)
    return {
        "kind": "simulation",
        "input": {"latitude": lat, "longitude": lon, "lander": {"id": preset["id"], "name": preset["name"], "dryMassKg": dry, "propellantKg": prop, "payloadKg": payload, "thrustN": thrust, "ispS": isp, "minThrottle": min_thr},
                  "launchVehicle": lv, "transfer": tr, "orbitDays": orbit_days, "surfaceDays": surface_days, "dataVolumeGb": data_gb, "downlinkMbps": mbps, "year": year, "landingDate": requested},
        "site": {"latitude": lat, "longitude": lon, "terrain": terrain, "terrainRegional": terrain_regional, "horizon": horizon,
                 "earthElevationDeg": round(earth_elev, 1), "relayRequired": relay,
                 "comms": {"earthElevationMinDeg": round(earth_min, 1), "earthElevationMaxDeg": round(earth_max, 1), "earthVisibleFraction": round(earth_frac, 2), "sunlitFraction": round(sun_frac, 2)}},
        "ephemeris": {"model": "Meeus Ch. 25/47 + IAU 1976 precession + IAU 2009 Moon orientation (validated vs JPL Horizons DE441 to ≤0.6′ at 3 reference epochs); TT = UTC + 69.184 s; terrain horizon from LOLA DEM",
                      "validation": ephem.VALIDATION_INFO,
                      "atLanding": at_landing, "windows": golden_windows["candidateWindows"] if golden_windows.get("candidateWindows") else windows, "targetSunElevationDeg": target_sun, "samples": samples,
                      "calendar": {"launchUtc": fmt(launch_dt), "landingUtc": fmt(landing_dt), "surfaceEndUtc": fmt(surf_end), "missionEndUtc": fmt(launch_dt + timedelta(seconds=t)), "requestedLandingDate": requested}},
        "powerBudget": power_budget,
        "goldenWindows": golden_windows,
        "constraints": constraints,
        "viabilityScore": viability_score,
        "analysisGrid": grid,
        "outcomeModel": {**pred, "neighbours": near, "exploratoryNote": "Exploratory historical comparison (n=47, LOO CV 57.5%) — NOT a validated probability of mission success."},
        "budget": {"deltaV": {"transferCorrectionsMps": tr["extraDeltaVMps"], "loiMps": round(loi, 1), "doiMps": round(doi, 1), "descentMps": sim["deltaVMps"], "hoverReserveMps": HOVER_RESERVE_MPS, "totalMps": round(dv_total, 1)},
                   "mass": {"atTliKg": round(m_tli, 1), "afterLoiKg": round(m2, 1), "atPdiKg": round(m3, 1), "atTouchdownKg": round(m_td, 1), "propellantUsedKg": round(used, 1), "propellantMarginKg": round(margin, 1), "maxPayloadKg": round(max_payload, 1)},
                   "exhaustVelocityMps": round(ve, 1)},
        "descent": {k: v for k, v in sim.items()}, "approachAzimuthDeg": azimuth,
        "timeline": {"phases": phases, "totalDays": round(total_days, 2), "totalMissionTimeText": f"~{total_days:.0f} days"},
        "summaryCard": {"totalMissionTime": f"~{total_days:.0f} days", "launchVehicle": lv["name"], "payloadMass": f"{payload:g} kg (max ≈ {max_payload:.0f} kg)",
                        "landingSite": f"{abs(lat):.2f}°{'S' if lat < 0 else 'N'}, {abs(lon):.2f}°{'W' if lon < 0 else 'E'}",
                        "dataDownlink": ("via relay orbiter" if relay else "direct to Earth") + f" · {downlink_h:.1f} h"},
        "flags": flags,
        "provenance": {"sourceIds": ["src-research-engine", "src-svs-4720", "src-nssdca-nmc"] + (["src-pds-lola-gdr"] if fine else []) + ["src-meeus", "src-iau-wgccre-2009"],
                       "note": "Physics model + exploratory statistics from the historical catalogue. Not NASA mission data."},
    }
