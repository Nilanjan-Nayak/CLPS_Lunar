import type { SceneIntent } from '@/scene-manager/SceneConfig';

/** Intent ↔ URL mapping so deep links, browser history and the command bar all go through the same route table. */
export function intentToRoute(intent: SceneIntent): string {
  switch (intent.type) {
    case 'EXPLORE_SPACE':
      return '/space';
    case 'EXPLORE_EARTH':
      return '/earth';
    case 'EXPLORE_MOON':
      return '/moon';
    case 'SHOW_REGION':
      return `/regions/${intent.regionId}`;
    case 'SHOW_LANDING_SITE':
      return `/landing-sites/${intent.landingSiteId}${intent.journeyFromEarth ? '?journey=1' : ''}`;
    case 'SHOW_MISSION': {
      const q = new URLSearchParams();
      if (intent.detail !== 'basic') q.set('detail', intent.detail);
      if (intent.journeyFromEarth) q.set('journey', '1');
      const s = q.toString();
      return `/missions/${intent.missionId}/scene${s ? `?${s}` : ''}`;
    }
    case 'SHOW_MISSIONS': {
      const q = new URLSearchParams();
      if (intent.missionIds?.length) q.set('ids', intent.missionIds.join(','));
      if (intent.regionId) q.set('region', intent.regionId);
      if (intent.includeLanders) q.set('landers', '1');
      const s = q.toString();
      return `/missions/scene${s ? `?${s}` : ''}`;
    }
    case 'COMPARE':
      return `/compare?ids=${intent.missionIds.join(',')}`;
    case 'PLAN_LANDING': {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(intent.plan)) if (v != null) q.set(k, String(v));
      return `/plan/scene?${q.toString()}`;
    }
    case 'HISTORY':
      return '/moon?history=1';
    case 'SHOW_JOURNEY':
      return `/missions/${intent.missionId}/journey`;
    case 'PLAN_JOURNEY': {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(intent.plan)) if (v != null) q.set(k, String(v));
      if (intent.launchSiteId) q.set('launchSiteId', intent.launchSiteId);
      return `/plan/journey?${q.toString()}`;
    }
    case 'RESEARCH': {
      const q = new URLSearchParams();
      if (intent.missionId) q.set('mission', intent.missionId);
      if (intent.landingSiteId) q.set('site', intent.landingSiteId);
      if (intent.topic) q.set('topic', intent.topic);
      const s = q.toString();
      return `/research${s ? `?${s}` : ''}`;
    }
  }
}

export type NavGroup = 'explore' | 'navigator' | 'studio' | 'work' | 'data';

export interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  scene: boolean;
  group: NavGroup;
  step?: string;
  badge?: string;
  hint?: string;
}

/**
 * Structured navigation hierarchy:
 * - `explore`: 3D viewport modes (grouped into the 3D World capsule)
 * - `navigator`: Hybrid 3D + Mission Intelligence cockpit
 * - `studio`: 4-step SELENARA X engineering pipeline (grouped under Mission Studio dropdown & workflow stepper)
 * - `work`: Core mission manifest & AI Copilot
 * - `data`: Research lab & NASA reference catalogues (grouped under Research & Data menu)
 */
export const NAV_LINKS: NavItem[] = [
  { to: '/space', label: 'Space', scene: true, group: 'explore', hint: 'Real-time Earth–Moon system & NASA star sky' },
  { to: '/moon', label: 'Moon', scene: true, group: 'explore', hint: 'Interactive 3D Moon with CLPS landing sites & LOLA DEM' },
  { to: '/moon?history=1', label: 'History', scene: true, group: 'explore', hint: 'Chronological tour of 47 lunar landing attempts' },

  { to: '/navigator', label: '3D Navigator', shortLabel: 'Navigator', scene: true, group: 'navigator', badge: 'HYBRID', hint: 'Live 3D Lunar Surface synced with Schedule Resilience (MRI), Power & Pareto Optimizer' },

  { to: '/plan', label: 'Plan & Golden Window', shortLabel: 'Plan', scene: false, group: 'studio', step: '01', badge: 'POWER + 360°', hint: 'Δv & mass budgets, 360° polar horizon mask, solar power & battery SOC timeline' },
  { to: '/resilience', label: 'Resilience Lab (MRI)', shortLabel: 'MRI Lab', scene: false, group: 'studio', step: '02', badge: 'DELAY SWEEP', hint: 'Simulate +1d to +28d launch slips, calculate MRI score & find recovery windows' },
  { to: '/optimizer', label: 'Pareto Site Optimizer', shortLabel: 'Pareto', scene: false, group: 'studio', step: '03', badge: '5-OBJECTIVE', hint: 'Compare 10+ candidate sites across Solar, Earth LOS, Slope, Darkness & MRI' },
  { to: '/report', label: 'Confidence & Decision Report', shortLabel: 'Report', scene: false, group: 'studio', step: '04', badge: 'PDF BRIEF', hint: '5-domain scientific confidence breakdown, provenance & printable PDF report' },

  { to: '/missions', label: 'Missions', scene: false, group: 'work', hint: 'NASA CLPS task orders, landers & animated Earth→Moon flight journeys' },
  { to: '/copilot', label: 'Copilot', scene: false, group: 'work', badge: 'AI', hint: 'Ask questions or command the 3D scene in plain language' },

  { to: '/research', label: 'Historical ML & Catalogue', scene: false, group: 'data', badge: 'LAB', hint: '47-mission NSSDCA landing database & exploratory logistic outcome model' },
  { to: '/map', label: '2D Lunar Map', scene: false, group: 'data', hint: 'Landing sites and polar regions on the LROC WAC mosaic' },
  { to: '/timeline', label: 'Mission Timeline', scene: false, group: 'data', hint: 'Chronological CLPS launches, transits and landings' },
  { to: '/payloads', label: 'Science Payloads', scene: false, group: 'data', hint: 'NASA instruments and mass manifests per mission' },
  { to: '/providers', label: 'Commercial Providers', scene: false, group: 'data', hint: 'CLPS vendors, lander classes and propulsion specs' },
  { to: '/sources', label: 'Challenge Resources', scene: false, group: 'data', hint: 'QuickMap, Moon Trek, Horizons, LOLA terrain & the challenge partner resource' },
];
