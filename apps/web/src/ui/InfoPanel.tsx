import { Link } from 'react-router-dom';
import { intentToRoute } from '@/app/routes';
import { useLandingSite, useMission, useRegion, useSpacecraftById } from '@/services/queries';
import { useEphemerisStore } from '@/solar-system/ephemerisDriver';
import { useClockStore } from '@/state/clockStore';
import { useSceneStore } from '@/state/sceneStore';
import { useSelectionStore } from '@/state/selectionStore';
import { useWorldStore } from '@/state/worldStore';
import { fmtDate, fmtM, statusLabel } from '@/utils/format';
import { formatLatLon } from '@/utils/geo';
import { Badge, KV, LinkButton, Note, Panel, statusTone } from './primitives';

/** InfoPanel — what is selected (mission / site / region / spacecraft / Earth / Moon), with next-step actions. */
export function InfoPanel() {
  const selected = useSelectionStore((s) => s.selected);
  const config = useSceneStore((s) => s.config);
  return (
    <div className="info-stack">
      {selected?.kind === 'mission' && <MissionInfo id={selected.id} />}
      {selected?.kind === 'landing-site' && <SiteInfo id={selected.id} />}
      {selected?.kind === 'region' && <RegionInfo id={selected.id} />}
      {selected?.kind === 'spacecraft' && <SpacecraftInfo id={selected.id} missionId={selected.missionId} />}
      {selected?.kind === 'earth' && <EarthInfo />}
      {selected?.kind === 'moon' && (
        <Panel title="Moon">
          <Note>Far view: NASA SVS Moon model (LRO LROC/LOLA, 2026). Near view: DEM globe displaced from LOLA elevation (CGI Moon Kit LDEM) + streamed 16 px/deg tiles.</Note>
          {config && config.objects.some((o) => o.kind === 'landing-site') && (
            <KV
              k="Landing sites"
              v={config.objects.filter((o) => o.kind === 'landing-site').map((o) => (
                <Link key={o.id} className="chip" to={`/landing-sites/${o.landingSiteId}`}>{o.label}</Link>
              ))}
            />
          )}
          <LinkButton to="/missions" primary>Browse CLPS missions →</LinkButton>
        </Panel>
      )}
      {config && config.notes.length > 0 && (
        <Panel title="Scene notes" className="notes">
          <ul>{config.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

function EarthInfo() {
  const renderer = useWorldStore((s) => s.earthRenderer);
  const geo = useEphemerisStore((s) => s.geometry);
  const mode = useClockStore((s) => s.mode);
  const sub = geo.subLunarOnEarth;
  const sun = geo.subSolarOnEarth;
  return (
    <Panel title="Earth">
      {renderer === 'nasa-glb' ? (
        <Note>NASA “Earth with Clouds” 3D model (NASA VTAD), scaled to the 6,371 km mean radius. Clouds are baked into its texture (static); its orientation was calibrated against Blue Marble (89 % land/ocean agreement) so the ephemeris rotation applies to it as well.</Note>
      ) : (
        <Note>
          NASA Visible Earth textures on a 6,371 km globe: Blue Marble Next Generation (Aug 2004, day), Black Marble 2016 (night lights) and Blue Marble Clouds. Position, distance, rotation (Earth Rotation Angle) and the terminator follow the world clock
          {mode === 'live' ? ' — live, as seen from the Moon right now.' : '.'}
        </Note>
      )}
      <KV k="Facing the Moon" v={<span className="mono">{formatLatLon(sub.lat, sub.lon)}</span>} />
      <KV k="Sub-solar point" v={<span className="mono">{formatLatLon(sun.lat, sun.lon)}</span>} />
      <KV k="Distance" v={<span className="mono">{Math.round(geo.earthDistanceKm).toLocaleString()} km · light {(geo.earthDistanceKm / 299792.458).toFixed(2)} s</span>} />
      <KV k="Earth phase (from Moon)" v={<span className="mono">{Math.round((1 - geo.moonIlluminatedFraction) * 100)}% lit</span>} />
      <LinkButton to="/moon" primary>Continue to the Moon →</LinkButton>
    </Panel>
  );
}

function MissionInfo({ id }: { id: string }) {
  const { data, isLoading, error } = useMission(id);
  if (isLoading) return <Panel title="Mission">Loading…</Panel>;
  if (error || !data) return <Panel title="Mission">Not found.</Panel>;
  const m = data.mission;
  const site = data.landingSite;
  const tc = data.terrainContext;
  return (
    <Panel title={<span>{m.name} <Badge tone={statusTone(m.status)}>{statusLabel[m.status] ?? m.status}</Badge></span>}>
      <p className="lead">{m.statusDetail}</p>
      <KV k="Provider" v={data.provider ? <Link to={`/providers/${data.provider.id}`}>{data.provider.name}</Link> : '—'} />
      <KV k="Task order" v={m.taskOrder} />
      <KV k="Lander" v={data.lander ? <Link to={`/landers/${data.lander.id}`}>{data.lander.name}</Link> : '—'} />
      <KV k="Launch" v={`${fmtDate(m.launch.date, m.launch.nominal ?? 'TBD')} · ${m.launch.vehicle}`} />
      <KV k="Landing" v={fmtDate(m.landing.date, m.landing.attempted ? '—' : 'not attempted')} />
      <KV k="Site" v={site ? <Link to={`/landing-sites/${site.id}`}>{site.name}</Link> : '—'} />
      {site && site.latitude != null && <KV k="Coordinates" v={<span className="mono">{formatLatLon(site.latitude, site.longitude!)} · {site.precision}</span>} />}
      {tc && <KV k="LOLA terrain" v={<span className="mono">{fmtM(tc.elevationM)} · slope {tc.slopeDeg.toFixed(1)}° · {tc.source}</span>} />}
      <KV k="NASA payloads" v={`${m.nasaPayloadCount ?? data.payloads.length} (${data.payloads.length} catalogued)`} />
      <div className="btn-row">
        <LinkButton to={intentToRoute({ type: 'SHOW_MISSION', missionId: id, detail: 'lander' })}>Lander</LinkButton>
        <LinkButton to={intentToRoute({ type: 'SHOW_MISSION', missionId: id, detail: 'payloads' })}>Payloads</LinkButton>
        <LinkButton to={intentToRoute({ type: 'SHOW_MISSION', missionId: id, detail: 'complete' })} primary>Complete scene</LinkButton>
        <LinkButton to={intentToRoute({ type: 'SHOW_JOURNEY', missionId: id })}>🚀 Launch → Moon journey</LinkButton>
        <LinkButton to={`/missions/${id}`}>Data page</LinkButton>
      </div>
    </Panel>
  );
}

function SiteInfo({ id }: { id: string }) {
  const { data } = useLandingSite(id);
  if (!data) return <Panel title="Landing site">Loading…</Panel>;
  return (
    <Panel title={<span>{data.name} <Badge tone={statusTone(data.status)}>{data.status}</Badge></span>}>
      <KV k="Feature" v={data.featureName} />
      <KV k="Coordinates" v={data.latitude != null ? <span className="mono">{formatLatLon(data.latitude, data.longitude!, 4)}</span> : 'not published'} />
      <KV k="Precision" v={`${data.precision} — ${data.precisionNote}`} />
      <KV k="Published elevation" v={fmtM(data.elevationM)} />
      <KV k="Region" v={data.region ? <Link to={`/regions/${data.region.id}`}>{data.region.name}</Link> : '—'} />
      <KV k="Missions" v={data.missions.map((m) => <Link key={m.id} to={intentToRoute({ type: 'SHOW_MISSION', missionId: m.id, detail: 'lander' })} className="chip">{m.name}</Link>)} />
      <div className="btn-row">
        <LinkButton to={`/landing-sites/${id}`} primary>Focus site</LinkButton>
        <LinkButton to={`/landing-sites/${id}?journey=1`}>Journey from Earth</LinkButton>
      </div>
    </Panel>
  );
}

function RegionInfo({ id }: { id: string }) {
  const { data } = useRegion(id);
  if (!data) return <Panel title="Region">Loading…</Panel>;
  return (
    <Panel title={data.name}>
      <p className="lead">{data.description}</p>
      <KV k="Bounds" v={<span className="mono">{data.bounds.south}°…{data.bounds.north}° lat, {data.bounds.west}°…{data.bounds.east}° lon</span>} />
      <KV k="Science themes" v={data.scienceThemes.join(', ')} />
      <KV k="Landing sites" v={data.landingSites.map((s) => <Link key={s.id} className="chip" to={`/landing-sites/${s.id}`}>{s.name}</Link>)} />
      <KV k="Missions" v={data.missions.map((m) => <Link key={m.id} className="chip" to={`/missions/${m.id}/scene?detail=lander`}>{m.name}</Link>)} />
      <div className="btn-row">
        <LinkButton to={intentToRoute({ type: 'SHOW_MISSIONS', regionId: id, includeLanders: true })} primary>All missions here</LinkButton>
      </div>
    </Panel>
  );
}

function SpacecraftInfo({ id, missionId }: { id: string; missionId?: string }) {
  const { data } = useSpacecraftById(id);
  if (!data) return <Panel title="Spacecraft">Loading…</Panel>;
  return (
    <Panel title={<span>{data.name} <Badge tone={data.assetStatus === 'official-nasa-asset' ? 'ok' : 'warn'}>{data.assetStatus === 'official-nasa-asset' ? 'NASA 3D model' : 'info marker'}</Badge></span>}>
      <KV k="Type" v={`${data.type} · ${data.class}`} />
      <KV k="Operator" v={data.operator ?? data.providerId ?? '—'} />
      {data.dimensions && <KV k="Dimensions" v={`${data.dimensions.heightM ?? '?'} m tall · ${data.dimensions.widthM ?? '?'} m wide`} />}
      {data.payloadCapacityKg && <KV k="Payload capacity" v={`${data.payloadCapacityKg} kg`} />}
      {data.orbit && <KV k="Orbit" v={`${data.orbit.type} ${data.orbit.altitudeKm[0]}–${data.orbit.altitudeKm[1]} km · ${data.orbit.note}`} />}
      {data.assetNote && <Note>{data.assetNote}</Note>}
      {data.asset && <KV k="Asset credit" v={`${data.asset.credits ?? data.asset.source?.credit ?? '—'} · ${data.asset.license?.name ?? ''}`} />}
      <div className="btn-row">
        <LinkButton to={`/landers/${id}`}>Spacecraft page</LinkButton>
        {missionId && <LinkButton to={`/missions/${missionId}`}>Mission data</LinkButton>}
      </div>
    </Panel>
  );
}
