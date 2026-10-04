import { Link, useParams } from 'react-router-dom';
import { intentToRoute } from '@/app/routes';
import { useMission } from '@/services/queries';
import { Badge, KV, Note, Panel, statusTone } from '@/ui/primitives';
import { fmtDate, fmtM, statusLabel } from '@/utils/format';
import { formatLatLon } from '@/utils/geo';

export function MissionPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useMission(id);
  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <p className="warn">Mission not found.</p>;
  const { mission: m, provider, lander, landingSite: site, region, payloads, spacecraft, assets, events, sources, terrainContext: tc } = data;
  return (
    <div className="two-col">
      <div>
        <div className="page-head">
          <h1>{m.name} <Badge tone={statusTone(m.status)}>{statusLabel[m.status] ?? m.status}</Badge></h1>
          <p className="lead">{m.statusDetail}</p>
          <div className="btn-row">
            <Link className="btn primary" to={intentToRoute({ type: 'SHOW_MISSION', missionId: m.id, detail: 'complete' })}>Open complete 3D scene</Link>
            <Link className="btn" to={intentToRoute({ type: 'SHOW_JOURNEY', missionId: m.id })} title="Launch site → route → arrival, animated in the live environment">🚀 Launch → Moon journey</Link>
            <Link className="btn" to={intentToRoute({ type: 'SHOW_MISSION', missionId: m.id, detail: 'complete', journeyFromEarth: true })}>Camera flight from Earth</Link>
            <Link className="btn" to={`/research?mission=${m.id}`}>Research</Link>
          </div>
        </div>
        <Panel title="Mission">
          <KV k="Program / task order" v={`${m.program} · ${m.taskOrder}`} />
          <KV k="Provider" v={provider ? <Link to={`/providers/${provider.id}`}>{provider.name}</Link> : '—'} />
          <KV k="Lander" v={lander ? <Link to={`/landers/${lander.id}`}>{lander.name} ({lander.class})</Link> : '—'} />
          <KV k="Launch" v={`${fmtDate(m.launch.date, m.launch.nominal ?? 'TBD')} · ${m.launch.vehicle}${m.launch.site ? ` · ${m.launch.site}` : ''}`} />
          <KV k="Landing" v={`${fmtDate(m.landing.date, m.landing.attempted ? '—' : 'not attempted')}${m.landing.outcome ? ` · ${m.landing.outcome}` : ''}`} />
          <KV k="End of mission" v={fmtDate(m.endOfMission)} />
          <KV k="Trajectory" v={m.trajectory ? 'verified samples' : m.trajectoryNote} />
          <KV k="Verified" v={m.verifiedAt} />
        </Panel>
        <Panel title="Landing site & terrain">
          {site ? (
            <>
              <KV k="Site" v={<Link to={`/landing-sites/${site.id}`}>{site.name}</Link>} />
              <KV k="Feature" v={site.featureName} />
              <KV k="Coordinates" v={site.latitude != null ? <span className="mono">{formatLatLon(site.latitude, site.longitude!, 4)}</span> : 'not published'} />
              <KV k="Precision" v={`${site.precision} — ${site.precisionNote}`} />
              <KV k="Published elevation" v={fmtM(site.elevationM)} />
              {tc && <KV k="LOLA DEM" v={<span className="mono">{fmtM(tc.elevationM)} · slope {tc.slopeDeg.toFixed(1)}° · aspect {tc.aspectDeg.toFixed(0)}° · LOD{tc.lod} ({tc.source})</span>} />}
              <KV k="Region" v={region ? <Link to={`/regions/${region.id}`}>{region.name}</Link> : '—'} />
            </>
          ) : (
            <Note>No landing site record.</Note>
          )}
        </Panel>
        <Panel title={`Spacecraft (${spacecraft.length})`}>
          {spacecraft.map((s) => (
            <div key={s.id} className="row-item">
              <b><Link to={`/landers/${s.id}`}>{s.name}</Link></b> <span className="dim">{s.role}</span>{' '}
              <Badge tone={s.assetStatus === 'official-nasa-asset' ? 'ok' : 'warn'}>{s.assetStatus === 'official-nasa-asset' ? 'NASA model' : 'info marker'}</Badge>
              {s.roleNote && <div className="small dim">{s.roleNote}</div>}
              {s.assetNote && <div className="small dim">{s.assetNote}</div>}
            </div>
          ))}
        </Panel>
        <Panel title={`Payloads (${payloads.length})`}>
          {payloads.length === 0 && <Note>No payload records catalogued yet.</Note>}
          {payloads.map((p) => (
            <div key={p.id} className="row-item">
              <b><Link to={`/payloads/${p.id}`}>{p.acronym || p.name}</Link></b> <span className="dim">{p.name} · {p.type} · {p.leadOrganization}</span>
              <div className="small">{p.summary}</div>
            </div>
          ))}
        </Panel>
      </div>
      <div>
        <Panel title={`Timeline (${events.length})`}>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}><span className="mono">{fmtDate(e.date)}</span> <b>{e.title}</b> <span className="dim small">{e.type}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title={`NASA assets used (${assets.length})`}>
          {assets.map((a) => (
            <div key={a.assetId} className="row-item">
              <b>{a.name}</b> <span className="dim small">{a.assetType}</span>
              <div className="small">{a.credits ?? a.source?.credit} · {a.license?.name}</div>
              <div className="small"><a href={a.source?.url} target="_blank" rel="noreferrer">{a.source?.title ?? a.source?.url}</a></div>
            </div>
          ))}
        </Panel>
        <Panel title={`Sources (${sources.length})`}>
          <ul className="sources-list">
            {sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                <div className="small dim">{s.publisher}{s.date ? ` · ${s.date}` : ''} · {s.type} · retrieved {s.retrievedAt}</div>
                {s.claims.length > 0 && <div className="small">{s.claims.join(' · ')}</div>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
