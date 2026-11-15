"""Mission Power Budget Engine & Golden Mission Window Engine.

Computes time-stepped solar generation, electrical load, battery state-of-charge (SOC), darkness survival
duration, and combined Golden Mission Window intervals (simultaneous terrain-masked illumination, positive
power/SOC margin, and terrain-masked Earth communication visibility)."""
from __future__ import annotations
import math
from . import ephem

SOLAR_CONSTANT_WM2 = 1361.0  # AM0 total solar irradiance at 1 AU


def _incidence_factor(sun_elev_deg: float, sun_visible: bool, power_type: str = "solar") -> float:
    """Effective illumination factor for a CLPS lander with combined deck + faceted body-mounted solar panels."""
    if not sun_visible or sun_elev_deg <= 0.0 or power_type != "solar":
        return 0.0
    th = math.radians(min(max(sun_elev_deg, 0.0), 90.0))
    # Faceted cylindrical/side arrays project as cos(th) * 0.54; top deck projects as sin(th) * 0.48
    geom = 0.54 * math.cos(th) + 0.48 * math.sin(th)
    # High-sun lunar noon thermal derating (~8% at 90 deg)
    thermal = 1.0 - 0.08 * math.sin(th)
    return min(max(geom * thermal, 0.14), 1.0)


def compute_power_budget(
    inp: dict,
    preset: dict,
    samples: list[dict],
    surface_start_s: float,
    surface_end_s: float,
    horizon_fn=None,
) -> dict:
    """Simulate electrical power generation, load consumption, and battery SOC over the surface mission."""
    power_type = str(preset.get("power", "solar"))
    area_m2 = float(inp.get("solarPanelAreaM2", preset.get("solarPanelAreaM2", 2.6)))
    eff = float(inp.get("panelEfficiency", preset.get("panelEfficiency", 0.29)))
    batt_wh = float(inp.get("batteryCapacityWh", preset.get("batteryCapacityWh", 1500.0)))
    base_w = float(inp.get("baseLoadW", preset.get("baseLoadW", 210.0)))
    default_pl_w = float(preset.get("payloadLoadW", 90.0))
    payload_kg = float(inp.get("payloadKg", preset.get("payloadKg", 100.0)))
    preset_pl_kg = max(float(preset.get("payloadKg", 100.0)), 1.0)
    scaled_pl_w = round(default_pl_w * (0.5 + 0.5 * (payload_kg / preset_pl_kg)), 1)
    payload_w = float(inp.get("payloadLoadW", scaled_pl_w))
    night_w = float(inp.get("nightSurvivalLoadW", preset.get("nightSurvivalLoadW", 130.0)))
    max_dod = min(max(float(inp.get("maxDod", preset.get("maxDod", 0.80))), 0.30), 0.95)
    min_sun_frac = float(inp.get("minSunlitFraction", 0.65))

    op_load_w = base_w + payload_w
    min_safe_soc_pct = round((1.0 - max_dod) * 100.0, 1)
    usable_batt_wh = batt_wh * max_dod
    darkness_survival_h = usable_batt_wh / max(night_w, 1.0)

    surf_samples = [
        s for s in samples
        if s.get("t") is not None and surface_start_s <= float(s["t"]) <= surface_end_s
    ]
    if not surf_samples:
        surf_samples = samples[-8:] if samples else []

    if len(surf_samples) >= 2:
        dt_h = max(0.25, (float(surf_samples[-1]["t"]) - float(surf_samples[0]["t"])) / 3600.0 / max(len(surf_samples) - 1, 1))
    else:
        dt_h = 3.0

    requested_hours = max((surface_end_s - surface_start_s) / 3600.0, 24.0)
    # Required baseline science window before end-of-lunar-day shutdown (default 65% of nominal surface span, e.g., ~218h for 14d)
    min_science_hours = requested_hours * min_sun_frac

    # Identify the last sunlit sample index to distinguish mid-mission terrain eclipses from final lunar night sunset
    vis_flags = []
    for s in surf_samples:
        sun_el = float(s.get("sunElevationDeg", 0.0))
        sun_az = float(s.get("sunAzimuthDeg", 0.0))
        sun_mask = float(horizon_fn(sun_az)) if horizon_fn else 0.0
        vis_flags.append(bool(s.get("sunVisible", sun_el > sun_mask)))
    last_sunlit_idx = max((i for i, v in enumerate(vis_flags) if v), default=-1)

    soc_wh = batt_wh  # touchdown at 100% charged battery
    min_soc_wh = batt_wh
    min_active_soc_wh = batt_wh
    gen_wh = 0.0
    req_wh = 0.0
    active_req_wh = 0.0
    sunlit_h = 0.0
    dark_h = 0.0
    cur_dark_h = 0.0
    max_dark_h = 0.0
    max_active_dark_h = 0.0
    brownout_h = 0.0
    depleted_h = 0.0
    power_pos_count = 0
    golden_count = 0
    peak_solar_w = 0.0

    series = []
    for idx, s in enumerate(surf_samples):
        sun_el = float(s.get("sunElevationDeg", 0.0))
        sun_az = float(s.get("sunAzimuthDeg", 0.0))
        earth_el = float(s.get("earthElevationDeg", 0.0))
        earth_az = float(s.get("earthAzimuthDeg", 0.0))
        sun_mask = float(horizon_fn(sun_az)) if horizon_fn else 0.0
        earth_mask = float(horizon_fn(earth_az)) if horizon_fn else 0.0
        sun_vis = vis_flags[idx]
        earth_vis = bool(s.get("earthVisible", earth_el > earth_mask))

        t_rel_h = round((float(s.get("t", surface_start_s)) - surface_start_s) / 3600.0, 1)
        # A sample is within the mandatory active operations window if it is before final sunset OR before min_science_hours
        in_active_ops = (idx <= last_sunlit_idx) or (t_rel_h <= min_science_hours)

        inc = _incidence_factor(sun_el, sun_vis, power_type)
        p_solar = round(area_m2 * eff * SOLAR_CONSTANT_WM2 * inc * 0.92, 1) if power_type == "solar" else 0.0
        p_load = round(op_load_w if sun_vis else night_w, 1)
        p_net = round(p_solar - p_load, 1)
        peak_solar_w = max(peak_solar_w, p_solar)

        if idx > 0:
            gen_wh += p_solar * dt_h
            req_wh += p_load * dt_h
            if in_active_ops:
                active_req_wh += p_load * dt_h
            if p_net >= 0:
                soc_wh = min(batt_wh, soc_wh + p_net * dt_h * 0.92)
            else:
                soc_wh = max(0.0, soc_wh + (p_net * dt_h) / 0.95)
            if sun_vis:
                sunlit_h += dt_h
                cur_dark_h = 0.0
            else:
                dark_h += dt_h
                cur_dark_h += dt_h
                max_dark_h = max(max_dark_h, cur_dark_h)
                if in_active_ops:
                    max_active_dark_h = max(max_active_dark_h, cur_dark_h)

        min_soc_wh = min(min_soc_wh, soc_wh)
        if in_active_ops:
            min_active_soc_wh = min(min_active_soc_wh, soc_wh)
        soc_pct = round((soc_wh / max(batt_wh, 1.0)) * 100.0, 1)
        if idx > 0 and in_active_ops and soc_pct < min_safe_soc_pct:
            brownout_h += dt_h
        if idx > 0 and in_active_ops and soc_wh <= 1.0:
            depleted_h += dt_h
        if p_solar >= p_load or (power_type == "battery" and soc_pct >= min_safe_soc_pct):
            power_pos_count += 1

        sun_clear = sun_el - sun_mask
        earth_clear = earth_el - earth_mask
        is_golden = (
            sun_vis
            and sun_clear >= 1.0
            and soc_pct >= min_safe_soc_pct
            and (earth_vis and earth_clear >= 1.0)
        )
        if is_golden:
            golden_count += 1

        series.append({
            "tHours": t_rel_h,
            "utc": s.get("utc", ""),
            "sunElevationDeg": round(sun_el, 2),
            "sunClearanceDeg": round(sun_clear, 2),
            "earthElevationDeg": round(earth_el, 2),
            "earthClearanceDeg": round(earth_clear, 2),
            "sunVisible": sun_vis,
            "earthVisible": earth_vis,
            "solarPowerW": p_solar,
            "loadPowerW": p_load,
            "netPowerW": p_net,
            "socWh": round(soc_wh, 1),
            "socPct": soc_pct,
            "goldenActive": is_golden,
        })

    n_pts = max(len(series), 1)
    # minSocPct and maxContinuousDarknessHours reflect the active operational window (including any shortfall below min_science_hours)
    min_soc_pct = round((min_active_soc_wh / max(batt_wh, 1.0)) * 100.0, 1)
    full_window_min_soc_pct = round((min_soc_wh / max(batt_wh, 1.0)) * 100.0, 1)
    energy_margin_wh = round(gen_wh + usable_batt_wh - active_req_wh, 1) if power_type == "battery" else round(gen_wh - active_req_wh, 1)
    energy_ratio = round((gen_wh + (usable_batt_wh if power_type == "battery" else 0.0)) / max(active_req_wh, 1.0), 2)
    survives_darkness = max_active_dark_h <= darkness_survival_h and depleted_h == 0.0
    power_feasible = min_soc_pct >= min_safe_soc_pct and survives_darkness and sunlit_h >= min_science_hours

    return {
        "powerType": power_type,
        "parameters": {
            "solarPanelAreaM2": round(area_m2, 2),
            "panelEfficiency": round(eff, 3),
            "solarIrradianceWm2": SOLAR_CONSTANT_WM2,
            "batteryCapacityWh": round(batt_wh, 0),
            "usableBatteryWh": round(usable_batt_wh, 0),
            "maxDod": round(max_dod, 2),
            "minSafeSocPct": min_safe_soc_pct,
            "baseLoadW": round(base_w, 1),
            "payloadLoadW": round(payload_w, 1),
            "operationalLoadW": round(op_load_w, 1),
            "nightSurvivalLoadW": round(night_w, 1),
        },
        "summary": {
            "generatedWh": round(gen_wh, 0),
            "generatedKwh": round(gen_wh / 1000.0, 2),
            "requiredWh": round(active_req_wh, 0),
            "requiredKwh": round(active_req_wh / 1000.0, 2),
            "fullCalendarRequiredKwh": round(req_wh / 1000.0, 2),
            "energyMarginWh": round(energy_margin_wh, 0),
            "energyMarginKwh": round(energy_margin_wh / 1000.0, 2),
            "energyBalanceRatio": energy_ratio,
            "peakSolarPowerW": round(peak_solar_w, 1),
            "meanSolarPowerW": round(gen_wh / max(sunlit_h + dark_h, 1.0), 1),
            "meanLoadPowerW": round(active_req_wh / max(sunlit_h + max_active_dark_h, 1.0), 1),
            "minSocWh": round(min_active_soc_wh, 1),
            "minSocPct": min_soc_pct,
            "endOfCalendarSocPct": full_window_min_soc_pct,
            "endSocPct": series[-1]["socPct"] if series else 100.0,
            "sunlitHours": round(sunlit_h, 1),
            "darknessHours": round(dark_h, 1),
            "maxContinuousDarknessHours": round(max_active_dark_h, 1),
            "totalCalendarDarknessHours": round(max_dark_h, 1),
            "darknessSurvivalHours": round(darkness_survival_h, 1),
            "brownoutHours": round(brownout_h, 1),
            "depletedHours": round(depleted_h, 1),
            "survivesDarkness": survives_darkness,
            "powerFeasible": power_feasible,
            "powerPositiveFraction": round(power_pos_count / n_pts, 3),
            "goldenWindowFraction": round(golden_count / n_pts, 3),
        },
        "formulaNote": "E_generated = ∫ P_solar(t) dt where P_solar = A_panel · η_panel · I_0 · η_inc(θ_sun) · η_mppt (0 when terrain-masked); E_required = ∫ P_load(t) dt over active science ops; SOC clamped to [0, C_batt].",
        "series": series,
    }


