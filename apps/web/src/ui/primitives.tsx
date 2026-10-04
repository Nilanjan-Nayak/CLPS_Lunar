import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Panel({ title, children, className = '', actions, collapsed = false, onToggle }: { title?: ReactNode; children?: ReactNode; className?: string; actions?: ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head" onClick={onToggle} style={onToggle ? { cursor: 'pointer' } : undefined}>
          <h3>{title}</h3>
          <div className="panel-actions">{actions}{onToggle && <span className="chev">{collapsed ? '▸' : '▾'}</span>}</div>
        </header>
      )}
      {!collapsed && <div className="panel-body">{children}</div>}
    </section>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const statusTone = (status?: string | null): 'neutral' | 'ok' | 'warn' | 'bad' | 'info' => {
  if (!status) return 'neutral';
  if (status === 'success' || status === 'landed' || status === 'active') return 'ok';
  if (status.includes('partial') || status.includes('tipped')) return 'warn';
  if (status.startsWith('fail') || status === 'not-reached') return 'bad';
  if (status.startsWith('planned') || status === 'in-flight') return 'info';
  return 'neutral';
};

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function LinkButton({ to, children, primary }: { to: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link to={to} className={`btn${primary ? ' primary' : ''}`}>
      {children}
    </Link>
  );
}
