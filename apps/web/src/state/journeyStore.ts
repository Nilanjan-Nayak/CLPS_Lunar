import { create } from 'zustand';
import type { Journey, JourneySegment, JourneySegmentKind } from '@/types/domain';

/**
 * Journey playback state (Earth launch → Moon). The route itself travels inside the SceneConfig (a 'journey' scene
 * object); this store only mirrors it for the renderer and the panel, and owns the playback cursor.
 *
 * Time compression: every segment gets a fixed on-screen duration at 1× (a 6-day coast and a 9-minute ascent are both
 * watchable); the world clock is driven with the *real* UTC (launch + t) so the Earth, Moon and Sun follow the flight.
 */
export const SEGMENT_SCREEN_SECONDS: Record<JourneySegmentKind, number> = {
  ascent: 6, parking: 5, phasing: 14, translunar: 16, 'lunar-orbit': 10, 'descent-orbit': 6, descent: 18, return: 14,
};

export const SEGMENT_COLORS: Record<JourneySegmentKind, string> = {
  ascent: '#ffb454', parking: '#7fe0ff', phasing: '#52d7c2', translunar: '#8fd3ff', 'lunar-orbit': '#7fe0ff', 'descent-orbit': '#c792ff', descent: '#ff7ad9', return: '#ffd166',
};

export type JourneyView = 'follow' | 'overview' | 'free';

export interface JourneyReadout {
  segmentId: string | null;
  segmentLabel: string;
  /** km above the nearest body's mean surface (Earth or Moon) */
  altitudeKm: number;
  nearBody: 'earth' | 'moon';
  speedKms: number;
  distanceEarthKm: number;
  distanceMoonKm: number;
  utc: string;
}

interface JourneyStore {
  journey: Journey | null;
  /** seconds since launch */
  t: number;
  playing: boolean;
  speed: number;
  view: JourneyView;
  finished: boolean;
  readout: JourneyReadout;
  setJourney: (j: Journey | null) => void;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setT: (t: number) => void;
  setSpeed: (s: number) => void;
  setView: (v: JourneyView) => void;
  setReadout: (r: JourneyReadout) => void;
}

const emptyReadout: JourneyReadout = { segmentId: null, segmentLabel: '', altitudeKm: 0, nearBody: 'earth', speedKms: 0, distanceEarthKm: 0, distanceMoonKm: 0, utc: '' };

export const useJourneyStore = create<JourneyStore>((set) => ({
  journey: null,
  t: 0,
  playing: false,
  speed: 1,
  view: 'follow',
  finished: false,
  readout: emptyReadout,
  setJourney: (journey) => set({ journey, t: 0, playing: false, finished: false, readout: emptyReadout }),
  play: () => set((s) => ({ playing: true, t: s.finished ? 0 : s.t, finished: false })),
  pause: () => set({ playing: false }),
  restart: () => set({ t: 0, playing: true, finished: false }),
  setT: (t) => set((s) => {
    const end = s.journey ? journeyEndS(s.journey) : Infinity;
    const tt = Math.max(0, Math.min(end, t));
    return { t: tt, finished: tt >= end };
  }),
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  setReadout: (readout) => set({ readout }),
}));

export const journeyEndS = (j: Journey) => (Date.parse(j.endUtc) - Date.parse(j.launchUtc)) / 1000;

export function segmentAt(j: Journey, t: number): JourneySegment {
  const segs = j.segments;
  for (const s of segs) {
    const s0 = s.samples[0][0], s1 = s.samples[s.samples.length - 1][0];
    if (t >= s0 && t <= s1) return s;
  }
  // between segments (gaps are not expected) or past the end
  return t < segs[0].samples[0][0] ? segs[0] : segs[segs.length - 1];
}

/** journey seconds advanced per real second inside a segment (so every phase is watchable). */
export function journeyRate(seg: JourneySegment, speed: number) {
  return (Math.max(1, seg.durationS) / SEGMENT_SCREEN_SECONDS[seg.kind]) * speed;
}

/** Scrub slider ↔ journey time with the same per-segment share the playback uses. */
export function scrubMap(j: Journey) {
  const segs = j.segments;
  const spans = segs.map((s) => SEGMENT_SCREEN_SECONDS[s.kind]);
  const total = spans.reduce((a, b) => a + b, 0);
  const start = (s: JourneySegment) => s.samples[0][0];
  const end = (s: JourneySegment) => s.samples[s.samples.length - 1][0];
  const toT = (v: number) => {
    let acc = 0;
    const x = (v / 1000) * total;
    for (let i = 0; i < segs.length; i++) {
      if (x <= acc + spans[i]) return start(segs[i]) + ((x - acc) / spans[i]) * (end(segs[i]) - start(segs[i]));
      acc += spans[i];
    }
    return end(segs[segs.length - 1]);
  };
  const fromT = (t: number) => {
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (t <= end(segs[i])) return ((acc + Math.max(0, (t - start(segs[i])) / Math.max(1, end(segs[i]) - start(segs[i]))) * spans[i]) / total) * 1000;
      acc += spans[i];
    }
    return 1000;
  };
  return { toT, fromT, spans, total };
}

export function formatJourneyTime(s: number) {
  const neg = s < 0; s = Math.abs(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const p = neg ? 'T−' : 'T+';
  return d > 0 ? `${p}${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m` : `${p}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
