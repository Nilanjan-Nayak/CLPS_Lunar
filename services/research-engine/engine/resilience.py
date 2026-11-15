"""Mission Resilience Engine, Constraint Engine, MRI, Explainable Recommendations & Confidence Report.

Implements Features 1, 2, 7, and 8 from the SELENARA X architecture upgrade:
  • Structured constraint evaluation (pass / warn / fail with actual, threshold, margin, unit)
  • Schedule-delay simulation across +0, +1, +2, +3, +5, +7, +10, +14, +21, +28 days
  • Mission Resilience Index (MRI = feasible_scenarios / total_scenarios * 100)
  • Deterministic Explainable Recommendations (why recommended + known risks + recovery actions)
  • Multi-domain Data Quality & Confidence breakdown (terrain, ephemeris, power, comms, historical ML)"""
from __future__ import annotations
import math
from datetime import timedelta
from . import dem, ephem, power, rescheduler
from .landers import LANDERS, LAUNCH_VEHICLES, TRANSFERS

DEFAULT_DELAYS_DAYS = [0, 1, 2, 3, 5, 7, 10, 14, 21, 28]
SCENARIO_CODE = {0: "Baseline", 1: "Scenario A", 2: "Scenario B", 3: "Scenario C", 5: "Scenario D", 7: "Scenario E", 10: "Scenario F", 14: "Scenario G", 21: "Scenario H", 28: "Scenario I"}


