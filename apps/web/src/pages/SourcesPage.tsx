import { useSources } from '@/services/queries';

export function SourcesPage() {
  const { data } = useSources();
  return (
    <div>
      <div className="page-head"><h1>Sources</h1><p className="dim">Every fact and every asset in this browser points back to one of these records.</p></div>
      <table className="table">
        <thead><tr><th>Title</th><th>Publisher</th><th>Date</th><th>Type</th><th>Retrieved</th><th>Claims</th></tr></thead>
        <tbody>
          {data?.sources.map((s) => (
            <tr key={s.id}>
              <td><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></td>
              <td>{s.publisher}</td><td className="mono">{s.date ?? '—'}</td><td>{s.type}</td><td className="mono">{s.retrievedAt}</td>
              <td className="small">{s.claims.join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
