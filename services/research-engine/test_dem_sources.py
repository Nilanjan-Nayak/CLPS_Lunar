"""Deterministic tests for honest terrain source/resolution reporting."""
import unittest
from unittest.mock import patch
import numpy as np

from engine import dem, dem_polar


class TerrainProvenanceTests(unittest.TestCase):
    def test_fallback_resolution_is_not_mislabeled_as_16_ppd(self):
        grid = np.zeros((720, 1440), dtype=np.float32)
        dem._cached_regional.cache_clear()
        dem.horizon_regional.cache_clear()
        with patch.object(dem, '_load', return_value=(grid, 4.0, 'test: 4 px/deg fallback')):
            features = dem.terrain_features_regional(0.0, 0.0)
            mask = dem.horizon_regional(0.0, 0.0, n_az=8, max_km=8)
        self.assertIn('4 px/deg', features['grade'])
        self.assertEqual(features['resolutionM'], round(dem.MOON_R_M * np.pi / 180 / 4))
        self.assertIn('4 px/deg', mask['grade'])
        self.assertIn('4 px/deg', mask['note'])
        dem._cached_regional.cache_clear()
        dem.horizon_regional.cache_clear()

    def test_polar_edge_rays_continue_on_regional_fallback(self):
        # Synthetic flat polar DEM with a deliberately elevated regional test fixture.
        polar = dem_polar.PolarDem('fixture', 'S', 75.0, 240, 3, 3, 1, 1, .5, np.zeros((3, 3), dtype=np.int16))
        calls = []
        def fallback(lat, lon):
            calls.append((lat, lon))
            return 1000.0
        result = polar.horizon(-75.0, 20.0, n_az=4, max_km=6, fallback_elevation=fallback)
        self.assertTrue(result['regionalFallbackUsed'])
        self.assertTrue(calls)
        self.assertGreater(result['elevationDeg'][0], 10.0)  # northward ray leaves polar coverage
        self.assertIn('coarser global', result['note'])


if __name__ == '__main__':
    unittest.main()
