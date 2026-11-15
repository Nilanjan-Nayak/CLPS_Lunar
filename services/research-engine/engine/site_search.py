"""Multi-Site / Multi-Date Optimizer & Pareto Frontier Engine (Features 4, 5, and 7).

Evaluates a batch of candidate lunar landing sites across candidate dates and schedule-delay sweeps:
  1. Filters candidates against hard engineering constraints (slope, sunlight, power/SOC, darkness, comms, Δv)
  2. Computes five explicit objectives:
       • Solar availability (%)          [maximize]
       • Earth visibility (%)            [maximize]
       • Terrain safety score (0–100)    [maximize] / Terrain risk (%) [minimize]
       • Darkness safety / min darkness  [minimize darkness hours]
       • Mission Resilience Index (MRI)  [maximize]
  3. Identifies non-dominated solutions (Pareto Frontier, rank 1..k) and explains the trade-off of each frontier site."""
from __future__ import annotations
import math
from datetime import datetime, timedelta, timezone
from . import dem, descent, ephem, power, resilience
from .landers import LANDERS, LAUNCH_VEHICLES, TRANSFERS

G0 = 9.80665
HOVER_RESERVE_MPS = 50.0
ORBIT_ALT_KM = 100.0

DEFAULT_CANDIDATE_SITES = [
    {"id": "mons-mouton", "name": "Mons Mouton Plateau (IM-2 / VIPER)", "region": "South Pole Plateau", "latitude": -84.79, "longitude": 29.20},
    {"id": "nobile-rim", "name": "Nobile Crater Rim (Griffin M1)", "region": "South Polar Rim", "latitude": -85.28, "longitude": 53.50},
    {"id": "malapert-massif", "name": "Malapert Massif (IM-1)", "region": "South Polar Highlands", "latitude": -80.13, "longitude": 1.44},
    {"id": "shackleton-ridge", "name": "Shackleton Connecting Ridge (Artemis III ref)", "region": "South Pole Crest", "latitude": -89.45, "longitude": -137.00},
    {"id": "leibnitz-beta", "name": "Leibnitz Beta Plateau", "region": "South Polar Plateau", "latitude": -85.40, "longitude": 31.80},
    {"id": "mare-crisium", "name": "Mare Crisium (Blue Ghost M1)", "region": "Nearside Mare Basin", "latitude": 18.56, "longitude": 61.81},
    {"id": "reiner-gamma", "name": "Reiner Gamma Swirl (IM-3)", "region": "Oceanus Procellarum", "latitude": 7.50, "longitude": -59.00},
    {"id": "gruithuisen-domes", "name": "Sinus Viscositatis / Gruithuisen", "region": "Northern Volcanic Domes", "latitude": 35.20, "longitude": -40.50},
    {"id": "lacus-mortis", "name": "Lacus Mortis Plain (Peregrine target)", "region": "Northern Mare Plain", "latitude": 44.97, "longitude": 25.24},
    {"id": "shiv-shakti", "name": "Shiv Shakti Point (ISRO Chandrayaan-3)", "region": "Southern High Latitude", "latitude": -69.37, "longitude": 32.32},
    {"id": "apollo-11", "name": "Tranquility Base (Apollo 11 Heritage)", "region": "Mare Tranquillitatis", "latitude": 0.67, "longitude": 23.47},
    {"id": "schrodinger-basin", "name": "Schrödinger Basin (Blue Ghost M2 / Far Side)", "region": "South Polar Far Side", "latitude": -75.00, "longitude": 132.40},
]

FAST_DELAYS = [0, 1, 3, 5, 7, 10, 14]


def _by_id(items, id_, default):
    return next((i for i in items if i["id"] == id_), default)


def _dominates(a: dict, b: dict) -> bool:
    """True if candidate `a` Pareto-dominates `b` across the 5 multi-objective scores."""
    if a["feasible"] and not b["feasible"]:
        return True
    if not a["feasible"] and b["feasible"]:
        return False
    keys = ("solarPct", "earthPct", "terrainSafetyPct", "darknessSafetyPct", "mriScore")
    va = [float(a["objectives"][k]) for k in keys]
    vb = [float(b["objectives"][k]) for k in keys]
    ge_all = all(x >= y - 0.15 for x, y in zip(va, vb))
    gt_one = any(x > y + 0.45 for x, y in zip(va, vb))
    return ge_all and gt_one


