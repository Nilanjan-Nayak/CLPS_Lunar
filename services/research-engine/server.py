"""Research-engine HTTP service (stdlib only; numpy/PIL/scikit-learn for the maths).

Consumed exclusively by the Fastify API (proxied under /api/v1/research/*) — the browser never talks to it directly.
  GET  /health            GET /missions (historical catalogue + sources)   GET /model (metrics, coefficients, caveats)
  GET  /features          GET /options (lander / launch-vehicle / transfer presets)
  GET  /terrain?lat&lon   GET /grid?lat&lon&halfKm&n   GET /horizon?lat&lon   GET /ephemeris?lat&lon&utc   GET /windows?lat&lon&from&count&target
  POST /plan {latitude, longitude, landerId, ...}       → mission calculation + power + golden windows + constraints + descent + outcome model
  POST /resilience {latitude, longitude, landerId, ...} → schedule-delay simulator + MRI + recovery windows + recommendations + confidence report
  POST /optimize {latitude, longitude, landerId, ...}   → multi-site/date evaluator + non-dominated Pareto frontier
  POST /batch {scenarios: [...]}                        → batch scenario evaluation (up to 12 scenarios)
  POST /report {latitude, longitude, landerId, ...}     → unified Mission Decision & Confidence Report (plan + resilience + Pareto alternatives)
  POST /journey {spec} | {planInput, launchSite}        → Earth-launch → Moon-landing route (event-anchored two-body model)"""
import json, sys, traceback
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, str(Path(__file__).parent))
from engine import dem, dem_polar, ephem, horizons, journey, model, mission, power, resilience, rescheduler, site_search
from engine.landers import LANDERS, LAUNCH_VEHICLES, TRANSFERS

HERE = Path(__file__).parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
SOURCES = json.loads((HERE / "dataset" / "sources.json").read_text())
# Curated comparison coordinates are backend data, never a CLPS database in React.
CHALLENGE_SITES = json.loads((HERE / "dataset" / "challenge_sites.json").read_text())["sites"]


_PLAN_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_RESILIENCE_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_OPTIMIZE_CACHE: "OrderedDict[str, dict]" = OrderedDict()


def _plan_cached(inp: dict) -> dict:
    key = json.dumps(inp, sort_keys=True)
    if key in _PLAN_CACHE:
        _PLAN_CACHE.move_to_end(key)
        return _PLAN_CACHE[key]
    res = mission.plan(inp)
    _PLAN_CACHE[key] = res
    while len(_PLAN_CACHE) > 24:
        _PLAN_CACHE.popitem(last=False)
    return res


def _resilience_cached(inp: dict) -> dict:
    key = json.dumps(inp, sort_keys=True)
    if key in _RESILIENCE_CACHE:
        _RESILIENCE_CACHE.move_to_end(key)
        return _RESILIENCE_CACHE[key]
    base_plan = _plan_cached(inp)
    res = resilience.simulate_resilience(inp, base_plan)
    _RESILIENCE_CACHE[key] = res
    while len(_RESILIENCE_CACHE) > 24:
        _RESILIENCE_CACHE.popitem(last=False)
    return res


