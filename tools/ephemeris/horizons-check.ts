/**
 * Ephemeris accuracy check against JPL Horizons (DE441; Moon frame MOON_ME, Earth frame ITRF93 high precision).
 * Reference rows were fetched from https://ssd.jpl.nasa.gov/api/horizons.api on 2026-09-28 with
 *   COMMAND=301 CENTER=500@399 QUANTITIES=14,15,20   (Moon sub-Earth / sub-solar points, range)
 *   COMMAND=399 CENTER=500@301 QUANTITIES=14,15      (Earth sub-lunar / sub-solar points)
 * Horizons' Earth latitudes are planetodetic → our geocentric latitudes are converted before comparing.
 *
 *   npx tsx tools/ephemeris/horizons-check.ts        (exit 1 if any point is off by more than 2′)
 */
import { geometryAt } from '../../apps/web/src/solar-system/ephemeris';

const AU = 149597870.7;
type Ref = { subEarth: [number, number]; subSolar: [number, number]; distKm: number; subSolarOnEarth: [number, number]; subLunarOnEarth: [number, number] };
const REF: Record<string, Ref> = {
  '2025-03-06T17:28:50Z': { subEarth: [-6.692787, 5.380361], subSolar: [-0.313933, 94.761001], distKm: 0.00250811152641 * AU, subSolarOnEarth: [-5.405801, 280.575273 - 360], subLunarOnEarth: [28.121416, 8.292669] },
  '2026-09-28T12:00:00Z': { subEarth: [-5.75779, 356.192076 - 360], subSolar: [-0.923877, 333.254033 - 360], distKm: 0.00249663213795 * AU, subSolarOnEarth: [-2.153147, 357.666826 - 360], subLunarOnEarth: [15.162531, 197.518401 - 360] },
  '2026-10-10T10:00:00Z': { subEarth: [4.793632, 4.93231], subSolar: [-1.197157, 187.931013 - 360], distKm: 0.00258505406199 * AU, subSolarOnEarth: [-6.76926, 26.760216], subLunarOnEarth: [-9.005651, 22.608609] },
};
const F = 1 / 298.257223563;
const geodetic = (latGeocentricDeg: number) => (Math.atan(Math.tan((latGeocentricDeg * Math.PI) / 180) / ((1 - F) * (1 - F))) * 180) / Math.PI;
const dLon = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const TOL_ARCMIN = 2;
let worst = 0, failures = 0;
const row = (name: string, ours: [number, number], ref: [number, number]) => {
  const sep = Math.hypot(ours[0] - ref[0], dLon(ours[1], ref[1]) * Math.cos((ref[0] * Math.PI) / 180)) * 60;
  worst = Math.max(worst, sep);
  if (sep > TOL_ARCMIN) failures++;
  console.log(`  ${sep > TOL_ARCMIN ? '✗' : '✓'} ${name.padEnd(16)} ours ${ours[0].toFixed(3).padStart(8)}, ${ours[1].toFixed(3).padStart(9)}   JPL ${ref[0].toFixed(3).padStart(8)}, ${ref[1].toFixed(3).padStart(9)}   Δ ${sep.toFixed(2)}′`);
};
for (const [utc, r] of Object.entries(REF)) {
  const g = geometryAt(Date.parse(utc));
  console.log(utc);
  row('Moon sub-Earth', [g.subEarthLat, g.subEarthLon], r.subEarth);
  row('Moon sub-solar', [g.subSolarLat, g.subSolarLon], r.subSolar);
  row('Earth sub-solar', [geodetic(g.subSolarOnEarth.lat), g.subSolarOnEarth.lon], r.subSolarOnEarth);
  row('Earth sub-lunar', [geodetic(g.subLunarOnEarth.lat), g.subLunarOnEarth.lon], r.subLunarOnEarth);
  const dd = g.earthDistanceKm - r.distKm;
  if (Math.abs(dd) > 150) failures++;
  console.log(`  ${Math.abs(dd) > 150 ? '✗' : '✓'} ${'Earth–Moon range'.padEnd(16)} ours ${g.earthDistanceKm.toFixed(0)} km   JPL ${r.distKm.toFixed(0)} km   Δ ${dd.toFixed(0)} km`);
}
console.log(`worst angular error ${worst.toFixed(2)}′ (${(worst / 60).toFixed(3)}°) — tolerance ${TOL_ARCMIN}′ → ${failures ? `${failures} FAILED` : 'PASS'}`);
process.exit(failures ? 1 : 0);
