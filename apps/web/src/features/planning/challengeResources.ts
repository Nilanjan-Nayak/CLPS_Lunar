/** The challenge's NASA resources, the LOLA dataset named in its brief, and its CSA partner link.
 * Other source records stay in the backend for factual / asset provenance, not the resource catalogue.
 */
export const CHALLENGE_BRIEF = 'https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources';

export interface ChallengeResource {
  id: 'quickmap' | 'moon-trek' | 'horizons' | 'lola' | 'csa';
  sourceId: string;
  name: string;
  group: 'NASA challenge resource' | 'NASA dataset in challenge brief' | 'Challenge partner resource';
  url: string;
  short: string;
  application: string;
  badge: string;
}

export const CHALLENGE_RESOURCES: ChallengeResource[] = [
  {
    id: 'quickmap', sourceId: 'src-lroc-quickmap', name: 'LROC QuickMap', group: 'NASA challenge resource',
    // The challenge's quickmap.lroc.asu.edu URL now redirects here; this is QuickMap's announced canonical host.
    url: 'https://quickmap.lroc.im-ldi.com/', badge: 'SITE HANDOFF',
    short: 'Explore lunar imagery and topography from the LRO camera team at Arizona State University.',
    application: 'Open the active landing coordinates in QuickMap to inspect imagery, terrain and available high-resolution layers. QuickMap is an external inspection tool, not a live numeric input to the planner.',
  },
  {
    id: 'moon-trek', sourceId: 'src-nasa-trek-wac', name: 'NASA Moon Trek', group: 'NASA challenge resource',
    url: 'https://trek.nasa.gov/moon/', badge: 'IN THE 3D VIEW',
    short: 'NASA’s 3D lunar mapping portal and its Solar System Treks map-tile services.',
    application: 'Moon Trek’s LROC WAC mosaic is streamed through our backend into the 3D terrain and into the active-site preview. These are images, not elevations.',
  },
  {
    id: 'horizons', sourceId: 'src-jpl-horizons', name: 'JPL Horizons', group: 'NASA challenge resource',
    url: 'https://ssd.jpl.nasa.gov/horizons/', badge: 'ON-DEMAND CHECK',
    short: 'NASA JPL ephemerides for Sun and Earth as seen from a lunar surface location.',
    application: 'Request a live Horizons observer table for the active site and touchdown time; apply the LOLA horizon to estimate sampled sunlight and Earth visibility. The automatic mission plan still uses the local analytical model.',
  },
  {
    id: 'lola', sourceId: 'src-lola-pds', name: 'LRO LOLA topography', group: 'NASA dataset in challenge brief',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm', badge: 'TERRAIN + HORIZON',
    short: 'Lunar Orbiter Laser Altimeter elevation products provide the terrain context.',
    application: 'LOLA polar GDR data, where available, and a lower-resolution LOLA-derived regional fallback drive elevation, slope and the terrain horizon. The active dataset and resolution are shown in the plan.',
  },
  {
    id: 'csa', sourceId: 'src-csa-moon', name: 'CSA Moon Exploration', group: 'Challenge partner resource',
    url: 'https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/', badge: 'PARTNER CONTEXT',
    short: 'Canadian Space Agency background on lunar missions and Canada’s Artemis contributions.',
    application: 'Use this partner portal for mission and technology context. It is not treated as terrain, imagery or ephemeris input.',
  },
];

/** Frame the active site using QuickMap's published lunar projection definitions
 * and projected-metre `prjExtent` permalink. Nearside orthographic (proj 10)
 * cannot display the far side, so use a global cylindrical projection at low
 * latitudes, farside orthographic across the dateline, and polar stereographic
 * near either pole. A 120 km projected square keeps the target at the centre.
 * Projection IDs and radius: https://quickmap.lroc.im-ldi.com/maps/lroc
 */
export function quickMapSiteUrl(lat: number, lon: number): string {
  const latitude = Math.max(-90, Math.min(90, lat));
  const longitude = Math.max(-180, Math.min(180, lon));
  const radians = Math.PI / 180;
  const phi = latitude * radians, lambda = longitude * radians;
  const radius = 1_737_400; // metres, QuickMap lunar reference sphere
  let projection: number;
  let x: number;
  let y: number;

  if (Math.abs(latitude) >= 70) {
    projection = latitude < 0 ? 27 : 26; // south / north polar stereographic
    const rho = 2 * radius * Math.tan((Math.PI / 2 - Math.abs(phi)) / 2);
    x = rho * Math.sin(lambda);
    y = (latitude < 0 ? 1 : -1) * rho * Math.cos(lambda);
  } else if (Math.abs(longitude) >= 150) {
    projection = 7; // farside orthographic, centred on 180°
    x = radius * Math.cos(phi) * Math.sin(lambda - Math.PI);
    y = radius * Math.sin(phi);
  } else {
    projection = 16; // equidistant cylindrical, centred on 0°
    x = radius * lambda;
    y = radius * phi;
  }

  const half = 60_000;
  const url = new URL('https://quickmap.lroc.im-ldi.com/');
  url.searchParams.set('prjExtent', [x - half, y - half, x + half, y + half].map((v) => v.toFixed(2)).join(','));
  url.searchParams.set('proj', String(projection));
  url.searchParams.set('showGraticule', 'true');
  return url.toString();
}