def _optimize_cached(inp: dict) -> dict:
    key = json.dumps(inp, sort_keys=True)
    if key in _OPTIMIZE_CACHE:
        _OPTIMIZE_CACHE.move_to_end(key)
        return _OPTIMIZE_CACHE[key]
    res = site_search.optimize_sites(inp)
    _OPTIMIZE_CACHE[key] = res
    while len(_OPTIMIZE_CACHE) > 16:
        _OPTIMIZE_CACHE.popitem(last=False)
    return res


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("research-engine %s\n" % (fmt % args))

    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == "/health":
                m = model.load_model()
                return self._send(200, {"ok": True, "model": {"version": m["version"], "n": m["n"], "trainedAt": m["trainedAt"]}, "dem": dem.source()})
            if u.path == "/missions":
                cat = json.loads((HERE / "dataset" / "lunar_missions.json").read_text())
                return self._send(200, {**cat, "sources": SOURCES})
            if u.path == "/model":
                return self._send(200, model.load_model())
            if u.path == "/features":
                return self._send(200, model.load_features())
            if u.path == "/options":
                return self._send(200, {"landers": LANDERS, "launchVehicles": LAUNCH_VEHICLES, "transfers": TRANSFERS,
                                        "defaultCandidateSites": site_search.DEFAULT_CANDIDATE_SITES, "challengeSites": CHALLENGE_SITES})
            if u.path == "/terrain":
                lat, lon = dem.validate_coords(float(q["lat"]), float(q["lon"]))
                return self._send(200, dem.terrain_features(lat, lon))
            if u.path == "/ephemeris":
                lat, lon = dem.validate_coords(float(q["lat"]), float(q["lon"]))
                return self._send(200, ephem.site_geometry(q.get("utc") or __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), lat, lon))
            if u.path == "/horizons":
                if not all(q.get(k) for k in ("lat", "lon", "utc")):
                    raise ValueError("lat, lon and utc are required for a Horizons comparison")
                return self._send(200, horizons.compare_site(float(q["lat"]), float(q["lon"]), q["utc"], int(q.get("days", "14"))))
            if u.path == "/windows":
                lat, lon = dem.validate_coords(float(q["lat"]), float(q["lon"]))
                hz, hfn = dem.best_horizon(lat, lon)
                target = round(float(q["target"]) if "target" in q else min(7.0, max(1.0, min(90.0, 90.0 - abs(lat) + 1.54) - 2.0)), 2)
                count = min(max(int(q.get("count", 6)), 1), 16)
                return self._send(200, {
                    "windows": ephem.landing_windows(lat, lon, q.get("from") or __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), count, target, horizon_fn=hfn),
                    "terrainMasked": True,
                    "horizonGrade": hz.get("grade", "regional"),
                    "targetSunElevationDeg": target,
                    "validation": ephem.VALIDATION_INFO,
                })
            if u.path == "/horizon":
                lat, lon = dem.validate_coords(float(q["lat"]), float(q["lon"]))
                hz, _ = dem.best_horizon(lat, lon)
                return self._send(200, hz)
            if u.path == "/grid":
                lat, lon = dem.validate_coords(float(q["lat"]), float(q["lon"]))
                return self._send(200, dem.analysis_grid(lat, lon, float(q["halfKm"]) if "halfKm" in q else None, int(q.get("n", 32))))
            return self._send(404, {"error": "not found"})
        except ValueError as ve:
            return self._send(400, {"error": str(ve)})
        except horizons.HorizonsUnavailable as exc:
            return self._send(503, {"error": str(exc), "source": "NASA/JPL Horizons", "localPlanningAvailable": True})
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return self._send(500, {"error": str(e)})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            if u.path == "/plan":
                if "latitude" not in body or "longitude" not in body:
                    return self._send(400, {"error": "latitude and longitude are required"})
                return self._send(200, _plan_cached(body))
            if u.path == "/resilience":
                if "latitude" not in body or "longitude" not in body:
                    return self._send(400, {"error": "latitude and longitude are required"})
                return self._send(200, _resilience_cached(body))
            if u.path == "/optimize":
                return self._send(200, _optimize_cached(body))
            if u.path == "/batch":
                scenarios = body.get("scenarios")
                if not isinstance(scenarios, list) or not scenarios:
                    return self._send(400, {"error": "scenarios (non-empty list of plan inputs) is required"})
                results = []
                for idx, sc in enumerate(scenarios[:12]):
                    if "latitude" not in sc or "longitude" not in sc:
                        raise ValueError(f"scenario[{idx}] requires latitude and longitude")
                    p = _plan_cached(sc)
                    results.append({
                        "index": idx,
                        "label": sc.get("label") or p["summaryCard"]["landingSite"],
                        "input": p["input"],
                        "landingUtc": p["ephemeris"]["calendar"]["landingUtc"],
                        "viabilityScore": p["viabilityScore"],
                        "propellantMarginKg": p["budget"]["mass"]["propellantMarginKg"],
                        "slopeDeg": p["site"]["terrain"]["slopeDeg"],
                        "sunlitFraction": p["site"]["comms"]["sunlitFraction"],
                        "earthVisibleFraction": p["site"]["comms"]["earthVisibleFraction"],
                        "powerSummary": p["powerBudget"]["summary"],
                        "constraints": p["constraints"],
                        "feasible": all(c["status"] != "fail" or not c["hard"] for c in p["constraints"]),
                    })
                return self._send(200, {"kind": "batch", "count": len(results), "results": results})
            if u.path == "/report":
                if "latitude" not in body or "longitude" not in body:
                    return self._send(400, {"error": "latitude and longitude are required"})
                p = _plan_cached(body)
                r = _resilience_cached(body)
                opt = _optimize_cached(body)
                return self._send(200, {
                    "kind": "decision_report",
                    "generatedAtUtc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "plan": p,
                    "resilience": r,
                    "optimization": opt,
                })
            if u.path == "/journey":
                if body.get("spec"):
                    return self._send(200, journey.build(body["spec"]))
                if body.get("planInput"):
                    if "latitude" not in body["planInput"] or "longitude" not in body["planInput"]:
                        return self._send(400, {"error": "planInput.latitude/longitude are required"})
                    site = body.get("launchSite") or {"id": "ksc-lc-39a", "name": "Kennedy Space Center LC-39A", "latitude": 28.6083, "longitude": -80.6041, "altitudeM": 3}
                    plan = _plan_cached(body["planInput"])
                    return self._send(200, journey.build(journey.spec_from_plan(plan, site)))
                return self._send(400, {"error": "spec or planInput required"})
            if u.path == "/train":
                return self._send(200, model.train())
            return self._send(404, {"error": "not found"})
        except ValueError as ve:
            return self._send(400, {"error": str(ve)})
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return self._send(500, {"error": str(e)})


if __name__ == "__main__":
    model.load_model()  # trains on first start if model/model.json is missing
    print(f"research-engine listening on 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
