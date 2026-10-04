/**
 * Low-precision Sun / Earth / Moon geometry — a line-by-line port of services/research-engine/engine/ephem.py
 * (the validated reference: Apollo landing Sun elevations reproduced within ≈0.3°; sub-Earth/sub-solar points on the Moon and
 * sub-solar/sub-lunar points on Earth agree with JPL Horizons DE441 to ≤0.6′ at three epochs — `npm run check:ephemeris`).
 *
 *   • Sun:   Meeus, Astronomical Algorithms ch. 25 (geocentric ecliptic longitude, ±0.01°)
 *   • Moon:  Meeus ch. 47, truncated ELP-2000/82 (60 longitude/distance + 30 latitude terms → ≈0.05° / 0.1°)
 *   • Moon orientation: IAU/IAG WGCCRE 2009 pole (α0, δ0) and prime meridian W with the 13 arguments E1…E13
 *   • Frames of date → J2000: IAU 1976 precession (ζ, z, θ) + mean obliquity of date; nutation (≤ 17″) ignored
 *   • Earth rotation: GMST (IAU 2006, from the Earth Rotation Angle) about the mean pole of date, then Pᵀ to J2000;
 *     UT1 ≈ UTC (|ΔUT1| < 0.9 s → < 0.004°); polar motion ignored
 *   • TT = UTC + 69.184 s (32.184 s + 37 leap seconds, valid from 2017; no leap second is scheduled)
 *
 * Frames used by the scene:
 *   ICRF/J2000 equatorial  (x → vernal equinox, z → celestial north pole)
 *   Moon body-fixed (IAU mean Earth/polar axis; x → lon 0°, y → lon 90°E, z → north pole)
 *   Earth-fixed (ECEF-like;  x → Greenwich meridian, y → 90°E, z → north pole)
 *   scene convention C:      (x, y, z)_frame → (x, z, −y) so that lon 0° = +X, north = +Y, lon 90°E = −Z
 *
 * Nothing here is used for science: it drives the light, the Earth, the Sun disc and the star sphere.
 */

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const AU_KM = 149_597_870.7;
export const J2000_JD = 2451545.0;
/** TT − UTC in seconds (32.184 s + 37 leap seconds; constant since 2017-01-01) */
export const TT_MINUS_UTC_S = 69.184;
const ARCSEC = D2R / 3600;

export type Vec3 = [number, number, number];
/** 3×3 row-major rotation matrix */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const jdFromMs = (ms: number) => 2440587.5 + ms / 86_400_000;
export const msFromJd = (jd: number) => (jd - 2440587.5) * 86_400_000;

// ---- Sun (Meeus ch. 25) -------------------------------------------------------------------------------------------
export function sunEcliptic(T: number): { lonDeg: number; distanceAu: number } {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = M * D2R;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const lon = mod360(L0 + C);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const nu = Mr + C * D2R;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu));
  return { lonDeg: lon, distanceAu: R };
}

// ---- Moon (Meeus ch. 47, truncated) ----------------------------------------------------------------------------------
// [D, M, M', F, Σl ×1e-6 deg, Σr m]
const LR: Array<[number, number, number, number, number, number]> = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149], [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210], [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056], [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897], [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0], [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];
// [D, M, M', F, Σb ×1e-6 deg]
const BB: Array<[number, number, number, number, number]> = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324], [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475], [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
];

export function moonEcliptic(T: number): { lonDeg: number; latDeg: number; distanceKm: number } {
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const Lp = mod360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
  const D = mod360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  const M = mod360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = mod360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
  const F = mod360(93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
  const A1 = mod360(119.75 + 131.849 * T), A2 = mod360(53.09 + 479264.29 * T), A3 = mod360(313.45 + 481266.484 * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, cl, cr] of LR) {
    const arg = (d * D + m * M + mp * Mp + f * F) * D2R;
    const k = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sl += cl * k * Math.sin(arg); sr += cr * k * Math.cos(arg);
  }
  for (const [d, m, mp, f, cb] of BB) {
    const arg = (d * D + m * M + mp * Mp + f * F) * D2R;
    const k = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sb += cb * k * Math.sin(arg);
  }
  sl += 3958 * Math.sin(A1 * D2R) + 1962 * Math.sin((Lp - F) * D2R) + 318 * Math.sin(A2 * D2R);
  sb += -2235 * Math.sin(Lp * D2R) + 382 * Math.sin(A3 * D2R) + 175 * Math.sin((A1 - F) * D2R) + 175 * Math.sin((A1 + F) * D2R) + 127 * Math.sin((Lp - Mp) * D2R) - 115 * Math.sin((Lp + Mp) * D2R);
  return { lonDeg: mod360(Lp + sl / 1e6), latDeg: sb / 1e6, distanceKm: 385000.56 + sr / 1000 };
}

