"""Scientific & engineering unit tests for the SELENARA X Mission Intelligence Layer."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from engine import dem, ephem, mission, power, resilience, rescheduler, site_search


def test_coordinate_and_grid_validation():
    la, lo = dem.validate_coords(-84.79, 29.2)
    assert la == -84.79 and lo == 29.2
    for bad in [(95.0, 0.0), (-91.0, 0.0), (0.0, 185.0), (0.0, -181.0), (float("nan"), 0.0)]:
        try:
            dem.validate_coords(*bad)
            raise AssertionError(f"Expected ValueError for {bad}")
        except ValueError:
            pass
    g = dem.analysis_grid(0.0, 0.0, half_km=9999.0, n=500)
    assert g["rows"] == 64 and g["cols"] == 64 and g["halfKm"] == 200.0
    print("PASS  coordinate & grid validation")


def test_terrain_masked_windows_and_360_horizon():
    # Polar site (Mons Mouton, LOLA GDR 240 m)
    hz_pol, hfn_pol = dem.best_horizon(-84.79, 29.2)
    assert len(hz_pol["elevationDeg"]) == 36
    assert hz_pol["grade"].startswith("science")
    wins = ephem.landing_windows(-84.79, 29.2, "2026-10-01T00:00:00Z", count=3, target_elev_deg=4.5, horizon_fn=hfn_pol)
    assert len(wins) == 3
    for w in wins:
        assert w["sunVisible"] is True, f"Sunrise window reported while Sun blocked: {w}"
        assert w["sunClearanceDeg"] >= 0.4, f"Expected positive terrain clearance at crossing: {w}"
        assert "earthVisibleFraction14d" in w and 0.0 <= w["earthVisibleFraction14d"] <= 1.0
        assert "earthClearanceMinDeg14d" in w

    # Non-polar site (Mare Crisium, regional 16 px/deg DEM)
    hz_eq, _ = dem.best_horizon(18.56, 61.81)
    assert len(hz_eq["elevationDeg"]) == 36
    assert hz_eq["grade"].startswith("regional")
    print("PASS  terrain-masked landing windows & 360° horizon (polar + equatorial)")


def test_power_budget_and_golden_windows():
    p = mission.plan({"latitude": 18.56, "longitude": 61.81, "landerId": "blue-ghost", "surfaceDays": 14})
    pb = p["powerBudget"]
    gw = p["goldenWindows"]
    assert pb["summary"]["generatedKwh"] > 0
    assert pb["summary"]["requiredKwh"] > 0
    assert 0.0 <= pb["summary"]["minSocPct"] <= 100.0
    assert gw["totalGoldenHours"] > 200.0
    assert len(gw["candidateWindows"]) >= 3
    assert "validation" in p["ephemeris"] and len(p["ephemeris"]["validation"]["testedEpochsUtc"]) == 3
    print("PASS  power budget, golden windows & ephemeris validation metadata")


def test_resilience_mri_and_recovery():
    inp = {"latitude": -84.79, "longitude": 29.2, "landerId": "nova-c", "surfaceDays": 14}
    p = mission.plan(inp)
    r = resilience.simulate_resilience(inp, p)
    assert r["kind"] == "resilience"
    assert len(r["scenarios"]) == 10
    assert 0.0 <= r["mri"]["score"] <= 100.0
    # Baseline (0d) should be feasible; +7d and +14d should violate constraints
    s0 = next(s for s in r["scenarios"] if s["delayDays"] == 0)
    s7 = next(s for s in r["scenarios"] if s["delayDays"] == 7)
    s14 = next(s for s in r["scenarios"] if s["delayDays"] == 14)
    assert s0["feasible"] is True
    assert s7["feasible"] is False and len(s7["failedHardConstraints"]) >= 1
    assert s14["feasible"] is False
    assert r["recovery"]["bestRecovery"] is not None
    assert r["recovery"]["bestRecovery"]["feasible"] is True
    assert len(r["confidence"]["domains"]) == 5
    print(f"PASS  schedule-delay simulator (MRI={r['mri']['score']}, recovery={r['recovery']['bestRecovery']['landingUtc']})")


def test_pareto_site_optimization():
    opt = site_search.optimize_sites({"latitude": -84.79, "longitude": 29.2, "landerId": "nova-c", "surfaceDays": 14})
    assert opt["totalCandidates"] >= 10
    assert opt["paretoFrontierCount"] >= 2
    front = [c for c in opt["candidates"] if c["paretoOptimal"]]
    for c in front:
        assert c["paretoRank"] == 1
        assert c["feasible"] is True
        assert c["dominatedBy"] == []
    print(f"PASS  multi-site Pareto optimization ({opt['paretoFrontierCount']} Rank-1 frontier sites)")


if __name__ == "__main__":
    test_coordinate_and_grid_validation()
    test_terrain_masked_windows_and_360_horizon()
    test_power_budget_and_golden_windows()
    test_resilience_mri_and_recovery()
    test_pareto_site_optimization()
    print("\nall intelligence tests passed")
