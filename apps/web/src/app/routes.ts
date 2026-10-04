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

export const NAV_LINKS: { to: string; label: string; scene: boolean }[] = [
  { to: '/space', label: 'Space', scene: true },
  { to: '/moon', label: 'Moon', scene: true },
  { to: '/moon?history=1', label: 'History', scene: true },
  { to: '/plan', label: 'Plan', scene: false },
  { to: '/missions', label: 'Missions', scene: false },
  { to: '/map', label: 'Map', scene: false },
  { to: '/timeline', label: 'Timeline', scene: false },
  { to: '/payloads', label: 'Payloads', scene: false },
  { to: '/providers', label: 'Providers', scene: false },
  { to: '/research', label: 'Research', scene: false },
  { to: '/copilot', label: 'Copilot', scene: false },
  { to: '/assets', label: 'Assets', scene: false },
  { to: '/sources', label: 'Sources', scene: false },
];