def evaluate_constraints(
    *,
    propellant_margin_kg: float,
    stack_mass_tli_kg: float,
    lv_capacity_kg: float,
    lv_name: str,
    peak_throttle: float,
    slope_deg: float,
    baseline_m: float,
    sun_elev_td_deg: float,
    sun_clearance_td_deg: float,
    sun_visible_td: bool,
    sunlit_fraction: float,
    sunlit_hours: float,
    requested_surface_days: float,
    earth_vis_fraction: float,
    earth_min_deg: float,
    relay_enabled: bool,
    power_summary: dict,
    power_params: dict,
    max_slope_deg: float = 8.0,
    min_sunlit_fraction: float = 0.65,
    min_earth_vis_fraction: float = 0.50,
) -> list[dict]:
    """Evaluate all 9 mission engineering constraints and return structured pass/warn/fail results."""
    min_safe_soc = float(power_params.get("minSafeSocPct", 20.0))
    min_soc = float(power_summary.get("minSocPct", 100.0))
    max_dark_h = float(power_summary.get("maxContinuousDarknessHours", 0.0))
    surv_dark_h = float(power_summary.get("darknessSurvivalHours", 9.0))
    energy_margin_kwh = float(power_summary.get("energyMarginKwh", 0.0))

    constraints = []

    # 1. Propellant margin
    c_prop_status = "pass" if propellant_margin_kg >= 15.0 else ("warn" if propellant_margin_kg >= 0.0 else "fail")
    constraints.append({
        "id": "C_PROP",
        "name": "Propellant Δv Margin",
        "category": "propulsion",
        "hard": True,
        "status": c_prop_status,
        "actual": round(propellant_margin_kg, 1),
        "threshold": 0.0,
        "unit": "kg",
        "margin": round(propellant_margin_kg, 1),
        "summary": (
            f"Propellant margin +{propellant_margin_kg:.1f} kg after LOI + DOI + powered descent + 50 m/s hover reserve"
            if propellant_margin_kg >= 0
            else f"Propellant deficit {propellant_margin_kg:.1f} kg — mission Δv chain does not close"
        ),
    })

    # 2. Launch vehicle TLI capacity
    tli_margin = lv_capacity_kg - stack_mass_tli_kg
    c_tli_status = "pass" if tli_margin >= 100.0 else ("warn" if tli_margin >= 0.0 else "fail")
    constraints.append({
        "id": "C_TLI",
        "name": "Launch Vehicle TLI Capacity",
        "category": "propulsion",
        "hard": True,
        "status": c_tli_status,
        "actual": round(stack_mass_tli_kg, 0),
        "threshold": round(lv_capacity_kg, 0),
        "unit": "kg",
        "margin": round(tli_margin, 0),
        "summary": f"Wet stack {stack_mass_tli_kg:.0f} kg vs {lv_name} capacity {lv_capacity_kg:.0f} kg (margin {tli_margin:+.0f} kg)",
    })

    # 3. Terrain slope safety
    slope_margin = max_slope_deg - slope_deg
    c_slope_status = "pass" if slope_deg <= (max_slope_deg - 2.0) else ("warn" if slope_deg <= max_slope_deg else "fail")
    constraints.append({
        "id": "C_SLOPE",
        "name": "Terrain Slope Limit",
        "category": "terrain",
        "hard": True,
        "status": c_slope_status,
        "actual": round(slope_deg, 2),
        "threshold": round(max_slope_deg, 1),
        "unit": "deg",
        "margin": round(slope_margin, 2),
        "summary": f"Local DEM slope {slope_deg:.2f}° at {baseline_m:.0f} m baseline vs {max_slope_deg:.1f}° limit (margin {slope_margin:+.2f}°)",
    })

    # 4. Touchdown Sun illumination above local terrain horizon
    c_suntd_status = "pass" if (sun_visible_td and sun_clearance_td_deg >= 2.0) else ("warn" if (sun_visible_td and sun_clearance_td_deg >= 0.3) else "fail")
    constraints.append({
        "id": "C_SUN_TD",
        "name": "Touchdown Sun Terrain Clearance",
        "category": "illumination",
        "hard": True,
        "status": c_suntd_status,
        "actual": round(sun_clearance_td_deg, 2),
        "threshold": 0.5,
        "unit": "deg",
        "margin": round(sun_clearance_td_deg - 0.5, 2),
        "summary": (
            f"Sun {sun_elev_td_deg:.1f}° geometric ({sun_clearance_td_deg:+.1f}° above local terrain horizon) at landing"
            if sun_visible_td
            else f"Sun blocked at landing ({sun_elev_td_deg:.1f}° geometric, {sun_clearance_td_deg:+.1f}° vs terrain mask)"
        ),
    })

    # 5. Surface-ops sunlit fraction
    sun_pct = round(sunlit_fraction * 100.0, 1)
    min_sun_pct = round(min_sunlit_fraction * 100.0, 1)
    c_solar_status = "pass" if sunlit_fraction >= max(min_sunlit_fraction + 0.15, 0.80) else ("warn" if sunlit_fraction >= min_sunlit_fraction else "fail")
    constraints.append({
        "id": "C_SOLAR",
        "name": "Surface Sunlight Availability",
        "category": "illumination",
        "hard": True,
        "status": c_solar_status,
        "actual": sun_pct,
        "threshold": min_sun_pct,
        "unit": "%",
        "margin": round(sun_pct - min_sun_pct, 1),
        "summary": f"Sunlit {sun_pct:.0f}% ({sunlit_hours:.0f} h of {requested_surface_days * 24:.0f} h) vs {min_sun_pct:.0f}% threshold",
    })

    # 6. Electrical power & minimum battery SOC
    soc_margin = min_soc - min_safe_soc
    c_power_status = "pass" if (soc_margin >= 12.0 and energy_margin_kwh >= 0) else ("warn" if soc_margin >= 0.0 else "fail")
    constraints.append({
        "id": "C_POWER",
        "name": "Battery State-of-Charge Floor",
        "category": "power",
        "hard": True,
        "status": c_power_status,
        "actual": round(min_soc, 1),
        "threshold": round(min_safe_soc, 1),
        "unit": "% SOC",
        "margin": round(soc_margin, 1),
        "summary": f"Min battery SOC {min_soc:.1f}% vs {min_safe_soc:.0f}% floor (net energy margin {energy_margin_kwh:+.2f} kWh)",
    })

    # 7. Continuous darkness / eclipse survival
    dark_margin = surv_dark_h - max_dark_h
    c_dark_status = "pass" if dark_margin >= 2.0 else ("warn" if dark_margin >= 0.0 else "fail")
    constraints.append({
        "id": "C_DARK",
        "name": "Darkness Survival Duration",
        "category": "power",
        "hard": True,
        "status": c_dark_status,
        "actual": round(max_dark_h, 1),
        "threshold": round(surv_dark_h, 1),
        "unit": "h",
        "margin": round(dark_margin, 1),
        "summary": f"Longest darkness {max_dark_h:.1f} h vs battery survival limit {surv_dark_h:.1f} h (margin {dark_margin:+.1f} h)",
    })

    # 8. Earth communication line-of-sight
    earth_pct = round(earth_vis_fraction * 100.0, 1)
    # Hard limit: at least 25% of surface window (≈84 h over 14 d) must have Earth line-of-sight unless relay orbiter is active
    hard_earth_frac = min(min_earth_vis_fraction, 0.25)
    hard_earth_pct = round(hard_earth_frac * 100.0, 1)
    warn_earth_pct = round(max(min_earth_vis_fraction, 0.65) * 100.0, 1)
    if relay_enabled:
        c_earth_status = "pass" if earth_vis_fraction >= min_earth_vis_fraction else "warn"
        earth_summary = f"Direct Earth visible {earth_pct:.0f}% (min {earth_min_deg:.1f}°) — lunar relay orbiter active"
    else:
        c_earth_status = "pass" if (earth_vis_fraction >= 0.65 and earth_min_deg >= 3.0) else ("warn" if earth_vis_fraction >= hard_earth_frac else "fail")
        earth_summary = f"Terrain-masked Earth visible {earth_pct:.0f}% of surface ops (min elevation {earth_min_deg:.1f}°, warn < {warn_earth_pct:.0f}%)"
    constraints.append({
        "id": "C_EARTH",
        "name": "Earth Direct Line-of-Sight",
        "category": "communications",
        "hard": not relay_enabled,
        "status": c_earth_status,
        "actual": earth_pct,
        "threshold": 0.0 if relay_enabled else hard_earth_pct,
        "unit": "%",
        "margin": round(earth_pct - (0.0 if relay_enabled else hard_earth_pct), 1),
        "summary": earth_summary,
    })

    # 9. Powered descent throttle limit
    thr_pct = round(peak_throttle * 100.0, 1)
    c_desc_status = "pass" if peak_throttle <= 0.96 else ("warn" if peak_throttle <= 1.00 else "fail")
    constraints.append({
        "id": "C_DESCENT",
        "name": "Powered Descent Peak Throttle",
        "category": "propulsion",
        "hard": True,
        "status": c_desc_status,
        "actual": thr_pct,
        "threshold": 100.0,
        "unit": "%",
        "margin": round(100.0 - thr_pct, 1),
        "summary": f"Peak commanded engine throttle {thr_pct:.1f}% during braking/approach",
    })

    return constraints


