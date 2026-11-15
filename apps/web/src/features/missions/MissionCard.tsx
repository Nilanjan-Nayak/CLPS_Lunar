import { Link } from 'react-router-dom';
import { intentToRoute } from '@/app/routes';
import type { MissionSummary } from '@/types/domain';
import { Badge, statusTone } from '@/ui/primitives';
import { fmtDate, statusLabel } from '@/utils/format';
import { formatLatLon } from '@/utils/geo';

export function MissionCard({ m }: { m: MissionSummary }) {
  const site = m.landingSite;
  return (
    <article className="card mission-card">
      <header>
        <h3><Link to={`/missions/${m.id}`}>{m.name}</Link></h3>
        <Badge tone={statusTone(m.status)}>{statusLabel[m.status] ?? m.status}</Badge>
      </header>
      <div className="small dim">{m.provider} · {m.landerName} · {m.taskOrder}</div>
      <p>{m.statusDetail}</p>
      <dl className="meta-grid">
        <dt>Launch</dt><dd>{fmtDate(m.launch.date, m.launch.nominal ?? 'TBD')}</dd>
        <dt>Landing</dt><dd>{fmtDate(m.landing.date, m.landing.attempted ? '—' : 'n/a')}</dd>
        <dt>Site</dt><dd>{site ? (site.latitude != null ? <>{site.name} <span className="dim">· {formatLatLon(site.latitude, site.longitude!)} ({site.precision})</span></> : <>{site.name} <span className="dim">· coordinates not published</span></>) : 'no site'}</dd>
      </dl>
      <div className="btn-row">
        <Link className="btn primary" to={intentToRoute({ type: 'SHOW_MISSION', missionId: m.id, detail: 'complete' })}>Open in 3D</Link>
        <Link className="btn" to={intentToRoute({ type: 'SHOW_JOURNEY', missionId: m.id })}>↗ Journey</Link>
        <Link className="btn" to={`/missions/${m.id}`}>Details</Link>
      </div>
    </article>
  );
}
