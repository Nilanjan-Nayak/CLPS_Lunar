import { Link, useParams } from 'react-router-dom';
import { useProvider, useProviders, useSpacecraftById } from '@/services/queries';
import { Badge, KV, Note, Panel } from '@/ui/primitives';

export function ProvidersPage() {
  const { data } = useProviders();
  return (
    <div>
      <div className="page-head"><h1>CLPS providers</h1></div>
      <div className="grid">
        {data?.providers.map((p) => (
          <article key={p.id} className="card">
            <h3><Link to={`/providers/${p.id}`}>{p.name}</Link></h3>
            <div className="small dim">{p.headquarters} · {p.country}</div>
            <div className="small">Landers: {p.landers.map((l) => <Link key={l} className="chip" to={`/landers/${l}`}>{l}</Link>)}</div>
            <a className="small" href={p.website} target="_blank" rel="noreferrer">{p.website}</a>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ProviderPage() {
  const { id = '' } = useParams();
  const { data } = useProvider(id);
  if (!data) return <p>Loading…</p>;
  return (
    <div>
      <div className="page-head"><h1>{data.name}</h1><p className="dim">{data.headquarters} · {data.country}</p></div>
      <Panel title="Missions">
        {data.missions.map((m) => (
          <div key={m.id} className="row-item"><Link to={`/missions/${m.id}`}>{m.name}</Link> <Badge>{m.status}</Badge></div>
        ))}
      </Panel>
      <Panel title="Landers">{data.landers.map((l) => <Link key={l} className="chip" to={`/landers/${l}`}>{l}</Link>)}</Panel>
    </div>
  );
}

export function LanderPage() {
  const { id = '' } = useParams();
  const { data } = useSpacecraftById(id);
  if (!data) return <p>Loading…</p>;
  return (
    <div>
      <div className="page-head">
        <h1>{data.name} <Badge tone={data.assetStatus === 'official-nasa-asset' ? 'ok' : 'warn'}>{data.assetStatus === 'official-nasa-asset' ? 'official NASA 3D model' : 'no official NASA 3D model'}</Badge></h1>
        <p className="dim">{data.type} · {data.class} · {data.operator ?? data.providerId}</p>
      </div>
      <Panel title="Spacecraft">
        {data.dimensions && <KV k="Dimensions" v={`${data.dimensions.heightM ?? '?'} m × ${data.dimensions.widthM ?? '?'} m`} />}
        {data.payloadCapacityKg && <KV k="Payload capacity" v={`${data.payloadCapacityKg} kg`} />}
        {data.orbit && <KV k="Orbit" v={`${data.orbit.type} · ${data.orbit.altitudeKm.join('–')} km · ${data.orbit.note}`} />}
        <KV k="Missions" v={data.missions.map((m) => <Link key={m} className="chip" to={`/missions/${m}`}>{m}</Link>)} />
        {data.assetNote && <Note>{data.assetNote}</Note>}
      </Panel>
      {data.asset && (
        <Panel title="NASA asset">
          <KV k="Name" v={data.asset.name} />
          <KV k="Credit" v={data.asset.credits ?? data.asset.source?.credit} />
          <KV k="License" v={data.asset.license ? <a href={data.asset.license.url} target="_blank" rel="noreferrer">{data.asset.license.name}</a> : '—'} />
          <KV k="Source" v={<a href={data.asset.source?.url} target="_blank" rel="noreferrer">{data.asset.source?.title}</a>} />
          <KV k="Normalize" v={<span className="mono">{JSON.stringify(data.asset.normalize)}</span>} />
        </Panel>
      )}
    </div>
  );
}