def compute_viability_score(
    constraints: list[dict],
    sunlit_fraction: float,
    earth_vis_fraction: float,
    slope_deg: float,
    power_summary: dict,
    propellant_margin_kg: float,
) -> float:
    """Deterministic engineering viability score (0–100) for a single scenario.
    Kept strictly separate from the exploratory historical logistic-regression model."""
    solar_pts = min(1.0, max(0.0, sunlit_fraction)) * 30.0
    power_pts = min(1.0, max(0.0, float(power_summary.get("minSocPct", 0.0)) / 100.0)) * 20.0
    terrain_pts = min(1.0, max(0.0, 1.0 - slope_deg / 15.0)) * 20.0
    comm_pts = min(1.0, max(0.0, earth_vis_fraction)) * 15.0
    prop_pts = (15.0 if propellant_margin_kg >= 30.0 else max(0.0, (propellant_margin_kg + 20.0) / 50.0 * 15.0))
    raw = solar_pts + power_pts + terrain_pts + comm_pts + prop_pts
    hard_fails = sum(1 for c in constraints if c["hard"] and c["status"] == "fail")
    warns = sum(1 for c in constraints if c["status"] == "warn")
    penalty = hard_fails * 18.0 + warns * 4.0
    return round(max(0.0, min(100.0, raw - penalty)), 1)