def compute_golden_windows(
    power_budget: dict,
    ephem_windows: list[dict],
    requested_surface_days: float,
    relay_enabled: bool = False,
) -> dict:
    """Identify contiguous Golden Mission Window intervals in the current timeline and rank candidate sunrise windows."""
    series = power_budget.get("series", [])
    min_safe_soc = power_budget["parameters"]["minSafeSocPct"]
    dark_surv_h = power_budget["summary"]["darknessSurvivalHours"]
    req_hours = max(requested_surface_days * 24.0, 24.0)

    intervals = []
    cur = None
    for pt in series:
        comm_ok = (pt["earthVisible"] and pt["earthClearanceDeg"] >= 1.0) or relay_enabled
        active = pt["sunVisible"] and pt["sunClearanceDeg"] >= 1.0 and pt["socPct"] >= min_safe_soc and comm_ok
        if active:
            if cur is None:
                cur = {
                    "startUtc": pt["utc"],
                    "endUtc": pt["utc"],
                    "startHours": pt["tHours"],
                    "endHours": pt["tHours"],
                    "sunSum": pt["sunElevationDeg"],
                    "earthSum": pt["earthElevationDeg"],
                    "powerSum": pt["solarPowerW"],
                    "minSocPct": pt["socPct"],
                    "count": 1,
                }
            else:
                cur["endUtc"] = pt["utc"]
                cur["endHours"] = pt["tHours"]
                cur["sunSum"] += pt["sunElevationDeg"]
                cur["earthSum"] += pt["earthElevationDeg"]
                cur["powerSum"] += pt["solarPowerW"]
                cur["minSocPct"] = min(cur["minSocPct"], pt["socPct"])
                cur["count"] += 1
        else:
            if cur is not None:
                dur = round(max(cur["endHours"] - cur["startHours"], 2.0), 1)
                c = cur["count"]
                intervals.append({
                    "startUtc": cur["startUtc"],
                    "endUtc": cur["endUtc"],
                    "durationHours": dur,
                    "durationDays": round(dur / 24.0, 2),
                    "meanSunElevationDeg": round(cur["sunSum"] / c, 1),
                    "meanEarthElevationDeg": round(cur["earthSum"] / c, 1),
                    "meanSolarPowerW": round(cur["powerSum"] / c, 1),
                    "minSocPct": round(cur["minSocPct"], 1),
                })
                cur = None
    if cur is not None:
        dur = round(max(cur["endHours"] - cur["startHours"], 2.0), 1)
        c = cur["count"]
        intervals.append({
            "startUtc": cur["startUtc"],
            "endUtc": cur["endUtc"],
            "durationHours": dur,
            "durationDays": round(dur / 24.0, 2),
            "meanSunElevationDeg": round(cur["sunSum"] / c, 1),
            "meanEarthElevationDeg": round(cur["earthSum"] / c, 1),
            "meanSolarPowerW": round(cur["powerSum"] / c, 1),
            "minSocPct": round(cur["minSocPct"], 1),
        })

    total_golden_h = round(sum(iv["durationHours"] for iv in intervals), 1)
    longest_golden_h = round(max((iv["durationHours"] for iv in intervals), default=0.0), 1)

    ranked_windows = []
    for w in ephem_windows:
        sun_h = float(w.get("sunlitHoursAfter", 0.0))
        cont_h = float(w.get("continuousSunlitHoursAfter", sun_h))
        # Mid-mission darkness is any gap between continuous sunlight and total 14d sunlit hours
        mid_dark = max(0.0, min(float(w.get("maxDarknessHours14d", 0.0)), req_hours * 0.70 - cont_h))
        earth_vis = float(w.get("earthVisibleFraction14d", 1.0 if w.get("earthElevationMinDeg14d", 0.0) > 0 else 0.0))
        sun_ok = bool(w.get("sunVisible", True))
        earth_ok = earth_vis >= 0.5 or relay_enabled
        dark_ok = mid_dark <= dark_surv_h and cont_h >= 0.65 * req_hours

        solar_score = min(1.0, cont_h / req_hours) * 45.0
        comm_score = (min(1.0, earth_vis / 0.85) if not relay_enabled else 0.9) * 25.0
        thermal_score = (1.0 if dark_ok else max(0.0, 1.0 - max(0.0, mid_dark - dark_surv_h) / 24.0)) * 20.0
        clearance_score = min(1.0, max(0.0, float(w.get("peakSunElevationDeg", 10.0)) - 2.0) / 18.0) * 10.0
        score = round(solar_score + comm_score + thermal_score + clearance_score, 1)
        feasible = sun_ok and (cont_h >= 0.65 * req_hours) and earth_ok and dark_ok

        ranked_windows.append({
            **w,
            "goldenScore": score,
            "goldenFeasible": feasible,
            "powerSurvives14d": dark_ok,
            "commsFeasible": earth_ok,
            "summary": (
                f"Golden score {score:.0f}/100 · {cont_h/24.0:.1f} d continuous sunlight · "
                f"Earth visible {earth_vis*100:.0f}% · active dark {mid_dark:.0f} h (limit {dark_surv_h:.0f} h)"
            ),
        })

    best_window = max(ranked_windows, key=lambda x: (x["goldenFeasible"], x["goldenScore"]), default=None)

    return {
        "totalGoldenHours": total_golden_h,
        "totalGoldenDays": round(total_golden_h / 24.0, 2),
        "longestGoldenHours": longest_golden_h,
        "longestGoldenDays": round(longest_golden_h / 24.0, 2),
        "overlapFraction": round(total_golden_h / req_hours, 3),
        "intervals": intervals,
        "candidateWindows": ranked_windows,
        "bestWindowUtc": best_window["utc"] if best_window else None,
        "bestWindowScore": best_window["goldenScore"] if best_window else None,
        "dsnNote": "Earth visibility is terrain-masked geometric line-of-sight; operational downlink also depends on NASA Deep Space Network (DSN) / commercial ground-station scheduling and link margin.",
    }
