import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'selenara_tour_seen_v1';

interface TourStep {
  step: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  researcherTip: string;
  actionLabel: string;
  actionTo: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    step: '01 / 06',
    badge: 'NASA SPACE APPS 2026 · OVERVIEW',
    title: 'Welcome to SELENARA X — Lunar Landing Site Navigator',
    subtitle: 'Bridging NASA LOLA Topography, Horizons Verification & 3D Mission Intelligence',
    description:
      'Missions to the lunar south pole face extreme lighting and communication constraints where small changes in landing site or date determine mission survival. This platform lets mission planners, researchers, and students rapidly evaluate candidate sites and dates in a real-time 3D Earth–Moon environment backed by a Python physics & ephemeris engine.',
    highlights: [
      'Real-time 3D Earth–Moon sky (NASA SVS Deep Star Map 2020, Blue/Black Marble Earth, LOLA DEM + LROC WAC Moon)',
      '360° ray-traced terrain horizon masks (0.0 arcmin vacuum refraction) & IAU 2009 optical libration',
      'End-to-end decision workflow: 01 Plan & Power → 02 Schedule Resilience (MRI) → 03 Pareto Optimizer → 04 PDF Report',
      'Inspect the active site in QuickMap, stream Moon Trek imagery, and run an on-demand JPL Horizons check against the LOLA horizon',
    ],
    researcherTip:
      'Use the top command bar to switch between the [3D Viewport], [⚡ 3D Navigator], [Mission Studio ▾], [Missions], [Atlas & Data ▾], and [✦ Copilot].',
    actionLabel: '⚡ Launch Flagship 3D Navigator',
    actionTo: '/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1',
  },
  {
    step: '02 / 06',
    badge: '3D SOLAR SYSTEM & ROCKET TRAJECTORIES',
    title: 'Animated Earth Launch → Lunar Touchdown Journeys',
    subtitle: 'Watch Real & Planned Missions Lift Off from Earth, Coast & Descend to the Surface',
    description:
      'Every flown CLPS mission (IM-1 Odysseus, Blue Ghost M1, IM-2 Athena, Peregrine) and every user landing plan features an event-anchored trajectory. Watch the rocket launch directly from Kennedy Space Center on the rotating 3D Earth, execute Trans-Lunar Injection (Izzo Lambert solver), enter a 100 km lunar capture orbit, and fly a closed-loop E-guidance powered descent onto the LOLA DEM terrain.',
    highlights: [
      'Click [↑ Launch], [~ Transfer to Moon], or [↓ Landing] in the left Simulation Panel to jump to any flight phase',
      'Hover over or tap a spacecraft, launch or landing marker for details; move away to keep the orbit unobstructed',
      'Zoom all the way down to 30 meters Above Ground Level (AGL) with level-horizon surface camera & compass NavHud',
      'Compare direct transfers (~4.5d coast) vs low-energy / Earth-phasing loops (Blue Ghost M1 46-day profile)',
    ],
    researcherTip:
      'Below 60 km altitude, honest visualization aids (procedural regolith micro-detail & low-Sun auto-exposure) can be toggled in Scene Config.',
    actionLabel: '▲ Watch Blue Ghost M1 Earth→Moon Journey',
    actionTo: '/missions/blue-ghost-mission-1/journey',
  },
  {
    step: '03 / 06',
    badge: 'HYBRID 3D COCKPIT · /navigator',
    title: '⚡ 3D Navigator: 360° Polar Sky-Dome, Power & Sunset Countdowns',
    subtitle: 'Synchronized 3D Surface Lighting + Electrical Power Balance & Golden Windows',
    description:
      'The Hybrid 3D Navigator combines the 3D lunar surface with real-time engineering telemetry. Inspect the 360° Polar Sky-Dome horizon mask, track solar array generation (P_solar vs P_load) and Li-ion battery State of Charge (SOC %), and read exact countdowns to the next terrain-masked sunset and Earthset.',
    highlights: [
      '360° Polar Sky-Dome plots local LOLA crater/ridge masks against the Sun trajectory and Earth libration zone',
      'Golden Mission Window engine identifies continuous intervals where Sun + Battery SOC ≥ 20% + Earth/Relay LOS overlap',
      'Quick-switch between 12 curated sites across NASA CLPS, Artemis III South Pole, Apollo Heritage & ISRO/JAXA missions',
    ],
    researcherTip:
      'Polar landers use vertical cylindrical solar arrays optimized for <5° solar grazing angles, whereas equatorial landers use horizontal decks.',
    actionLabel: '⚡ Explore Mare Crisium in 3D Navigator',
    actionTo: '/navigator?latitude=18.56&longitude=61.81&landerId=blue-ghost&surfaceDays=14&run=1',
  },
  {
    step: '04 / 06',
    badge: 'STUDIO 02 · SCHEDULE RESILIENCE & MRI',
    title: 'Schedule-Delay Simulator & Mission Resilience Index (MRI)',
    subtitle: 'What Happens When Launch Slips by +1, +3, +7, or +14 Days?',
    description:
      'Lunar launch dates frequently slip due to hardware or weather holds. Our Resilience Engine re-runs topocentric Sun/Earth ephemeris, terrain horizon masking, and battery SOC integration across 10 delay scenarios (+0d to +28d) to compute the Mission Resilience Index: MRI = (feasible tested scenarios / total tested scenarios) × 100.',
    highlights: [
      'Click any delay chip (+1d, +3d, +7d, +14d) in the 3D Navigator to see the 3D Moon shadows shift in real time',
      'Identifies the exact Critical Launch Slip day where battery SOC or solar illumination first fails',
      'Automatically scans the next 2 synodic months (60 days) to recommend the Best Recovery Launch Window',
    ],
    researcherTip:
      'South-polar plateaus like Mons Mouton have high baseline viability at local sunrise but fail if delayed by ≥ +5 days without re-targeting the next synodic month.',
    actionLabel: '◈ Open Schedule Resilience Lab (MRI)',
    actionTo: '/resilience?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1',
  },
  {
    step: '05 / 06',
    badge: 'STUDIO 03 & 04 · PARETO & DECISION BRIEF',
    title: '5-Objective Pareto Site Optimizer & Printable PDF Report',
    subtitle: 'Find Non-Dominated Landing Sites & Export Engineering Provenance Briefs',
    description:
      'Instead of evaluating one site at a time, the Pareto Optimizer evaluates 12+ candidate sites simultaneously. Hard constraints filter infeasible sites first; non-dominated Pareto sorting identifies Rank #1 frontier solutions across Solar Availability, Earth Visibility, Terrain Safety, Darkness Survival, and MRI.',
    highlights: [
      'Interactive 2D Pareto Frontier scatter plot with selectable X/Y objective axes and per-site delay strips',
      'Deterministic, provenance-backed "Why Recommended" & "Known Risks" generated from exact engine numbers',
      '5-Domain Confidence & Printable PDF Decision Report separating Terrain, Ephemeris, Power, Comms & Exploratory ML',
    ],
    researcherTip:
      'Toggle "Lunar Relay Orbiter available" in the Optimizer to see how a relay satellite unlocks far-side and deep south-polar sites like Schrödinger Basin.',
    actionLabel: '◎ Open 5-Objective Pareto Optimizer',
    actionTo: '/optimizer?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1',
  },
  {
    step: '06 / 06',
    badge: 'AI COPILOT & NASA VERIFICATION',
    title: '✦ AI Mission Copilot & Official NASA Cross-Verification',
    subtitle: 'Ask Questions in Plain Language or Cross-Check Every Coordinate in NASA Portals',
    description:
      'Use the Command Bar at the bottom of the 3D view or open [✦ Copilot] to query mission facts, compute next landing windows, or command the 3D camera in natural language. Every answer cites primary NSSDCA, LROC, and PDS sources, and never invents unverified trajectories.',
    highlights: [
      'Try asking: "plan a landing at 84.79 S, 29.2 E with Nova-C", "compare IM-1 and IM-2", or "next landing window at Mons Mouton"',
      'In a landing plan, inspect the target in QuickMap and click [Run JPL Horizons check] for a sampled Sun / Earth comparison using the LOLA horizon',
      'Moon Trek imagery is streamed into the 3D Moon and site preview; the CSA partner portal provides additional mission background',
      'Re-open this Mission Guide anytime using the [? Guide] button in the top navigation bar',
    ],
    researcherTip:
      'The AI Copilot proposes validated SceneIntents and cited answers—it never bypasses the physics engine or invents telemetry.',
    actionLabel: '✦ Open AI Mission Copilot',
    actionTo: '/copilot',
  },
];