// ---- frames ----------------------------------------------------------------------------------------------------------
/** Mean obliquity of the ecliptic of date (IAU 1980), radians. T = Julian centuries TT from J2000. */
export function meanObliquity(T: number): number {
  return (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T) * ARCSEC;
}

/**
 * IAU 1976 precession (Lieske et al. 1977): matrix taking mean equator/equinox J2000 → mean equator/equinox of date,
 * P = R3(−z)·R2(θ)·R3(−ζ) (SOFA iauPmat76 convention). Accurate to ≈0.1″ over the CLPS era.
 */
export function precessionMatrix(T: number): Mat3 {
  const T2 = T * T, T3 = T2 * T;
  const zeta = (2306.2181 * T + 0.30188 * T2 + 0.017998 * T3) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T2 + 0.018203 * T3) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T2 - 0.041833 * T3) * ARCSEC;
  return mat3Mul(frameRotZ(-z), mat3Mul(frameRotY(theta), frameRotZ(-zeta)));
}

/** Ecliptic-of-date spherical → equatorial J2000 unit vector: obliquity of date, then precession Pᵀ (date → J2000). */
export function eclDateToEqJ2000(lonDeg: number, latDeg: number, T: number): Vec3 {
  const lon = lonDeg * D2R, lat = latDeg * D2R;
  const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
  const eps = meanObliquity(T), ce = Math.cos(eps), se = Math.sin(eps);
  const eqOfDate: Vec3 = [x, y * ce - z * se, y * se + z * ce];
  return mat3Apply(mat3T(precessionMatrix(T)), eqOfDate);
}

/** IAU 2009 Moon pole RA/Dec and prime-meridian angle W (deg). */
export function moonOrientation(jd: number): { a0: number; d0: number; W: number } {
  const d = jd - J2000_JD, T = d / 36525;
  const E = [0,
    125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.064993 * d, 276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d, 25.053 + 12.9590088 * d];
  const s = E.map((e) => Math.sin(e * D2R)), c = E.map((e) => Math.cos(e * D2R));
  const a0 = 269.9949 + 0.0031 * T - 3.8787 * s[1] - 0.1204 * s[2] + 0.07 * s[3] - 0.0172 * s[4] + 0.0072 * s[6] - 0.0052 * s[10] + 0.0043 * s[13];
  const d0 = 66.5392 + 0.013 * T + 1.5419 * c[1] + 0.0239 * c[2] - 0.0278 * c[3] + 0.0068 * c[4] - 0.0029 * c[6] + 0.0009 * c[7] + 0.0008 * c[10] - 0.0009 * c[13];
  const W = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * s[1] + 0.1208 * s[2] - 0.0642 * s[3] + 0.0158 * s[4] + 0.0252 * s[5]
    - 0.0066 * s[6] - 0.0047 * s[7] - 0.0046 * s[8] + 0.0028 * s[9] + 0.0052 * s[10] + 0.004 * s[11] + 0.0019 * s[12] - 0.0044 * s[13];
  return { a0, d0, W: mod360(W) };
}

/** Frame rotation about z by `ang` (radians): components of the same vector in the rotated frame. */
export const frameRotZ = (ang: number): Mat3 => { const c = Math.cos(ang), s = Math.sin(ang); return [c, s, 0, -s, c, 0, 0, 0, 1]; };
export const frameRotX = (ang: number): Mat3 => { const c = Math.cos(ang), s = Math.sin(ang); return [1, 0, 0, 0, c, s, 0, -s, c]; };
export const frameRotY = (ang: number): Mat3 => { const c = Math.cos(ang), s = Math.sin(ang); return [c, 0, -s, 0, 1, 0, s, 0, c]; };
export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export const mat3T = (a: Mat3): Mat3 => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
export const mat3Apply = (a: Mat3, v: Vec3): Vec3 => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];

/** ICRF/J2000 → Moon body-fixed rotation matrix: R3(W)·R1(90−δ0)·R3(90+α0). */
export function icrfToBodyMatrix(jd: number): Mat3 {
  const { a0, d0, W } = moonOrientation(jd);
  return mat3Mul(frameRotZ(W * D2R), mat3Mul(frameRotX((90 - d0) * D2R), frameRotZ((90 + a0) * D2R)));
}

