"""Recovery Window & Schedule Rescheduler (Feature 1 & Feature 3).

When a launch/landing slip causes illumination, power, or communication constraints to fail,
searches forward in time for the next feasible landing windows where all hard constraints pass."""
from __future__ import annotations
from datetime import timedelta
from . import ephem


def find_recovery_windows(
    lat: float,
    lon: float,
    from_iso: str,
    target_sun_deg: float,
    horizon_fn,
    evaluate_epoch_fn,
    search_days: int = 65,
    max_candidates: int = 6,
) -> dict:
    """Search forward from `from_iso` for terrain-masked sunrise windows and fine-grained recovery dates,
    evaluating each candidate with the full power + constraint engine (`evaluate_epoch_fn`)."""
    base_dt = ephem.parse_utc(from_iso)
    # 1. Start with terrain-masked sunrise crossings over the next ~2-3 synodic months
    raw_windows = ephem.landing_windows(
        lat,
        lon,
        from_iso,
        count=max_candidates,
        target_elev_deg=target_sun_deg,
        horizon_fn=horizon_fn,
    )
    candidates = []
    seen_utc = set()

    for idx, w in enumerate(raw_windows):
        dt = ephem.parse_utc(w["utc"])
        # Also test +12 h and +24 h after sunrise crossing in case slightly higher Sun improves power margin
        for offset_h in (0.0, 12.0, 24.0):
            cand_dt = dt + timedelta(hours=offset_h)
            utc_s = cand_dt.strftime("%Y-%m-%dT%H:%MZ")
            if utc_s in seen_utc:
                continue
            seen_utc.add(utc_s)
            delay_d = round((cand_dt - base_dt).total_seconds() / 86400.0, 2)
            ev = evaluate_epoch_fn(cand_dt, delay_d, f"Recovery #{idx + 1}" + (f" (+{int(offset_h)}h)" if offset_h else ""))
            candidates.append({
                "rank": 0,
                "landingUtc": utc_s,
                "surfaceEndUtc": ev["surfaceEndUtc"],
                "shiftFromBaselineDays": delay_d,
                "feasible": ev["feasible"],
                "resultStatus": ev["resultStatus"],
                "viabilityScore": ev["viabilityScore"],
                "sunElevationAtLandingDeg": ev["sunElevationAtLandingDeg"],
                "sunClearanceAtLandingDeg": ev["sunClearanceAtLandingDeg"],
                "sunlitFraction": ev["sunlitFraction"],
                "sunlitHours": ev["sunlitHours"],
                "earthVisibleFraction": ev["earthVisibleFraction"],
                "minSocPct": ev["power"]["minSocPct"],
                "energyMarginKwh": ev["power"]["energyMarginKwh"],
                "maxContinuousDarknessHours": ev["power"]["maxContinuousDarknessHours"],
                "failedHardConstraints": ev["failedHardConstraints"],
                "warnConstraints": ev["warnConstraints"],
            })

    # Sort: feasible first, then highest viabilityScore, then earliest shift
    candidates.sort(key=lambda c: (not c["feasible"], -c["viabilityScore"], abs(c["shiftFromBaselineDays"])))
    for i, c in enumerate(candidates):
        c["rank"] = i + 1

    feasible_cands = [c for c in candidates if c["feasible"]]
    # Earliest feasible recovery strictly after baseline (+0.5 d) if baseline or delayed scenario failed
    future_feasible = [c for c in feasible_cands if c["shiftFromBaselineDays"] >= 0.5]
    best_recovery = future_feasible[0] if future_feasible else (feasible_cands[0] if feasible_cands else (candidates[0] if candidates else None))

    return {
        "searchedDays": search_days,
        "testedRecoveryCandidates": len(candidates),
        "feasibleRecoveryCandidates": len(feasible_cands),
        "bestRecovery": best_recovery,
        "candidates": candidates[:8],
    }
