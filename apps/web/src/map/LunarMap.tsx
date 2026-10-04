import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetRegistry } from '@/asset-system/AssetRegistry';
import { resolveByRole } from '@/asset-system/AssetResolver';
import { STATUS_COLOR } from '@/lunar-world/locations/LocationMarker';
import { useLandingSites, useRegions } from '@/services/queries';
import { project } from './projection';

const W = 1440, H = 720;

/** 2D companion to the 3D world: LROC color map (from the asset registry) with regions and landing sites. */
export function LunarMap() {
  const { data: sites } = useLandingSites();
  const { data: regions } = useRegions();
  const [bg, setBg] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    assetRegistry.ensureLoaded().then(() => setBg(resolveByRole.moonAlbedo2k()?.url ?? null));
  }, []);
  const gridLines = useMemo(() => {
    const out: JSX.Element[] = [];
    for (let lon = -180; lon <= 180; lon += 30) out.push(<line key={`lon${lon}`} x1={project(0, lon, W, H).x} y1={0} x2={project(0, lon, W, H).x} y2={H} />);
    for (let lat = -60; lat <= 60; lat += 30) out.push(<line key={`lat${lat}`} x1={0} y1={project(lat, 0, W, H).y} x2={W} y2={project(lat, 0, W, H).y} />);
    return out;
  }, []);
  return (
    <div className="lunar-map">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {bg && <image href={bg} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
        <g className="graticule">{gridLines}</g>
        {regions?.regions.map((r) => {
          const a = project(r.bounds.north, r.bounds.west, W, H);
          const b = project(r.bounds.south, r.bounds.east < r.bounds.west ? 180 : r.bounds.east, W, H);
          return (
            <g key={r.id} className="region" onClick={() => navigate(`/regions/${r.id}`)}>
              <rect x={a.x} y={a.y} width={Math.max(2, b.x - a.x)} height={Math.max(2, b.y - a.y)} />
              <text x={a.x + 6} y={a.y + 16}>{r.name}</text>
            </g>
          );
        })}
        {sites?.landingSites.filter((s) => s.latitude != null).map((s) => {
          const p = project(s.latitude!, s.longitude!, W, H);
          const c = STATUS_COLOR[s.status] ?? '#8fd3ff';
          const approx = s.precision !== 'measured';
          return (
            <g key={s.id} className="site" transform={`translate(${p.x},${p.y})`} onClick={() => navigate(`/landing-sites/${s.id}`)} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
              <circle r={hover === s.id ? 11 : 8} fill="none" stroke={c} strokeWidth={2} strokeDasharray={approx ? '4 3' : undefined} />
              <circle r={2.5} fill={c} />
              <text x={12} y={4} fill={c}>{s.name}</text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend small">
        <span>Base: NASA CGI Moon Kit LROC color (2k) · equirectangular · lon 0° centre</span>
        <span>dashed ring = approximate coordinates · click a site or region to open it in 3D</span>
        <ul>
          {sites?.landingSites.filter((s) => s.latitude == null).map((s) => <li key={s.id}>{s.name}: coordinates not published — not plotted</li>)}
        </ul>
      </div>
    </div>
  );
}