def build_explainable_recommendations(
    *,
    site_label: str,
    baseline_scenario: dict,
    mri_score: float,
    critical_delay_days: float | None,
    best_recovery: dict | None,
    terrain: dict,
    relay_required: bool,
    propellant_margin_kg: float,
) -> dict:
    """Feature 7: Deterministic recommendation engine built strictly from engine outputs and metadata."""
    why = []
    risks = []
    actions = []

    for c in baseline_scenario["constraints"]:
        if c["status"] == "pass":
            if c["id"] == "C_SOLAR":
                why.append(f"Passes solar illumination constraint ({c['actual']:.0f}% sunlit over surface ops, threshold {c['threshold']:.0f}%).")
            elif c["id"] == "C_POWER":
                why.append(f"Closes electrical energy budget with minimum battery SOC {c['actual']:.0f}% (safe floor {c['threshold']:.0f}%).")
            elif c["id"] == "C_SLOPE":
                why.append(f"Estimated LOLA DEM slope is {c['actual']:.2f}° at {terrain['baselineM']:.0f} m baseline (below {c['threshold']:.1f}° limit).")
            elif c["id"] == "C_EARTH":
                why.append(f"Provides adequate terrain-masked Earth line-of-sight ({c['actual']:.0f}% visibility during surface ops).")
            elif c["id"] == "C_PROP":
                why.append(f"Closes propulsion Δv chain with +{c['actual']:.0f} kg propellant margin beyond 50 m/s hover reserve.")
        elif c["status"] == "warn":
            risks.append(f"Marginal {c['name']}: {c['summary']}.")
        elif c["status"] == "fail":
            risks.append(f"Violates {c['name']}: {c['summary']}.")

    if mri_score >= 70.0:
        why.append(f"Retains mission feasibility across {mri_score:.0f}% of tested schedule-delay scenarios (MRI = {mri_score:.0f}/100).")
    elif mri_score >= 40.0:
        risks.append(f"Moderate schedule sensitivity (MRI = {mri_score:.0f}/100): launch delays beyond +{critical_delay_days or 3:g} d degrade surface sunlight.")
    else:
        risks.append(f"High schedule fragility (MRI = {mri_score:.0f}/100): small launch slips push operations into lunar dusk/night.")

    res_m = terrain.get("resolutionM", terrain.get("baselineM", 1895))
    risks.append(
        f"Terrain DEM resolution is {res_m:g} m/px ({terrain.get('grade', 'regional')}); metre-scale boulders and small craters are not resolved and require terminal hazard detection."
    )
    risks.append("Geometric Earth line-of-sight does not guarantee NASA DSN / ground-station contact scheduling or RF link margin.")

    if critical_delay_days is not None and best_recovery is not None:
        actions.append(
            f"If launch slips by ≥ +{critical_delay_days:g} days, hold and target recovery window {best_recovery['landingUtc']} "
            f"(+{best_recovery['shiftFromBaselineDays']:.1f} d from baseline, viability {best_recovery['viabilityScore']:.0f}/100)."
        )
    if relay_required:
        actions.append("Assign a lunar relay orbiter (e.g., LRO / Lunar Pathfinder class) to cover low-Earth-elevation or terrain-masked intervals.")
    if propellant_margin_kg < 20.0:
        actions.append("Reduce payload mass or switch to a phasing / low-energy transfer to restore ≥ 20 kg propellant margin.")

    verdict = (
        "Recommended (Baseline Feasible & Schedule-Resilient)"
        if baseline_scenario["feasible"] and mri_score >= 60.0
        else "Conditionally Feasible (Tight Schedule Window — Monitor Delays)"
        if baseline_scenario["feasible"]
        else "Replanning Recommended (Baseline Violates Hard Constraints)"
    )

    return {
        "siteLabel": site_label,
        "verdict": verdict,
        "whyRecommended": why if why else ["No primary constraints passed with wide margin — review recovery windows or alternative sites."],
        "knownRisks": risks,
        "recommendedActions": actions,
        "provenanceNote": "Generated deterministically from LOLA DEM, Meeus/IAU 2009 ephemeris, electrical power balance, and constraint evaluations.",
    }


