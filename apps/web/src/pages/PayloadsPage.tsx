import { Link, useParams } from 'react-router-dom';
import { usePayload, usePayloads } from '@/services/queries';
import { Badge, KV, Note, Panel } from '@/ui/primitives';

export function PayloadsPage() {
  const { data, isLoading } = usePayloads();
  return (
    <div>
      <div className="page-head"><h1>Payloads</h1><p className="dim">NASA and partner instruments delivered by CLPS landers. Payloads without an official 3D model are shown as information only — nothing is invented.</p></div>
      {isLoading && <p>Loading…</p>}
      <table className="table">
        <thead><tr><th>Acronym</th><th>Name</th><th>Type</th><th>Lead</th><th>Missions</th><th>3D</th></tr></thead>
        <tbody>
          {data?.payloads.map((p) => (
            <tr key={p.id}>
              <td><Link to={`/payloads/${p.id}`}><b>{p.acronym || '—'}</b></Link></td>
              <td>{p.name}</td>
              <td>{p.type}</td>
              <td>{p.leadOrganization}</td>
              <td>{p.missionIds.map((id) => <Link key={id} className="chip" to={`/missions/${id}`}>{id}</Link>)}</td>
              <td>{p.has3DModel ? <Badge tone="ok">model</Badge> : <Badge>info</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PayloadPage() {
  const { id = '' } = useParams();
  const { data, isLoading } = usePayload(id);
  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p className="warn">Payload not found.</p>;
  return (
    <div>
      <div className="page-head"><h1>{data.acronym || data.name}</h1><p className="lead">{data.name}</p></div>
      <Panel title="Payload">
        <KV k="Type" v={data.type} />
        <KV k="Lead organization" v={data.leadOrganization} />
        <KV k="Summary" v={data.summary} />
        <KV k="3D model" v={data.has3DModel ? 'official model available' : 'none — shown as information in the mission scene'} />
        <KV k="Missions" v={data.missions.map((m) => <Link key={m.id} className="chip" to={`/missions/${m.id}/scene?detail=payloads`}>{m.name}</Link>)} />
      </Panel>
      {!data.has3DModel && <Note>Per the architecture rules, no stand-in geometry is fabricated for this instrument.</Note>}
    </div>
  );
}
