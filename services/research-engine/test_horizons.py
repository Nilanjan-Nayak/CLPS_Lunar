"""Offline tests for the on-demand Horizons comparison (no fabricated data used by the app)."""
import http.client
import json
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import URLError

from engine import horizons


class HorizonsTests(unittest.TestCase):
    def setUp(self):
        horizons._compare_cached.cache_clear()

    def test_csv_parser_with_synthetic_fixture(self):
        # Test-only synthetic rows: the production parser accepts real Horizons CSV exclusively.
        fixture = {"result": "Target body name: Sun (10) {source: DE441}\n$$SOE\n"
                   " 2026-Sep-28 12:00:00.000, 2461312.000000000,*,i, 303.874143506, 3.835280745,\n"
                   " 2026-Sep-28 18:00:00.000, 2461312.250000000, , , 301.0, -0.5,\n$$EOE\n"}
        rows, version = horizons._parse_horizons(fixture)
        self.assertEqual(version, "DE441")
        self.assertEqual(rows[0]["utc"], "2026-09-28T12:00:00Z")
        self.assertAlmostEqual(rows[0]["azimuthDeg"], 303.874143506)
        self.assertEqual(rows[1]["elevationDeg"], -0.5)
        with self.assertRaises(horizons.HorizonsUnavailable):
            horizons._parse_horizons({"result": "error without ephemeris"})
        with self.assertRaises(horizons.HorizonsUnavailable):
            horizons._parse_horizons({"error": "bad input"})

    def test_interpolated_positive_intervals_and_overlap(self):
        self.assertEqual(horizons._positive_interval(-1, -3), None)
        self.assertEqual(horizons._positive_interval(1, 1), (0.0, 1.0))
        self.assertEqual(horizons._positive_interval(1, -1), (0.0, 0.5))
        self.assertEqual(horizons._positive_interval(-1, 1), (0.5, 1.0))
        self.assertEqual(horizons._overlap((0.0, 0.75), (0.5, 1.0)), 0.25)
        self.assertEqual(horizons._overlap((0.0, 0.5), (0.5, 1.0)), 0.0)

    def test_full_comparison_uses_each_body_and_terrain_horizon(self):
        start = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)
        sun_elevations = [1, -1, -1, 1, 1]
        earth_elevations = [-1, 1, 1, -1, -1]
        calls = []

        def fake_fetch(body, lat, lon, altitude, date0, date1):
            calls.append((body, lat, lon, altitude, date0, date1))
            elevations = sun_elevations if body == "10" else earth_elevations
            return ([{"utc": horizons._iso(start + timedelta(hours=6 * i)),
                      "jd": 2440587.5 + (start + timedelta(hours=6 * i)).timestamp() / 86400,
                      "azimuthDeg": 20.0 if body == "10" else 40.0, "elevationDeg": el}
                     for i, el in enumerate(elevations)], "DE441-test-fixture")

        with patch.object(horizons.dem, "terrain_features", return_value={"elevationM": 125}), \
             patch.object(horizons.dem, "best_horizon", return_value=({"grade": "test", "resolutionM": 240, "dataSource": "test fixture", "maxKm": 60}, lambda az: 0.0)), \
             patch.object(horizons.ephem, "site_geometry", return_value={"sunAzimuthDeg": 20.1, "sunElevationDeg": 1.2, "earthAzimuthDeg": 39.9, "earthElevationDeg": -1.2}), \
             patch.object(horizons, "_fetch", side_effect=fake_fetch):
            result = horizons.compare_site(-84.79, 29.2, "2026-09-28T12:00:00Z", 1)
            cached = horizons.compare_site(-84.79, 29.2, "2026-09-28T12:00:00Z", 1)
        self.assertIs(result, cached)
        self.assertEqual([v[0] for v in calls], ["10", "399"])
        self.assertAlmostEqual(calls[0][3], 0.127)  # DEM height + 2 m observer, in km
        self.assertEqual(result["summary"]["sampleCount"], 5)
        self.assertEqual(result["summary"]["sunlitHours"], 12)
        self.assertEqual(result["summary"]["earthVisibleHours"], 12)
        self.assertEqual(result["summary"]["bothVisibleHours"], 0)
        self.assertAlmostEqual(result["localMinusHorizonsDeg"]["sunElevation"], .2)
        self.assertEqual(result["startUtc"], "2026-09-28T12:00:00Z")
        self.assertEqual(result["endUtc"], "2026-09-29T12:00:00Z")
        self.assertIn("automatic plan still uses", result["limitations"])

    def test_upstream_network_failure_returns_503_not_fake_data(self):
        # Exercise the real HTTP handler and _fetch error path, with the NASA
        # network call deterministically failing instead of waiting for an outage.
        with patch.object(sys, 'argv', ['server.py']):
            import server
        httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(horizons.dem, 'terrain_features', return_value={'elevationM': 125}), \
                 patch.object(horizons.dem, 'best_horizon', return_value=({'dataSource': 'test'}, lambda az: 0.0)), \
                 patch.object(horizons.urllib.request, 'urlopen', side_effect=URLError('test network outage')):
                connection = http.client.HTTPConnection('127.0.0.1', httpd.server_port, timeout=5)
                connection.request('GET', '/horizons?lat=0&lon=0&utc=2026-09-28T12%3A00%3A00Z&days=1')
                response = connection.getresponse()
                body = json.loads(response.read())
                connection.close()
            self.assertEqual(response.status, 503)
            self.assertTrue(body['localPlanningAvailable'])
            self.assertIn('could not be reached', body['error'])
            self.assertNotIn('series', body)
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=3)

    def test_validation(self):
        for lat, lon, utc, days in [(91, 0, "2026-01-01T00:00:00Z", 1),
                                    (0, 181, "2026-01-01T00:00:00Z", 1),
                                    (0, 0, "2026-01-01", 1),
                                    (0, 0, "bad", 1),
                                    (0, 0, "2026-01-01T00:00:00Z", 46)]:
            with self.subTest(lat=lat, lon=lon, utc=utc, days=days):
                with self.assertRaises(ValueError):
                    horizons.compare_site(lat, lon, utc, days)


if __name__ == "__main__":
    unittest.main()