def build_confidence_report(terrain: dict, horizon: dict | None, power_budget: dict, outcome_model: dict) -> dict:
    """Feature 8: Domain-separated scientific data-quality and confidence breakdown (never one unexplained percentage)."""
    is_polar_gdr = str(terrain.get("grade", "")).startswith("science")
    res_m = terrain.get("resolutionM", terrain.get("baselineM", 1895))
    return {
        "domains": [
            {
                "id": "terrain",
                "domain": "Topography & Horizon Masking",
                "grade": "Science-grade (PDS LOLA GDR)" if is_polar_gdr else "Derived regional (CGI Moon Kit)",
                "confidenceLevel": "High (regional/mesoscale)" if is_polar_gdr else "Medium (regional screening)",
                "dataset": terrain.get("dataSource", "NASA LRO LOLA DEM"),
                "resolution": f"{res_m:g} m/px ({'polar stereographic' if is_polar_gdr else '16 px/deg cylindrical'})",
                "assumptions": f"Central-difference slope over {terrain.get('baselineM', res_m):g} m baseline; 36-azimuth ray-marched horizon within {(horizon or {}).get('maxKm', 60):g} km from 2 m sensor height.",
                "limitations": f"Cannot resolve lander-scale hazards (< {res_m:g} m boulders, fresh metre-scale craters, regolith bearing strength). Terminal LiDAR/optical hazard avoidance is still required.",
            },
            {
                "id": "ephemeris",
                "domain": "Sun & Earth Ephemeris",
                "grade": "Validated analytical series",
                "confidenceLevel": "High (window screening)",
                "dataset": "Meeus Ch. 25/47 (truncated ELP-2000/82) + IAU 1976 Precession + IAU 2009 WGCCRE Moon Orientation",
                "resolution": "≤ 0.6 arcmin (0.01°) at 3 JPL Horizons DE441 reference epochs; ≤ 0.35° across 6 Apollo landings",
                "assumptions": f"TT − UTC = {ephem.TT_MINUS_UTC_S} s; nutation (~0.005°) omitted; sunrise crossings bisected against terrain-masked horizon.",
                "limitations": ephem.VALIDATION_INFO["scopeNote"],
                "testedEpochsUtc": ephem.VALIDATION_INFO["testedEpochsUtc"],
            },
            {
                "id": "power",
                "domain": "Electrical Power & Thermal Survival",
                "grade": "Parametric engineering model",
                "confidenceLevel": "Medium (preliminary sizing)",
                "dataset": f"AM0 irradiance {power.SOLAR_CONSTANT_WM2} W/m² + lander class preset ({power_budget['parameters']['solarPanelAreaM2']} m², η={power_budget['parameters']['panelEfficiency']*100:.0f}%, {power_budget['parameters']['batteryCapacityWh']:.0f} Wh)",
                "resolution": "Time-stepped energy balance over surface mission (~2–3 h steps)",
                "assumptions": "Faceted + deck solar array incidence curve with 8% noon thermal derating; 92% MPPT/charge and 95% discharge efficiency.",
                "limitations": "Does not model sub-pixel boulder shadows, dust accumulation on panels, or multi-node cryogenic heater transients.",
            },
            {
                "id": "communications",
                "domain": "Earth Visibility & Downlink",
                "grade": "Terrain-masked geometric LOS",
                "confidenceLevel": "Medium (geometric screening)",
                "dataset": "Topocentric Earth vector + LOLA DEM azimuth horizon mask",
                "resolution": "6-hour visibility sampling over 14-day window + mission profile",
                "assumptions": "Line-of-sight clearance above local terrain mask; constant configured data rate during visible intervals.",
                "limitations": "Geometric visibility ≠ operational contact. Real scheduling requires NASA DSN / commercial aperture allocation, antenna pointing constraints, and RF link-budget closure.",
            },
            {
                "id": "historical_ml",
                "domain": "Historical Landing Comparison (ML)",
                "grade": "Exploratory statistical reference",
                "confidenceLevel": "Exploratory only (not a reliability metric)",
                "dataset": f"NSSDCA catalogued lunar landing attempts (n={outcome_model.get('n', 47)})",
                "resolution": f"Leave-one-out CV accuracy {(outcome_model.get('looCv', {}).get('accuracy', 0.575)*100):.1f}% · Brier {outcome_model.get('looCv', {}).get('brier', 0.24)}",
                "assumptions": "L2-regularized logistic regression + k-NN similarity on regional terrain and mission era features.",
                "limitations": "Small historical sample size (n=47); hardware/GNC failures dominate historical outcomes. Kept strictly separate from the engineering Viability Score and MRI.",
            },
        ]
    }


