import { useSearchParams, Link } from 'react-router-dom';
import { useMissions } from '@/services/queries';
import { Badge, statusTone } from '@/ui/primitives';
import { fmtDate, statusLabel } from '@/utils/format';
import { formatLatLon } from '@/utils/geo';
import { intentToRoute } from '@/app/routes';

export function ComparePage() {
  const [q, setQ] = useSearchParams();
  const ids = (q.get('ids') ?? '').split(',').filter(Boolean);
  const { data } = useMissions();
  const missions = data?.missions ?? [];
  const chosen = missions.filter((m) => ids.includes(m.id));
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setQ(next.length ? { ids: next.join(',') } : {});
  };
  const rows: [string, (m: (typeof missions)[number]) => React.ReactNode][] = [
    ['Status', (m) => <Badge tone={statusTone(m.status)}>{statusLabel[m.status] ?? m.status}</Badge>],
    ['Provider', (m) => m.provider],
    ['Lander', (m) => m.landerName],
    ['Task order', (m) => m.taskOrder],
    ['Launch', (m) => `${fmtDate(m.launch.date, m.launch.nominal ?? 'TBD')} · ${m.launch.vehicle}`],
    ['Landing', (m) => fmtDate(m.landing.date, m.landing.attempted ? '—' : 'n/a')],
    ['Site', (m) => (m.landingSite ? m.landingSite.name : '—')],
    ['Coordinates', (m) => (m.landingSite?.latitude != null ? `${formatLatLon(m.landingSite.latitude, m.landingSite.longitude!)} (${m.landingSite.precision})` : 'not published')],
    ['NASA payloads', (m) => m.nasaPayloadCount ?? '—'],
    ['Trajectory data', (m) => (m.trajectory ? 'verified' : 'none')],
  ];
  return (
    <div>
      <div className="page-head"><h1>Compare missions</h1>
        <div className="chips">{missions.map((m) => <button key={m.id} className={`chip${ids.includes(m.id) ? ' on' : ''}`} onClick={() => toggle(m.id)}>{m.shortName}</button>)}</div>
        {chosen.length > 0 && <Link className="btn primary" to={intentToRoute({ type: 'SHOW_MISSIONS', missionIds: chosen.map((m) => m.id), includeLanders: true })}>Show all selected in 3D</Link>}
      </div>
      {chosen.length === 0 ? <p className="dim">Pick two or more missions.</p> : (
        <table className="table compare">
          <thead><tr><th /> {chosen.map((m) => <th key={m.id}><Link to={`/missions/${m.id}`}>{m.name}</Link></th>)}</tr></thead>
          <tbody>{rows.map(([k, f]) => <tr key={k}><th>{k}</th>{chosen.map((m) => <td key={m.id}>{f(m)}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
