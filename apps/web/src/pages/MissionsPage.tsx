import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MissionCard } from '@/features/missions/MissionCard';
import { useMissions, useProviders } from '@/services/queries';
import { intentToRoute } from '@/app/routes';

export function MissionsPage() {
  const [status, setStatus] = useState('');
  const [providerId, setProvider] = useState('');
  const { data, isLoading, error } = useMissions({ status: status || undefined, providerId: providerId || undefined });
  const providers = useProviders();
  return (
    <div>
      <div className="page-head">
        <h1>CLPS missions</h1>
        <p className="dim">Commercial Lunar Payload Services task orders, from the backend catalogue (verified {new Date().getFullYear()}). Each card opens the mission scene: Earth → Moon → landing site → lander → payloads.</p>
        <div className="filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">all statuses</option>
            {['planned', 'in-flight', 'success', 'success-partial', 'failed-partial', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={providerId} onChange={(e) => setProvider(e.target.value)}>
            <option value="">all providers</option>
            {providers.data?.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Link className="btn" to={intentToRoute({ type: 'SHOW_MISSIONS', includeLanders: true })}>All sites in 3D</Link>
        </div>
      </div>
      {isLoading && <p>Loading…</p>}
      {error && <p className="warn">{String(error)}</p>}
      <div className="grid">{data?.missions.map((m) => <MissionCard key={m.id} m={m} />)}</div>
    </div>
  );
}