/** Earth Rotation Angle (radians), IAU 2000: ERA = 2π(0.7790572732640 + 1.00273781191135448·(JD_UT1 − 2451545)). jd = UT1 ≈ UTC. */
export function earthRotationAngle(jd: number): number {
  const t = jd - J2000_JD;
  const f = (0.779057273264 + 1.00273781191135448 * t) % 1;
  return 2 * Math.PI * (f < 0 ? f + 1 : f);
}
/** Greenwich Mean Sidereal Time (radians), IAU 2006: ERA(UT1) + accumulated precession in right ascension (TT polynomial). */
export function greenwichMeanSiderealTime(jdUtc: number): number {
  const T = (jdUtc + TT_MINUS_UTC_S / 86400 - J2000_JD) / 36525;
  const poly = (0.014506 + 4612.156534 * T + 1.3915817 * T * T - 0.00000044 * T ** 3 - 0.000029956 * T ** 4 - 0.0000000368 * T ** 5) * ARCSEC;
  const a = (earthRotationAngle(jdUtc) + poly) % (2 * Math.PI);
  return a < 0 ? a + 2 * Math.PI : a;
}
/** Earth-fixed → ICRF/J2000: Pᵀ · R3(−GMST) — Greenwich at RA_of-date = GMST about the mean pole of date (nutation ignored). */
export function ecefToIcrfMatrix(jdUtc: number): Mat3 {
  const T = (jdUtc + TT_MINUS_UTC_S / 86400 - J2000_JD) / 36525;
  return mat3Mul(mat3T(precessionMatrix(T)), frameRotZ(-greenwichMeanSiderealTime(jdUtc)));
}

/** scene convention C: (x, y, z) → (x, z, −y); C⁻¹ = Cᵀ */
export const C_SCENE: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
export const C_SCENE_T: Mat3 = mat3T(C_SCENE);
export const toScene = (v: Vec3): Vec3 => [v[0], v[2], -v[1]];

export function latLonOf(v: Vec3): { lat: number; lon: number } {
  const n = Math.hypot(v[0], v[1], v[2]);
  return { lat: Math.asin(v[2] / n) * R2D, lon: ((Math.atan2(v[1], v[0]) * R2D + 540) % 360) - 180 };
}

export interface Geometry {
  jd: number;
  utc: string;
  subSolarLat: number; subSolarLon: number;
  subEarthLat: number; subEarthLon: number;
  /** Moon-centred body-fixed vectors (km), IAU axes */
  earthVecKm: Vec3; sunVecKm: Vec3;
  earthDistanceKm: number; sunDistanceKm: number;
  /** scene-frame (C applied) unit direction to the Sun and Earth position (km) */
  sunDirScene: Vec3; earthPosScene: Vec3;
  /** rotation applied to a mesh whose local frame is J2000-equatorial-in-scene-convention (the sky sphere) */
  skyMatrixScene: Mat3;
  /** rotation applied to a mesh whose local frame is Earth-fixed-in-scene-convention (the Earth globe) */
  earthMatrixScene: Mat3;
  /** point on Earth that faces the Moon (lat, lon °E) — what the Moon "sees" */
  subLunarOnEarth: { lat: number; lon: number };
  /** point on Earth under the Sun (lat, lon °E) */
  subSolarOnEarth: { lat: number; lon: number };
  /** Moon phase: fraction illuminated as seen from Earth (0 new … 1 full) and elongation (deg) */
  moonIlluminatedFraction: number;
  earthRotationAngleDeg: number;
}

