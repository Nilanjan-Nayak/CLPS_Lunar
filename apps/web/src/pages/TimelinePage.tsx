import { Link } from 'react-router-dom';
import { useTimeline } from '@/services/queries';
import { fmtDate } from '@/utils/format';

export function TimelinePage() {
  const { data } = useTimeline();
  const now = Date.now();
  return (
    <div>
      <div className="page-head"><h1>Timeline</h1><p className="dim">Launches, landings and end-of-mission events across CLPS. Future dates are NET (no earlier than).</p></div>
      <ul className="timeline big">
        {data?.events.map((e) => {
          const future = new Date(e.date).getTime() > now;
          return (
            <li key={e.id} className={future ? 'future' : ''}>
              <span className="mono">{fmtDate(e.date)}</span>
              <b>{e.title}</b>
              <span className="dim small">{e.type}{future ? ' · NET' : ''}</span>
              {e.missionId && <Link className="btn small" to={`/missions/${e.missionId}/scene?detail=lander`}>3D</Link>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
