import { useMemo } from 'react';
import { Vector3 } from 'three';
import { DEG } from '@/constants/frames';
import { useCameraStore } from '@/state/cameraStore';
import { useSceneStore } from '@/state/sceneStore';
import { useTerrainStore } from '@/state/terrainStore';
import { useEphemerisStore } from '@/solar-system/ephemerisDriver';
import { angularDistanceDeg, enuBasis, latLonToVec3 } from '@/utils/geo';
import { MOON_RADIUS_KM } from '@/constants/frames';

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`);
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const cardinal = (deg: number) => CARD[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
/** azimuth/elevation of a Moon-centred unit direction as seen from (lat, lon) on the surface */
function azEl(dir: Vector3, lat: number, lon: number) {
  const { up, north, east } = enuBasis(lat, lon);
  return { az: ((Math.atan2(dir.dot(east), dir.dot(north)) / DEG) + 360) % 360, el: Math.asin(Math.max(-1, Math.min(1, dir.dot(up)))) / DEG };
}
/** initial bearing from (lat1, lon1) to (lat2, lon2) on a sphere */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG, Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}
/** a "nice" scale-bar length (km) that fits in ~110 px of a viewport `viewWidthKm` wide over `pxWidth` px */
function niceScale(viewWidthKm: number, pxWidth: number) {
  const kmPerPx = viewWidthKm / pxWidth;
  const targetKm = kmPerPx * 110;
  const pow = Math.pow(10, Math.floor(Math.log10(targetKm)));
  const m = targetKm / pow;
  const nice = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
  return { km: nice, px: nice / kmPerPx };
}

/**
 * NavHud — answers "where am I and which way am I looking?" whenever the camera is in the surface regime:
 * compass (heading, Sun ☀ and Earth ⊕ azimuths, bearing to the scene focus), height above the local terrain,
 * pitch, sub-point, ground distance to the focus and a scale bar for the view centre. Pure read-out of camera
 * telemetry + ephemeris geometry — it never moves anything.
 */
export function NavHud() {
  const t = useCameraStore((s) => s.telemetry);
  const focus = useSceneStore((s) => s.config?.focus ?? null);
  const g = useEphemerisStore((s) => s.geometry);
  const exposure = useTerrainStore((s) => s.exposure);
  const sun = useMemo(() => azEl(latLonToVec3(g.subSolarLat, g.subSolarLon, 1), t.subLat, t.subLon), [g.subSolarLat, g.subSolarLon, t.subLat, t.subLon]);
  const earth = useMemo(() => azEl(new Vector3(...g.earthPosScene).normalize(), t.subLat, t.subLon), [g.earthPosScene, t.subLat, t.subLon]);
  if (!t.surfaceMode) return null;
  const site = focus ? { bearing: bearingDeg(t.subLat, t.subLon, focus.latitude, focus.longitude), distKm: angularDistanceDeg(t.subLat, t.subLon, focus.latitude, focus.longitude) * DEG * MOON_RADIUS_KM } : null;
  const scale = t.viewWidthKm > 0 ? niceScale(t.viewWidthKm, typeof window !== 'undefined' ? window.innerWidth : 1440) : null;
  const rot = -t.headingDeg; // rotate the rose so the heading points up
  const tick = (deg: number, r1: number, r2: number, cls: string) => {
    const a = (deg + rot) * DEG;
    return <line key={`${cls}${deg}`} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + r2 * Math.sin(a)} y2={50 - r2 * Math.cos(a)} className={cls} />;
  };
  const dot = (deg: number, r: number, cls: string, label?: string) => {
    const a = (deg + rot) * DEG;
    const x = 50 + r * Math.sin(a), y = 50 - r * Math.cos(a);
    return (
      <g key={`${cls}-${label ?? ''}`} className={cls}>
        <circle cx={x} cy={y} r={3.2} />
        {label && <text x={x} y={y + 0.8} textAnchor="middle" dominantBaseline="middle">{label}</text>}
      </g>
    );
  };
  return (
    <aside className="navhud" aria-label="Navigation">
      <svg viewBox="0 0 100 100" className="compass" aria-hidden>
        <circle cx={50} cy={50} r={46} className="ring" />
        {Array.from({ length: 24 }, (_, i) => tick(i * 15, 42, i % 6 === 0 ? 36 : 39.5, i % 6 === 0 ? 'major' : 'minor'))}
        {['N', 'E', 'S', 'W'].map((c, i) => {
          const a = (i * 90 + rot) * DEG;
          return <text key={c} x={50 + 29 * Math.sin(a)} y={50 - 29 * Math.cos(a) + 0.5} textAnchor="middle" dominantBaseline="middle" className={`card${c === 'N' ? ' north' : ''}`}>{c}</text>;
        })}
        {/* view wedge (always up) */}
        <path d="M50 50 L41 14 A38 38 0 0 1 59 14 Z" className="wedge" />
        {sun.el > -2 && dot(sun.az, 46, 'sun', '☀')}
        {earth.el > -2 && dot(earth.az, 46, 'earth', '⊕')}
        {site && site.distKm > 0.05 && dot(site.bearing, 20, 'site')}
        <circle cx={50} cy={50} r={1.8} className="me" />
      </svg>
      <div className="nav-read mono">
        <div className="nav-row"><span className="k">AGL</span><b>{t.aglKm == null ? '—' : fmtKm(Math.max(0, t.aglKm))}</b><span className="dim">terrain {t.groundKm == null ? '—' : `${t.groundKm >= 0 ? '+' : ''}${(t.groundKm * 1000).toFixed(0)} m`}</span></div>
        <div className="nav-row"><span className="k">HDG</span><b>{Math.round(t.headingDeg).toString().padStart(3, '0')}° {cardinal(t.headingDeg)}</b><span className="dim">pitch {t.pitchDeg.toFixed(0)}°</span></div>
        <div className="nav-row"><span className="k">POS</span><b>{Math.abs(t.subLat).toFixed(2)}°{t.subLat >= 0 ? 'N' : 'S'} {Math.abs(t.subLon).toFixed(2)}°{t.subLon >= 0 ? 'E' : 'W'}</b></div>
        {site && <div className="nav-row"><span className="k">SITE</span><b title={focus?.label ?? 'scene focus'}>{fmtKm(site.distKm)}</b><span className="dim">bearing {Math.round(site.bearing)}° {cardinal(site.bearing)}</span></div>}
        <div className="nav-row"><span className="k sun">☀</span><b>{sun.el.toFixed(0)}° el</b><span className="dim">az {Math.round(sun.az)}° · ⊕ {earth.el > 0 ? `${earth.el.toFixed(0)}° el` : 'below horizon'}{exposure > 1.05 ? <span className="nav-exp" title="Auto exposure: display brightened for low Sun / night (not a data change)"> · exp ×{exposure.toFixed(1)}</span> : null}</span></div>
        {scale && <div className="nav-scale" title="ground distance at the view centre"><span style={{ width: Math.round(scale.px) }} /><small>{fmtKm(scale.km)}</small></div>}
      </div>
    </aside>
  );
}