export function GuidedTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(TOUR_STEPS.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const cur = TOUR_STEPS[idx];

  const handleLaunch = (to: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore storage errors
    }
    onClose();
    navigate(to);
  };

  return createPortal(
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="SELENARA X Interactive Mission Guide">
      <div className="tour-modal">
        {/* Header */}
        <div className="tour-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="brand-dot" />
            <span className="mono" style={{ fontSize: 11, color: '#8fd3ff', fontWeight: 700, letterSpacing: '0.08em' }}>
              {cur.step} · {cur.badge}
            </span>
          </div>
          <button type="button" className="btn small mono" onClick={onClose} title="Close guide (Esc)">
            ✕ Close Guide
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="tour-steps-bar">
          {TOUR_STEPS.map((s, i) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setIdx(i)}
              className={`tour-step-dot${i === idx ? ' active' : i < idx ? ' done' : ''}`}
            >
              <span className="mono">0{i + 1}</span>
              <span>{s.title.split('—')[0].replace(/^⚡\s*/, '').slice(0, 18)}</span>
            </button>
          ))}
        </div>

        {/* Main Body */}
        <div className="tour-body">
          <h2 style={{ fontSize: 21, color: '#f4f8ff', marginBottom: 4 }}>{cur.title}</h2>
          <div style={{ fontSize: 13, color: '#ffd166', fontWeight: 500, marginBottom: 10 }}>{cur.subtitle}</div>
          <p style={{ fontSize: 13.5, color: '#c7d5e8', lineHeight: 1.55, margin: '0 0 14px' }}>{cur.description}</p>

          <div className="tour-highlights">
            <div className="mono" style={{ fontSize: 10.5, color: '#8fd3ff', letterSpacing: '0.08em', marginBottom: 6 }}>
              KEY CAPABILITIES &amp; HOW TO USE:
            </div>
            <ul>
              {cur.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>

          <div className="tour-tip">
            <span className="mono" style={{ fontSize: 10, color: '#5ee6a8', fontWeight: 700 }}>
              RESEARCHER / JUDGE PRO-TIP:
            </span>{' '}
            <span>{cur.researcherTip}</span>
          </div>

          {/* Quick Role Jumpers on Step 1 */}
          {idx === 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="mono dim" style={{ fontSize: 10, marginBottom: 6 }}>
                QUICK JUMP BY WORKFLOW ROLE:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                <button
                  type="button"
                  className="tour-role-card"
                  onClick={() => handleLaunch('/navigator?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1')}
                >
                  <strong>⚡ 3D Navigator</strong>
                  <small>Live 3D Moon + Power &amp; Delay</small>
                </button>
                <button
                  type="button"
                  className="tour-role-card"
                  onClick={() => handleLaunch('/optimizer?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1')}
                >
                  <strong>◎ Pareto Sites</strong>
                  <small>Compare 12+ Lunar Sites</small>
                </button>
                <button
                  type="button"
                  className="tour-role-card"
                  onClick={() => handleLaunch('/resilience?latitude=-84.79&longitude=29.2&landerId=nova-c&surfaceDays=14&run=1')}
                >
                  <strong>◈ MRI Lab</strong>
                  <small>Launch-Slip Resilience</small>
                </button>
                <button
                  type="button"
                  className="tour-role-card"
                  onClick={() => handleLaunch('/missions/im-1/journey')}
                >
                  <strong>▲ 3D Rocket Flight</strong>
                  <small>Earth Launch → Moon</small>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="tour-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn small"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              ← Previous
            </button>
            {idx < TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                className="btn small"
                onClick={() => setIdx((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}
              >
                Next Step ({idx + 2}/{TOUR_STEPS.length}) →
              </button>
            ) : (
              <button type="button" className="btn small" onClick={onClose}>
                ✓ Finish Guide
              </button>
            )}
          </div>

          <button
            type="button"
            className="tour-cta-btn"
            onClick={() => handleLaunch(cur.actionTo)}
          >
            <span>{cur.actionLabel}</span>
            <span className="mono">→</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Hook that manages first-time auto-open (skipping automated e2e `?quality=low` / `?run=1` URLs unless `?tour=1`). */
export function useGuidedTourState() {
  const { search } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(search);
    if (sp.get('tour') === '1') {
      setOpen(true);
      return;
    }
    if (sp.get('tour') === '0' || sp.get('quality') === 'low' || sp.get('run') === '1') {
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') {
        setOpen(true);
      }
    } catch {
      // ignore
    }
  }, [search]);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  return { open, setOpen, close };
}
