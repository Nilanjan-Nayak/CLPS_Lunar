import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Html } from '@react-three/drei';

export interface MarkerDetail {
  label: string;
  value: string;
}

interface FlightMarkerProps {
  title: string;
  category: string;
  badge?: string;
  details: MarkerDetail[];
  note?: string;
  color?: string;
  position?: [number, number, number];
  markerType: 'spacecraft' | 'launch' | 'site' | 'orbiter' | 'lander';
  onActivate?: () => void;
  onHover?: (hovered: boolean) => void;
}

/** Format model distances without presenting false precision. */
export function formatMarkerAltitude(km: number): string {
  if (!Number.isFinite(km)) return '—';
  return Math.abs(km) < 50
    ? `${Math.round(km * 1000).toLocaleString()} m`
    : `${Math.round(km).toLocaleString()} km`;
}

/**
 * An unobtrusive, screen-sized target attached to a real scene position. The detailed card is hidden until hover,
 * keyboard focus, or a touch tap. Mouse departure and Escape dismiss it; a second touch or an outside tap also closes it.
 * Each value must come from the mission or model, never invented telemetry.
 */
export function FlightMarker({
  title, category, badge, details, note, color = '#8fd3ff', position = [0, 0, 0], markerType, onActivate, onHover,
}: FlightMarkerProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pointerType = useRef('');
  const touchStartedOpen = useRef(false);
  const offsetSide = useRef<-1 | 0 | 1>(0);
  const lastScreenOffset = useRef(0);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ left: false, up: false, low: false, centered: false, centerUp: false, offset: 0 });

  // At liftoff/touchdown the spacecraft and the fixed reference can project to the same pixel. Move only the
  // reference's screen-space target aside (with a leader back to its true 3D anchor) so both remain hoverable.
  // Measure the untransformed Html wrapper; moving the target itself must not change the scientific position.
  useEffect(() => {
    if (markerType !== 'launch' && markerType !== 'site') return;
    let frame = 0;
    let lastCheck = 0;
    const update = (now: number) => {
      if (now - lastCheck >= 100) {
        lastCheck = now;
        const element = root.current;
        const spacecraft = document.querySelector<HTMLElement>('[data-marker-type="spacecraft"]');
        const a = element?.parentElement?.getBoundingClientRect();
        const b = spacecraft?.parentElement?.getBoundingClientRect();
        let screenOffset = 0;
        if (a?.width && a.height && b?.width && b.height) {
          const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
          const bx = b.left + b.width / 2, by = b.top + b.height / 2;
          const dx = ax - bx;
          if (Math.abs(dx) < 42 && Math.abs(ay - by) < 34) {
            if (!offsetSide.current) {
              // Keep the reference on-screen and choose the nearest side; hold it there until the overlap ends.
              offsetSide.current = bx < 70 ? 1 : bx > window.innerWidth - 70 ? -1 : dx > 2 ? 1 : -1;
            }
            screenOffset = offsetSide.current * 42 - dx;
          } else offsetSide.current = 0;
        } else offsetSide.current = 0;
        if (element && Math.abs(screenOffset - lastScreenOffset.current) > 0.25) {
          lastScreenOffset.current = screenOffset;
          element.style.setProperty('--marker-screen-offset', `${screenOffset}px`);
          element.style.setProperty('--marker-connector-width', `${Math.abs(screenOffset)}px`);
          if (screenOffset) element.dataset.offsetSide = screenOffset < 0 ? 'left' : 'right';
          else delete element.dataset.offsetSide;
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [markerType]);

  function locateCard() {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const card = root.current?.querySelector<HTMLElement>('.flight-marker-card');
    const height = card?.offsetHeight ?? 260;
    const width = card?.offsetWidth ?? 278;
    const fitsRight = rect.right + 10 + width <= window.innerWidth - 12;
    const fitsLeft = rect.left - 10 - width >= 12;
    const centered = !fitsRight && !fitsLeft;
    const naturalTop = rect.top + rect.height / 2 - height * 0.28;
    const up = naturalTop + height > window.innerHeight - 96;
    // On a narrow screen there may be room on neither side: center the card above/below the marker instead.
    const centeredLeft = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
    const roomAbove = rect.top - height - 10 >= 60;
    const roomBelow = rect.bottom + height + 10 <= window.innerHeight - 96;
    setPlacement({
      left: fitsLeft && (!fitsRight || root.current?.dataset.offsetSide === 'left'),
      up,
      low: !up && naturalTop < 70,
      centered,
      centerUp: centered && (roomAbove || (!roomBelow && rect.top > window.innerHeight / 2)),
      offset: centeredLeft - rect.left,
    });
  }
  function show() { locateCard(); setOpen(true); onHover?.(true); }
  function hide() { setOpen(false); onHover?.(false); }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
        onHover?.(false);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, onHover]);

  return (
    <Html center position={position} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
      <div
        ref={root}
        className={`flight-marker${open ? ' is-open' : ''}${placement.left ? ' card-left' : ''}${placement.up ? ' card-up' : ''}${placement.low ? ' card-low' : ''}${placement.centered ? ' card-centered' : ''}${placement.centerUp ? ' card-center-up' : ''}`}
        style={{ '--marker-accent': color, '--card-centered-left': `${placement.offset}px` } as CSSProperties}
        data-marker-type={markerType}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') show(); }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') hide(); }}
        onFocus={() => { if (pointerType.current !== 'touch') show(); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hide(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); hide(); button.current?.blur(); } }}
      >
        <button
          ref={button}
          type="button"
          className="flight-marker-target"
          aria-label={`${title}: show details`}
          aria-expanded={open}
          aria-controls={id}
          onPointerDown={(e) => {
            e.stopPropagation();
            pointerType.current = e.pointerType;
            touchStartedOpen.current = open;
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (pointerType.current === 'touch') {
              if (touchStartedOpen.current) hide(); else show();
            } else if (e.detail === 0) show();
            pointerType.current = '';
            onActivate?.();
          }}
        >
          <span className="flight-marker-core" aria-hidden="true" />
        </button>
        <div className="flight-marker-card" id={id} role="region" aria-label={`${title} details`} aria-hidden={!open}>
          <div className="flight-card-top">
            <span className="flight-card-eyebrow"><i />{category}</span>
            {badge && <span className="flight-card-badge">{badge}</span>}
          </div>
          <div className="flight-card-title">{title}</div>
          <div className="flight-card-rule" />
          <div className="flight-card-grid">
            {details.map((item, index) => (
              <div className={`flight-card-detail${item.value.length > 38 ? ' wide' : ''}`} key={`${item.label}-${index}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          {note && <div className="flight-card-note">{note}</div>}
        </div>
      </div>
    </Html>
  );
}