def evaluate_epoch_for_plan(
    *,
    lat: float,
    lon: float,
    landing_dt,
    delay_days: float,
    label: str,
    surface_days: float,
    pre_landing_s: float,
    downlink_h: float,
    inp: dict,
    preset: dict,
    terrain: dict,
    horizon: dict | None,
    hfn,
    propellant_margin_kg: float,
    stack_mass_tli_kg: float,
    lv_capacity_kg: float,
    lv_name: str,
    peak_throttle: float,
    relay_override: bool | None = None,
) -> dict:
    """Evaluate a single landing timestamp (`landing_dt`) through ephemeris, terrain horizon, power budget, and constraints."""
    H = 3600.0; D = 86400.0
    launch_dt = landing_dt - timedelta(seconds=pre_landing_s)
    surf_start_dt = landing_dt
    surf_end_dt = landing_dt + timedelta(days=surface_days)
    fmt = lambda dt: dt.strftime("%Y-%m-%dT%H:%MZ")

    at_landing = ephem.site_geometry(fmt(landing_dt).replace("Z", ":00Z"), lat, lon)
    sun_mask_td = float(hfn(at_landing["sunAzimuthDeg"])) if hfn else 0.0
    earth_mask_td = float(hfn(at_landing["earthAzimuthDeg"])) if hfn else 0.0
    sun_clear_td = at_landing["sunElevationDeg"] - sun_mask_td
    earth_clear_td = at_landing["earthElevationDeg"] - earth_mask_td
    sun_vis_td = sun_clear_td > 0.0
    earth_vis_td = earth_clear_td > 0.0

    # Sample surface window at ~3 h resolution for fast, accurate delay sweeps
    step_h = max(2.0, min(3.0, surface_days * 24.0 / 96.0))
    surf_samples = ephem.profile(lat, lon, fmt(surf_start_dt).replace("Z", ":00Z"), surface_days + step_h / 24.0, step_hours=step_h)
    for smp in surf_samples:
        t_sec = round((ephem.parse_utc(smp["utc"]) - launch_dt).total_seconds())
        smp["t"] = t_sec
        sm = float(hfn(smp["sunAzimuthDeg"])) if hfn else 0.0
        em = float(hfn(smp["earthAzimuthDeg"])) if hfn else 0.0
        smp["sunVisible"] = smp["sunElevationDeg"] > sm
        smp["earthVisible"] = smp["earthElevationDeg"] > em
        smp.pop("jd", None)

    sun_frac = sum(1 for smp in surf_samples if smp["sunVisible"]) / max(len(surf_samples), 1)
    earth_frac = sum(1 for smp in surf_samples if smp["earthVisible"]) / max(len(surf_samples), 1)
    earth_min = min((smp["earthElevationDeg"] for smp in surf_samples), default=0.0)
    earth_max = max((smp["earthElevationDeg"] for smp in surf_samples), default=0.0)
    relay_req = (earth_max < 5.0 or earth_frac < 0.5) if relay_override is None else bool(relay_override)

    pwr = power.compute_power_budget(
        inp,
        preset,
        surf_samples,
        pre_landing_s,
        pre_landing_s + surface_days * D,
        horizon_fn=hfn,
    )

    constraints = evaluate_constraints(
        propellant_margin_kg=propellant_margin_kg,
        stack_mass_tli_kg=stack_mass_tli_kg,
        lv_capacity_kg=lv_capacity_kg,
        lv_name=lv_name,
        peak_throttle=peak_throttle,
        slope_deg=float(terrain["slopeDeg"]),
        baseline_m=float(terrain["baselineM"]),
        sun_elev_td_deg=float(at_landing["sunElevationDeg"]),
        sun_clearance_td_deg=round(sun_clear_td, 2),
        sun_visible_td=sun_vis_td,
        sunlit_fraction=sun_frac,
        sunlit_hours=pwr["summary"]["sunlitHours"],
        requested_surface_days=surface_days,
        earth_vis_fraction=earth_frac,
        earth_min_deg=earth_min,
        relay_enabled=bool(inp.get("useRelay", False)),
        power_summary=pwr["summary"],
        power_params=pwr["parameters"],
        max_slope_deg=float(inp.get("maxSlopeDeg", 8.0)),
        min_sunlit_fraction=float(inp.get("minSunlitFraction", 0.65)),
        min_earth_vis_fraction=float(inp.get("minEarthVisFraction", 0.50)),
    )

    failed_hard = [c["name"] for c in constraints if c["hard"] and c["status"] == "fail"]
    failed_ids = [c["id"] for c in constraints if c["hard"] and c["status"] == "fail"]
    warns = [c["name"] for c in constraints if c["status"] == "warn"]
    feasible = len(failed_hard) == 0

    if feasible and len(warns) <= 1:
        result_status = "Feasible"
    elif feasible:
        result_status = "Marginal"
    elif len(failed_hard) >= 3 or (not sun_vis_td and not pwr["summary"]["powerFeasible"]):
        result_status = "Replanning required"
    else:
        result_status = "Constraint violation"

    viability = compute_viability_score(
        constraints,
        sun_frac,
        earth_frac,
        float(terrain["slopeDeg"]),
        pwr["summary"],
        propellant_margin_kg,
    )

    return {
        "delayDays": delay_days,
        "code": SCENARIO_CODE.get(int(delay_days) if float(delay_days).is_integer() else -1, f"+{delay_days:g}d"),
        "label": label,
        "launchUtc": fmt(launch_dt),
        "landingUtc": fmt(landing_dt),
        "surfaceEndUtc": fmt(surf_end_dt),
        "sunElevationAtLandingDeg": round(at_landing["sunElevationDeg"], 2),
        "sunClearanceAtLandingDeg": round(sun_clear_td, 2),
        "sunVisibleAtLanding": sun_vis_td,
        "earthElevationAtLandingDeg": round(at_landing["earthElevationDeg"], 2),
        "earthClearanceAtLandingDeg": round(earth_clear_td, 2),
        "earthVisibleAtLanding": earth_vis_td,
        "sunlitHours": pwr["summary"]["sunlitHours"],
        "sunlitFraction": round(sun_frac, 3),
        "earthVisibleFraction": round(earth_frac, 3),
        "earthElevationMinDeg": round(earth_min, 2),
        "earthElevationMaxDeg": round(earth_max, 2),
        "relayRecommended": relay_req,
        "power": pwr["summary"],
        "constraints": constraints,
        "failedConstraintIds": failed_ids,
        "failedHardConstraints": failed_hard,
        "warnConstraints": warns,
        "feasible": feasible,
        "resultStatus": result_status,
        "viabilityScore": viability,
    }


