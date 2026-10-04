"""Research-engine HTTP service (stdlib only; numpy/PIL/scikit-learn for the maths).

Consumed exclusively by the Fastify API (proxied under /api/v1/research/*) — the browser never talks to it directly.
  GET  /health            GET /missions (historical catalogue + sources)   GET /model (metrics, coefficients, caveats)
  GET  /features          GET /options (lander / launch-vehicle / transfer presets)
  GET  /terrain?lat&lon   GET /grid?lat&lon&halfKm&n   GET /horizon?lat&lon   GET /ephemeris?lat&lon&utc   GET /windows?lat&lon&from&count&target
  POST /plan {latitude, longitude, landerId, ...}  → mission calculation + descent simulation + outcome model
  POST /journey {spec} | {planInput, launchSite}     → Earth-launch → Moon-landing route (event-anchored two-body model)"""
import json, sys, traceback
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, str(Path(__file__).parent))
from engine import dem, dem_polar, ephem, journey, model, mission
from engine.landers import LANDERS, LAUNCH_VEHICLES, TRANSFERS

HERE = Path(__file__).parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
SOURCES = json.loads((HERE / "dataset" / "sources.json").read_text())


_PLAN_CACHE: "OrderedDict[str, dict]" = OrderedDict()


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
                return self._send(200, {"landers": LANDERS, "launchVehicles": LAUNCH_VEHICLES, "transfers": TRANSFERS})
            if u.path == "/terrain":
                return self._send(200, dem.terrain_features(float(q["lat"]), float(q["lon"])))
            if u.path == "/ephemeris":
                return self._send(200, ephem.site_geometry(q.get("utc") or __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), float(q["lat"]), float(q["lon"])))
            if u.path == "/windows":
                lat = float(q["lat"]); lon = float(q["lon"]); fine = dem_polar.finest_for(lat)
                hfn = dem_polar.horizon_fn(fine.horizon(lat, lon)) if fine else None
                target = round(float(q["target"]) if "target" in q else min(7.0, max(1.0, min(90.0, 90.0 - abs(lat) + 1.54) - 2.0)), 2)
                return self._send(200, {"windows": ephem.landing_windows(lat, lon, q.get("from") or __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), int(q.get("count", 6)), target, horizon_fn=hfn), "terrainMasked": fine is not None, "targetSunElevationDeg": target})
            if u.path == "/horizon":
                lat = float(q["lat"]); lon = float(q["lon"]); fine = dem_polar.finest_for(lat)
                return self._send(200, fine.horizon(lat, lon) if fine else {"error": "no science-grade DEM for this latitude (polar products cover |lat| ≥ 75°)"})
            if u.path == "/grid":
                return self._send(200, dem.analysis_grid(float(q["lat"]), float(q["lon"]), float(q["halfKm"]) if "halfKm" in q else None, int(q.get("n", 32))))
            return self._send(404, {"error": "not found"})
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
            if u.path == "/journey":
                # {"spec": {...}}  → reconstruct/project a mission route from its published anchors
                # {"planInput": {...}, "launchSite": {...}} → route for a user plan (plan result re-used from the cache)
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
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return self._send(500, {"error": str(e)})


if __name__ == "__main__":
    model.load_model()  # trains on first start if model/model.json is missing
    print(f"research-engine listening on 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