def optimize_sites(inp: dict) -> dict:
    """Evaluate candidate sites + landing windows, apply hard constraints, and compute the Pareto frontier."""
    preset = _by_id(LANDERS, inp.get("landerId", "generic-clps-100kg"), LANDERS[0])
    dry = float(inp.get("dryMassKg", preset["dryMassKg"]))
    prop = float(inp.get("propellantKg", preset["propellantKg"]))
    payload = float(inp.get("payloadKg", preset["payloadKg"]))
    thrust = float(inp.get("thrustN", preset["thrustN"]))
    isp = float(inp.get("ispS", preset["ispS"]))
    min_thr = float(inp.get("minThrottle", preset["minThrottle"]))
    lv = _by_id(LAUNCH_VEHICLES, inp.get("launchVehicleId", "falcon-9"), LAUNCH_VEHICLES[0])
    tr = _by_id(TRANSFERS, inp.get("transferId", "direct"), TRANSFERS[0])
    orbit_days = min(max(float(inp.get("orbitDays", 1.0)), 0.2), 60.0)
    surface_days = min(max(float(inp.get("surfaceDays", 14.0)), 0.5), 60.0)
    data_gb = float(inp.get("dataVolumeGb", 20.0))
    mbps = max(float(inp.get("downlinkMbps", 4.0)), 0.1)
    downlink_h = data_gb * 8000.0 / (mbps * 3600.0)
    ve = isp * G0

    # Propulsion chain is common across sites for a given lander/transfer
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
    reserve_kg = m_td * (1 - math.exp(-HOVER_RESERVE_MPS / ve))
    prop_margin_kg = prop - used - reserve_kg
    pre_landing_s = (0.2 + 1.0) * 3600.0 + (tr["cruiseDays"] + orbit_days) * 86400.0 + sim["initial"]["coastFromApoluneS"] + sim["durationS"]

    now_iso = (datetime.now(timezone.utc) + timedelta(seconds=pre_landing_s)).strftime("%Y-%m-%dT%H:%M:%SZ")
    requested = inp.get("landingDate")
    from_iso = (str(requested) if "T" in str(requested) else f"{requested}T00:00:00Z") if requested else now_iso

    # Build candidate list (cap at 14 sites for fast interactive response)
    custom_cands = inp.get("candidates")
    if isinstance(custom_cands, list) and len(custom_cands) > 0:
        raw_sites = []
        for idx, c in enumerate(custom_cands[:14]):
            la, lo = dem.validate_coords(float(c["latitude"]), float(c["longitude"]))
            raw_sites.append({
                "id": str(c.get("id") or f"site-{idx+1}"),
                "name": str(c.get("name") or f"Candidate {idx+1} ({la:.2f}°, {lo:.2f}°)"),
                "region": str(c.get("region") or ("Polar" if abs(la) >= 75 else "Equatorial/Mid-Lat")),
                "latitude": la,
                "longitude": lo,
            })
    else:
        raw_sites = [dict(s) for s in DEFAULT_CANDIDATE_SITES]
        if "latitude" in inp and "longitude" in inp:
            u_lat, u_lon = dem.validate_coords(float(inp["latitude"]), float(inp["longitude"]))
            if not any(abs(s["latitude"] - u_lat) < 0.35 and abs(s["longitude"] - u_lon) < 0.35 for s in raw_sites):
                raw_sites.insert(0, {
                    "id": "selected-target",
                    "name": f"Selected Target ({abs(u_lat):.2f}°{'S' if u_lat < 0 else 'N'}, {abs(u_lon):.2f}°{'W' if u_lon < 0 else 'E'})",
                    "region": "Polar Target" if abs(u_lat) >= 75 else "Selected Region",
                    "latitude": u_lat,
                    "longitude": u_lon,
                })

    evaluated = []
    for site in raw_sites:
        lat = site["latitude"]
        lon = site["longitude"]
        terrain = dem.terrain_features(lat, lon)
        horizon, hfn = dem.best_horizon(lat, lon)
        peak_possible = min(90.0, 90.0 - abs(lat) + 1.54)
        target_sun = round(min(7.0, max(1.0, peak_possible - 2.0)), 2)

        windows = ephem.landing_windows(lat, lon, from_iso, count=3, target_elev_deg=target_sun, horizon_fn=hfn)
        # Evaluate the top sunrise windows to pick the best landing date for this site
        best_base = None
        best_dt = None
        cand_dates = [ephem.parse_utc(w["utc"]) for w in windows[:2]] if windows else [ephem.parse_utc(from_iso)]
        for dt_c in cand_dates:
            ev_c = resilience.evaluate_epoch_for_plan(
                lat=lat,
                lon=lon,
                landing_dt=dt_c,
                delay_days=0.0,
                label="Optimal Window",
                surface_days=surface_days,
                pre_landing_s=pre_landing_s,
                downlink_h=downlink_h,
                inp=inp,
                preset=preset,
                terrain=terrain,
                horizon=horizon,
                hfn=hfn,
                propellant_margin_kg=prop_margin_kg,
                stack_mass_tli_kg=m_tli,
                lv_capacity_kg=float(lv["tliCapacityKg"]),
                lv_name=str(lv["name"]),
                peak_throttle=float(sim["peakThrottle"]),
            )
            if best_base is None or (ev_c["feasible"], ev_c["viabilityScore"]) > (best_base["feasible"], best_base["viabilityScore"]):
                best_base = ev_c
                best_dt = dt_c

        assert best_base is not None and best_dt is not None

        # Evaluate schedule resilience across FAST_DELAYS [0, 1, 3, 5, 7, 10, 14]
        delay_results = [best_base]
        for d in FAST_DELAYS[1:]:
            ev_d = resilience.evaluate_epoch_for_plan(
                lat=lat,
                lon=lon,
                landing_dt=best_dt + timedelta(days=d),
                delay_days=float(d),
                label=f"+{d}d",
                surface_days=surface_days,
                pre_landing_s=pre_landing_s,
                downlink_h=downlink_h,
                inp=inp,
                preset=preset,
                terrain=terrain,
                horizon=horizon,
                hfn=hfn,
                propellant_margin_kg=prop_margin_kg,
                stack_mass_tli_kg=m_tli,
                lv_capacity_kg=float(lv["tliCapacityKg"]),
                lv_name=str(lv["name"]),
                peak_throttle=float(sim["peakThrottle"]),
            )
            delay_results.append(ev_d)

        feas_count = sum(1 for r in delay_results if r["feasible"])
        mri_score = round((feas_count / len(delay_results)) * 100.0, 1)
        crit_delay = next((r["delayDays"] for r in delay_results if r["delayDays"] > 0 and not r["feasible"]), None)

        slope_deg = float(terrain["slopeDeg"])
        rough_m = float(terrain["roughnessM"])
        terrain_safety = round(max(0.0, min(100.0, 100.0 - slope_deg * 6.5 - rough_m * 0.12)), 1)
        terrain_risk = round(100.0 - terrain_safety, 1)

        solar_pct = round(best_base["sunlitFraction"] * 100.0, 1)
        earth_pct = round(best_base["earthVisibleFraction"] * 100.0, 1)
        max_dark_h = float(best_base["power"]["maxContinuousDarknessHours"])
        surv_dark_h = float(best_base["power"]["darknessSurvivalHours"])
        dark_safety = round(max(0.0, min(100.0, (1.0 - max_dark_h / max(surv_dark_h * 1.4, 1.0)) * 100.0)), 1)

        rec = resilience.build_explainable_recommendations(
            site_label=site["name"],
            baseline_scenario=best_base,
            mri_score=mri_score,
            critical_delay_days=crit_delay,
            best_recovery=None,
            terrain=terrain,
            relay_required=best_base["relayRecommended"],
            propellant_margin_kg=prop_margin_kg,
        )

        evaluated.append({
            "id": site["id"],
            "name": site["name"],
            "region": site["region"],
            "latitude": lat,
            "longitude": lon,
            "optimalLandingUtc": best_base["landingUtc"],
            "surfaceEndUtc": best_base["surfaceEndUtc"],
            "feasible": best_base["feasible"],
            "resultStatus": best_base["resultStatus"],
            "viabilityScore": best_base["viabilityScore"],
            "mriScore": mri_score,
            "criticalDelayDays": crit_delay,
            "terrain": {
                "elevationM": terrain["elevationM"],
                "slopeDeg": slope_deg,
                "roughnessM": rough_m,
                "baselineM": terrain["baselineM"],
                "resolutionM": terrain.get("resolutionM", terrain["baselineM"]),
                "grade": terrain.get("grade", "regional"),
                "polar": terrain["polar"],
            },
            "objectives": {
                "solarPct": solar_pct,
                "earthPct": earth_pct,
                "terrainSafetyPct": terrain_safety,
                "terrainRiskPct": terrain_risk,
                "darknessHours": max_dark_h,
                "darknessSafetyPct": dark_safety,
                "mriScore": mri_score,
            },
            "power": best_base["power"],
            "relayRecommended": best_base["relayRecommended"],
            "failedHardConstraints": best_base["failedHardConstraints"],
            "warnConstraints": best_base["warnConstraints"],
            "constraints": best_base["constraints"],
            "recommendations": rec,
            "delayStrip": [
                {"delayDays": r["delayDays"], "feasible": r["feasible"], "status": r["resultStatus"], "solarPct": round(r["sunlitFraction"] * 100, 0), "minSocPct": r["power"]["minSocPct"]}
                for r in delay_results
            ],
        })

    # Non-dominated Pareto sorting (Rank 1 = Pareto Frontier)
    remaining = list(range(len(evaluated)))
    rank = 1
    while remaining:
        front = []
        for i in remaining:
            dom_by = [evaluated[j]["name"] for j in remaining if i != j and _dominates(evaluated[j], evaluated[i])]
            if not dom_by:
                front.append(i)
        if not front:
            front = list(remaining)
        for i in front:
            evaluated[i]["paretoRank"] = rank
            evaluated[i]["paretoOptimal"] = (rank == 1 and evaluated[i]["feasible"])
            evaluated[i]["dominatedBy"] = [
                evaluated[j]["name"] for j in range(len(evaluated)) if i != j and _dominates(evaluated[j], evaluated[i])
            ]
        remaining = [i for i in remaining if i not in front]
        rank += 1

    # Add deterministic trade-off explanations for each candidate
    max_solar = max((c["objectives"]["solarPct"] for c in evaluated), default=100.0)
    max_earth = max((c["objectives"]["earthPct"] for c in evaluated), default=100.0)
    max_terr = max((c["objectives"]["terrainSafetyPct"] for c in evaluated), default=100.0)
    max_mri = max((c["objectives"]["mriScore"] for c in evaluated), default=100.0)

    for c in evaluated:
        obj = c["objectives"]
        strengths = []
        trades = []
        if obj["solarPct"] >= max_solar - 5.0:
            strengths.append(f"top-tier solar illumination ({obj['solarPct']:.0f}%)")
        if obj["earthPct"] >= max_earth - 5.0:
            strengths.append(f"continuous direct Earth visibility ({obj['earthPct']:.0f}%)")
        if obj["terrainSafetyPct"] >= max_terr - 6.0:
            strengths.append(f"low-slope benign terrain ({c['terrain']['slopeDeg']:.1f}° slope, {obj['terrainSafetyPct']:.0f}% safety)")
        if obj["mriScore"] >= max_mri - 10.0 and obj["mriScore"] >= 50.0:
            strengths.append(f"high schedule resilience (MRI {obj['mriScore']:.0f}/100)")

        if obj["earthPct"] < 80.0:
            trades.append(f"periodic Earth horizon grazing ({obj['earthPct']:.0f}% direct visibility)")
        if c["terrain"]["slopeDeg"] > 2.5:
            trades.append(f"steeper polar relief ({c['terrain']['slopeDeg']:.1f}° slope)")
        if obj["mriScore"] < 55.0:
            trades.append(f"tighter launch schedule window (MRI {obj['mriScore']:.0f}/100)")
        if obj["darknessHours"] > 0:
            trades.append(f"{obj['darknessHours']:.0f} h terrain shadow spells")

        if c["paretoOptimal"]:
            s_txt = ", ".join(strengths) if strengths else f"balanced multi-objective profile (viability {c['viabilityScore']:.0f})"
            t_txt = f"; trades against {', '.join(trades)}" if trades else "; no severe trade-off across tested objectives"
            c["tradeoffSummary"] = f"Pareto Frontier (Rank #1): Excels in {s_txt}{t_txt}."
        elif not c["feasible"]:
            c["tradeoffSummary"] = f"Violates hard constraint(s): {', '.join(c['failedHardConstraints'])}."
        else:
            dom = c["dominatedBy"][0] if c["dominatedBy"] else "frontier candidates"
            c["tradeoffSummary"] = f"Pareto Rank #{c['paretoRank']}: Dominated by {dom} across combined solar, comms, terrain, and resilience objectives."

    # Sort candidates: Pareto optimal first, then feasible, then paretoRank, then viabilityScore + mriScore
    evaluated.sort(key=lambda c: (not c["paretoOptimal"], not c["feasible"], c["paretoRank"], -(c["viabilityScore"] + 0.35 * c["mriScore"])))
    for idx, c in enumerate(evaluated):
        c["overallRank"] = idx + 1

    pareto_front = [c for c in evaluated if c["paretoOptimal"]]

    return {
        "kind": "site_optimization",
        "searchEpochUtc": from_iso,
        "surfaceDays": surface_days,
        "totalCandidates": len(evaluated),
        "feasibleCandidates": sum(1 for c in evaluated if c["feasible"]),
        "paretoFrontierCount": len(pareto_front),
        "paretoFrontierIds": [c["id"] for c in pareto_front],
        "recommendedCandidate": evaluated[0] if evaluated else None,
        "candidates": evaluated,
        "objectivesMeta": [
            {"key": "solarPct", "label": "Solar Availability (%)", "direction": "maximize"},
            {"key": "earthPct", "label": "Earth Visibility (%)", "direction": "maximize"},
            {"key": "terrainSafetyPct", "label": "Terrain Safety (%)", "direction": "maximize"},
            {"key": "darknessHours", "label": "Max Darkness (h)", "direction": "minimize"},
            {"key": "mriScore", "label": "Schedule Resilience (MRI)", "direction": "maximize"},
        ],
        "methodNote": "Hard constraints filter infeasible sites first; non-dominated Pareto sorting identifies the Rank-1 Pareto frontier across Solar, Earth Comms, Terrain Safety, Darkness Survival, and Schedule Resilience (MRI).",
    }