/** Full geometry for a UTC epoch (ms since 1970). ~30 µs. */
export function geometryAt(epochMs: number): Geometry {
  const jd = jdFromMs(epochMs); // UTC
  const jdTt = jd + TT_MINUS_UTC_S / 86400; // dynamical time for the Sun/Moon series and the IAU orientation
  const T = (jdTt - J2000_JD) / 36525;
  const sun = sunEcliptic(T);
  const moon = moonEcliptic(T);
  const sunGeoUnit = eclDateToEqJ2000(sun.lonDeg, 0, T);
  const moonGeoUnit = eclDateToEqJ2000(moon.lonDeg, moon.latDeg, T);
  const sunGeo: Vec3 = [sunGeoUnit[0] * sun.distanceAu * AU_KM, sunGeoUnit[1] * sun.distanceAu * AU_KM, sunGeoUnit[2] * sun.distanceAu * AU_KM];
  const moonGeo: Vec3 = [moonGeoUnit[0] * moon.distanceKm, moonGeoUnit[1] * moon.distanceKm, moonGeoUnit[2] * moon.distanceKm];
  const earthFromMoonIcrf: Vec3 = [-moonGeo[0], -moonGeo[1], -moonGeo[2]];
  const sunFromMoonIcrf: Vec3 = [sunGeo[0] - moonGeo[0], sunGeo[1] - moonGeo[1], sunGeo[2] - moonGeo[2]];
  const M = icrfToBodyMatrix(jdTt);
  const earthVecKm = mat3Apply(M, earthFromMoonIcrf);
  const sunVecKm = mat3Apply(M, sunFromMoonIcrf);
  const ss = latLonOf(sunVecKm), se = latLonOf(earthVecKm);
  const sunDistanceKm = Math.hypot(...sunVecKm);
  const sunDirScene = toScene([sunVecKm[0] / sunDistanceKm, sunVecKm[1] / sunDistanceKm, sunVecKm[2] / sunDistanceKm]);
  const earthPosScene = toScene(earthVecKm);
  // sky: R = C · M · Cᵀ ; Earth: R = C · M · Rz_ecef→icrf · Cᵀ
  const skyMatrixScene = mat3Mul(C_SCENE, mat3Mul(M, C_SCENE_T));
  const Rearth = ecefToIcrfMatrix(jd);
  const earthMatrixScene = mat3Mul(C_SCENE, mat3Mul(mat3Mul(M, Rearth), C_SCENE_T));
  // sub-lunar / sub-solar points on Earth: rotate geocentric ICRF vectors into ECEF (inverse of Rearth = its transpose)
  const icrfToEcef = mat3T(Rearth);
  const subLunarOnEarth = latLonOf(mat3Apply(icrfToEcef, moonGeo));
  const subSolarOnEarth = latLonOf(mat3Apply(icrfToEcef, sunGeo));
  // phase: elongation between Sun and Moon seen from Earth
  const cosE = (sunGeoUnit[0] * moonGeoUnit[0] + sunGeoUnit[1] * moonGeoUnit[1] + sunGeoUnit[2] * moonGeoUnit[2]);
  const moonIlluminatedFraction = (1 - cosE) / 2;
  const d = new Date(epochMs);
  return {
    jd, utc: isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19) + 'Z',
    subSolarLat: ss.lat, subSolarLon: ss.lon, subEarthLat: se.lat, subEarthLon: se.lon,
    earthVecKm, sunVecKm, earthDistanceKm: moon.distanceKm, sunDistanceKm,
    sunDirScene, earthPosScene, skyMatrixScene, earthMatrixScene, subLunarOnEarth, subSolarOnEarth, moonIlluminatedFraction,
    earthRotationAngleDeg: earthRotationAngle(jd) * R2D,
  };
}

/** Sun elevation (deg) at a lunar site for a geometry — spherical Moon, no terrain. */
export function sunElevationAt(g: Geometry, latDeg: number, lonDeg: number): number {
  const la = latDeg * D2R, lo = lonDeg * D2R;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const n = Math.hypot(...g.sunVecKm);
  const dot = (up[0] * g.sunVecKm[0] + up[1] * g.sunVecKm[1] + up[2] * g.sunVecKm[2]) / n;
  return Math.asin(Math.max(-1, Math.min(1, dot))) * R2D;
}

/** Next time the Sun rises above `elevDeg` at a site, scanning forward (default 40 days, 1 h steps then bisection). */
export function nextSunriseAt(epochMs: number, latDeg: number, lonDeg: number, elevDeg = 0, maxDays = 40): number | null {
  const stepMs = 3_600_000;
  let prev = sunElevationAt(geometryAt(epochMs), latDeg, lonDeg) - elevDeg;
  for (let i = 1; i <= maxDays * 24; i++) {
    const t = epochMs + i * stepMs;
    const cur = sunElevationAt(geometryAt(t), latDeg, lonDeg) - elevDeg;
    if (prev < 0 && cur >= 0) {
      let a = t - stepMs, b = t;
      for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if (sunElevationAt(geometryAt(m), latDeg, lonDeg) - elevDeg >= 0) b = m; else a = m; }
      return b;
    }
    prev = cur;
  }
  return null;
}

function mod360(x: number) { const r = x % 360; return r < 0 ? r + 360 : r; }
