import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'selenara_tour_seen_v2';
const STEP_STORAGE_KEY = 'selenara_tour_step_v2';

interface TourStep {
  target: string;
  targetPath?: string;
  label: string;
  title: string;
  description: string;
  tip: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'brand',
    label: 'Start here',
    title: 'Your mission home',
    description: 'Use SELENARA X to return to the main 3D space view from anywhere in the app.',
    tip: 'The Guide button is always available in the top navigation.',
  },
  {
    target: 'views',
    label: 'Step 2 of 9',
    title: 'Choose a 3D view',
    description: 'Space shows the full Earth–Moon scene, Moon focuses on the lunar surface, and History lets you review missions.',
    tip: 'You can switch views without losing your mission context.',
  },
  {
    target: 'navigator',
    label: 'Step 3 of 9',
    title: 'Open the Mission Navigator',
    description: 'This is the easiest place to plan a landing, inspect power, check sunlight, and compare lunar sites.',
    tip: 'Select a site and lander first; the dashboard updates automatically.',
  },
  {
    target: 'studio',
    label: 'Step 4 of 9',
    title: 'Follow the four-step workflow',
    description: 'Mission Studio groups Plan, Schedule Resilience, Pareto Sites, and the final Decision Report in one menu.',
    tip: 'Follow the numbered steps when you are unsure what to do next.',
  },
  {
    target: 'navigator-header',
    targetPath: '/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1&tour=1',
    label: 'Step 5 of 9',
    title: 'Read the Mission Navigator',
    description: 'The right-side workbench is your control panel. It stays connected to the interactive 3D lunar scene.',
    tip: 'On a phone, use Open Mission Navigator to show or hide this panel.',
  },
  {
    target: 'navigator-tabs',
    targetPath: '/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1&tour=1',
    label: 'Step 6 of 9',
    title: 'Explore one mission question at a time',
    description: 'Golden & Power checks landing conditions, Delay & MRI tests launch slips, Pareto Sites compares locations, and Confidence explains the result.',
    tip: 'Start with Golden & Power, then move left to right through the tabs.',
  },
  {
    target: 'pdf-report',
    targetPath: '/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1&tour=1',
    label: 'Step 7 of 9',
    title: 'Export a decision brief',
    description: 'Open PDF Report when you need a printable summary of the selected site, engineering checks, risks, and data confidence.',
    tip: 'The report is useful for sharing a mission decision with your team.',
  },
  {
    target: 'copilot',
    label: 'Step 8 of 9',
    title: 'Ask the AI Copilot',
    description: 'Ask questions in plain language, compare missions, or request a landing-window explanation without learning technical commands.',
    tip: 'Use specific coordinates or a site name for the clearest answer.',
  },
  {
    target: 'guide',
    label: 'Step 9 of 9',
    title: 'You are ready to explore',
    description: 'Reopen this guided tour any time from the ? Guide button. Use Next or the arrow keys to move through steps.',
    tip: 'You can close the tour now and start with the Mission Navigator.',
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTargetRect(target: string): TargetRect | null {
  const element = document.querySelector<HTMLElement>(`[data-tour-target="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function getCalloutPosition(rect: TargetRect | null) {
  if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  const below = rect.top + rect.height + 18;
  const top = below + 220 < window.innerHeight ? below : Math.max(18, rect.top - 220);
  const left = Math.min(Math.max(18, rect.left + rect.width / 2 - 190), window.innerWidth - 398);
  return { top: `${top}px`, left: `${left}px` };
}

export function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [idx, setIdx] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(STEP_STORAGE_KEY));
      return Number.isInteger(saved) ? Math.min(TOUR_STEPS.length - 1, Math.max(0, saved)) : 0;
    } catch {
      return 0;
    }
  });
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const cur = TOUR_STEPS[idx];

  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem(STEP_STORAGE_KEY, String(idx));
    } catch {
      // Session storage is optional; the current screen still works without it.
    }
  }, [idx, open]);

  const refreshTarget = useCallback(() => {
    setTargetRect(getTargetRect(cur.target));
  }, [cur.target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIdx((value) => Math.min(TOUR_STEPS.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIdx((value) => Math.max(0, value - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !cur.targetPath) return;
    const [targetPath, targetSearch] = cur.targetPath.split('?');
    if (pathname !== targetPath) navigate(cur.targetPath);
    else if (targetSearch && window.location.search !== `?${targetSearch}`) navigate(cur.targetPath);
  }, [cur.targetPath, navigate, open, pathname]);

  useLayoutEffect(() => {
    if (!open) return;
    refreshTarget();
    const onChange = () => refreshTarget();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const timer = window.setTimeout(refreshTarget, 250);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [idx, open, refreshTarget, pathname]);

  if (!open) return null;
  const calloutPosition = getCalloutPosition(targetRect);
  const closeAndRemember = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.removeItem(STEP_STORAGE_KEY);
    } catch {
      // Storage is optional; the guide still works without it.
    }
    onClose();
  };
  const next = () => {
    if (idx === TOUR_STEPS.length - 1) closeAndRemember();
    else setIdx((value) => value + 1);
  };

  return createPortal(
    <div className="tour-backdrop tour-spotlight-backdrop" role="dialog" aria-modal="true" aria-label="SELENARA X guided tour">
      {targetRect && (
        <div
          className="tour-spotlight"
          style={{
            top: `${targetRect.top - 7}px`,
            left: `${targetRect.left - 7}px`,
            width: `${targetRect.width + 14}px`,
            height: `${targetRect.height + 14}px`,
          }}
          aria-hidden="true"
        />
      )}
      <div className="tour-callout" style={calloutPosition}>
        <div className="tour-callout-arrow" aria-hidden="true" />
        <div className="tour-callout-head">
          <span className="tour-callout-kicker">{cur.label}</span>
          <button type="button" className="tour-close-btn" onClick={closeAndRemember} aria-label="Close guide">✕</button>
        </div>
        <div className="tour-progress" aria-label={`Tour step ${idx + 1} of ${TOUR_STEPS.length}`}>
          <span style={{ width: `${((idx + 1) / TOUR_STEPS.length) * 100}%` }} />
        </div>
        <h2>{cur.title}</h2>
        <p>{cur.description}</p>
        <div className="tour-callout-tip"><strong>Try this:</strong> {cur.tip}</div>
        <div className="tour-callout-foot">
          <span className="mono">{idx + 1} / {TOUR_STEPS.length}</span>
          <div>
            <button type="button" className="btn small" disabled={idx === 0} onClick={() => setIdx((value) => value - 1)}>Back</button>
            <button type="button" className="tour-next-btn" onClick={next}>
              {idx === TOUR_STEPS.length - 1 ? 'Start exploring' : 'Next'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useGuidedTourState() {
  const { search } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get('tour') === '1') {
      setOpen(true);
      return;
    }
    if (params.get('tour') === '0' || params.get('quality') === 'low' || params.get('run') === '1') return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [search]);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Storage is optional; the guide can still be closed.
    }
    setOpen(false);
  };

  return { open, setOpen, close };
}