def simulate_resilience(inp: dict, base_plan: dict) -> dict:
    """Run the schedule-delay simulator (Feature 1), compute MRI (Feature 2), search for recovery windows,
    and build Explainable Recommendations (Feature 7) + Confidence Report (Feature 8)."""
    lat = float(base_plan["site"]["latitude"])
    lon = float(base_plan["site"]["longitude"])
    preset_id = base_plan["input"]["lander"]["id"]
    preset = next((l for l in LANDERS if l["id"] == preset_id), LANDERS[0])
    terrain = base_plan["site"]["terrain"]
    horizon, hfn = dem.best_horizon(lat, lon)

    surface_days = float(base_plan["input"]["surfaceDays"])
    landing_phase = next(p for p in base_plan["timeline"]["phases"] if p["id"] == "landing")
    pre_landing_s = float(landing_phase["endS"])
    data_gb = float(base_plan["input"]["dataVolumeGb"])
    mbps = float(base_plan["input"]["downlinkMbps"])
    downlink_h = data_gb * 8000.0 / max(mbps * 3600.0, 1.0)

    prop_margin_kg = float(base_plan["budget"]["mass"]["propellantMarginKg"])
    stack_tli_kg = float(base_plan["budget"]["mass"]["atTliKg"])
    lv_cap_kg = float(base_plan["input"]["launchVehicle"]["tliCapacityKg"])
    lv_name = str(base_plan["input"]["launchVehicle"]["name"])
    peak_thr = float(base_plan["descent"]["peakThrottle"])

    base_landing_iso = base_plan["ephemeris"]["calendar"]["landingUtc"].replace("Z", ":00Z")
    base_landing_dt = ephem.parse_utc(base_landing_iso)

    raw_delays = inp.get("delaysDays", DEFAULT_DELAYS_DAYS)
    delays = []
    for d in raw_delays[:16]:
        fd = round(float(d), 2)
        if fd not in delays and -30.0 <= fd <= 90.0:
            delays.append(fd)
    if 0.0 not in delays:
        delays.insert(0, 0.0)
    delays.sort()

    def _eval_dt(cand_dt, d_days: float, lbl: str) -> dict:
        return evaluate_epoch_for_plan(
            lat=lat,
            lon=lon,
            landing_dt=cand_dt,
            delay_days=d_days,
            label=lbl,
            surface_days=surface_days,
            pre_landing_s=pre_landing_s,
            downlink_h=downlink_h,
            inp=inp,
            preset=preset,
            terrain=terrain,
            horizon=horizon,
            hfn=hfn,
            propellant_margin_kg=prop_margin_kg,
            stack_mass_tli_kg=stack_tli_kg,
            lv_capacity_kg=lv_cap_kg,
            lv_name=lv_name,
            peak_throttle=peak_thr,
        )

    scenarios = []
    for d in delays:
        cand_dt = base_landing_dt + timedelta(days=d)
        code = SCENARIO_CODE.get(int(d) if float(d).is_integer() else -1, f"Delay +{d:g}d")
        lbl = "Baseline (0 days)" if d == 0 else f"{code} (+{d:g} day{'s' if d != 1 else ''})"
        scenarios.append(_eval_dt(cand_dt, d, lbl))

    total_scen = len(scenarios)
    feasible_scen = sum(1 for s in scenarios if s["feasible"])
    failed_scen = total_scen - feasible_scen
    mri_score = round((feasible_scen / max(total_scen, 1)) * 100.0, 1)

    # Weighted MRI (near-term slips 0..7d have higher operational likelihood than 14..28d slips)
    weights = [math.exp(-max(0.0, s["delayDays"]) / 10.0) for s in scenarios]
    weighted_mri = round(
        sum(w * (100.0 if s["feasible"] else 0.0) for w, s in zip(weights, scenarios)) / max(sum(weights), 1e-6),
        1,
    )

    # Tally which constraints fail across delayed scenarios
    failure_counts: dict[str, int] = {}
    for s in scenarios:
        for cid in s["failedHardConstraints"]:
            failure_counts[cid] = failure_counts.get(cid, 0) + 1

    critical_delay = next((s["delayDays"] for s in scenarios if s["delayDays"] > 0 and not s["feasible"]), None)

    # Search for best recovery landing windows
    target_sun = float(base_plan["ephemeris"]["targetSunElevationDeg"])
    recovery = rescheduler.find_recovery_windows(
        lat=lat,
        lon=lon,
        from_iso=base_landing_iso,
        target_sun_deg=target_sun,
        horizon_fn=hfn,
        evaluate_epoch_fn=_eval_dt,
    )

    baseline_scen = next((s for s in scenarios if s["delayDays"] == 0), scenarios[0])
    site_label = base_plan["summaryCard"]["landingSite"]
    recommendations = build_explainable_recommendations(
        site_label=site_label,
        baseline_scenario=baseline_scen,
        mri_score=mri_score,
        critical_delay_days=critical_delay,
        best_recovery=recovery["bestRecovery"],
        terrain=terrain,
        relay_required=bool(base_plan["site"]["relayRequired"]),
        propellant_margin_kg=prop_margin_kg,
    )
    confidence = build_confidence_report(
        terrain=terrain,
        horizon=horizon,
        power_budget=base_plan.get("powerBudget") or {"parameters": {"solarPanelAreaM2": 2.6, "panelEfficiency": 0.29, "batteryCapacityWh": 1500}},
        outcome_model=base_plan["outcomeModel"],
    )

    return {
        "kind": "resilience",
        "site": {
            "latitude": lat,
            "longitude": lon,
            "label": site_label,
            "terrain": terrain,
            "horizon": horizon,
        },
        "baselineLandingUtc": base_plan["ephemeris"]["calendar"]["landingUtc"],
        "surfaceDays": surface_days,
        "mri": {
            "score": mri_score,
            "weightedScore": weighted_mri,
            "totalScenarios": total_scen,
            "feasibleScenarios": feasible_scen,
            "failedScenarios": failed_scen,
            "criticalDelayDays": critical_delay,
            "constraintFailureCounts": failure_counts,
            "formula": "MRI = (Feasible tested scenarios / Total tested scenarios) × 100",
            "testedDelaysDays": delays,
            "note": "Illustrative engineering schedule-robustness metric across the tested delay set — NOT the probability of a successful lunar landing.",
        },
        "scenarios": scenarios,
        "recovery": recovery,
        "recommendations": recommendations,
        "confidence": confidence,
    }
