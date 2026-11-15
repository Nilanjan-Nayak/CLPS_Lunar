import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Panel — HUD / page card. `title` (uppercase label + badges) and optional `actions` share the head row; a `subtitle`
 * (e.g. mission time · UTC) gets its own line so long titles never squeeze it. `onToggle` makes the head a collapse button.
 */
export function Panel({ title, subtitle, children, className = '', actions, collapsed = false, onToggle }: { title?: ReactNode; subtitle?: ReactNode; children?: ReactNode; className?: string; actions?: ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <section className={`panel ${className}${collapsed ? ' collapsed' : ''}`}>
      {title && (
        <header className={`panel-head${onToggle ? ' toggle' : ''}`} onClick={onToggle} role={onToggle ? 'button' : undefined} aria-expanded={onToggle ? !collapsed : undefined}>
          <div className="panel-title">
            <h3>{title}</h3>
            {subtitle && <div className="panel-sub">{subtitle}</div>}
          </div>
          {(actions || onToggle) && <div className="panel-actions">{actions}{onToggle && <span className="chev">{collapsed ? '▸' : '▾'}</span>}</div>}
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
