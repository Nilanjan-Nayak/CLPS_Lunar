import { usePlanOptions } from '@/services/queries';
import type { CuratedLunarSite, PlanInput, PlanResult } from '@/types/domain';
import { ChallengeDataWorkbench } from './ChallengeDataWorkbench';

export function SpaceAppsResourceBar({
  input,
  plan,
  onSelectSite,
  compact = false,
}: {
  input: PlanInput;
  plan?: PlanResult | null;
  onSelectSite?: (site: CuratedLunarSite) => void;
  compact?: boolean;
}) {
  const lat = input.latitude;
  const lon = input.longitude;
  // Comparison reference points are fetched from the research engine; React
  // never holds the mission database or hard-coded spacecraft-specific data.
  const { data: options, isError: sitesError } = usePlanOptions();
  const curatedSites = options?.challengeSites ?? [];

  // Compute time remaining before next terrain-masked sunset & Earthset from powerBudget / ephemeris samples
  const pb = plan?.powerBudget;
  const pbSamples = pb?.series ?? [];
  let hoursToSunset: number | null = null;
  let sunsetUtc: string | null = null;
  let hoursToEarthset: number | null = null;
  let earthsetUtc: string | null = null;

  if (pbSamples.length > 0) {
    const first = pbSamples[0];
    if (first.sunVisible) {
      const idx = pbSamples.findIndex((s) => !s.sunVisible);
      if (idx > 0) {
        hoursToSunset = pbSamples[idx].tHours;
        sunsetUtc = pbSamples[idx].utc;
      } else {
        hoursToSunset = pbSamples[pbSamples.length - 1].tHours;
      }
    } else {
      hoursToSunset = 0;
    }

    if (first.earthVisible) {
      const eIdx = pbSamples.findIndex((s) => !s.earthVisible);
      if (eIdx > 0) {
        hoursToEarthset = pbSamples[eIdx].tHours;
        earthsetUtc = pbSamples[eIdx].utc;
      } else {
        hoursToEarthset = pbSamples[pbSamples.length - 1].tHours;
      }
    } else {
      hoursToEarthset = 0;
    }
  }

  const s0 = pbSamples[0];
  const atLanding = plan?.ephemeris?.atLanding;

  return (
    <div
      className="panel challenge-resource-panel"
      style={{ marginBottom: compact ? 10 : 16 }}
    >
      <ChallengeDataWorkbench input={input} plan={plan} compact={compact} />

      {/* Middle row: Curated Multi-Program Site Presets (CLPS, Artemis, Apollo, International) */}
      {onSelectSite && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
            <span className="mono dim" style={{ fontSize: 10.5, letterSpacing: '0.06em' }}>
              QUICK-COMPARE LUNAR REFERENCE SITES · ROUNDED COORDINATES:
            </span>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {!curatedSites.length && <span className="dim" style={{ fontSize: 11 }}>{sitesError ? 'Reference sites unavailable; enter coordinates in the plan.' : 'Loading reference sites…'}</span>}
            {curatedSites.map((s) => {
              const active = Math.abs(s.latitude - lat) < 0.08 && Math.abs(s.longitude - lon) < 0.08;
              const catColor =
                s.category === 'CLPS'
                  ? '#8fd3ff'
                  : s.category === 'Artemis'
                    ? '#ffd166'
                    : s.category === 'Apollo'
                      ? '#5ee6a8'
                      : '#c792ff';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSite(s)}
                  title={`${s.name} (${s.agency}) — ${s.summary} ${s.precision ? `(${s.precision})` : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 9px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: active ? 'rgba(143, 211, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${active ? '#8fd3ff' : 'rgba(140, 180, 230, 0.16)'}`,
                    color: active ? '#fff' : '#c7d5e8',
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      padding: '0 4px',
                      borderRadius: 3,
                      color: catColor,
                      background: 'rgba(0,0,0,0.35)',
                      border: `1px solid ${catColor}44`,
                    }}
                  >
                    {s.category}
                  </span>
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom row: Key Space Apps Operational Readouts (Time to Sunset, Time to Earthset, Horizon Clearance, Libration) */}
      {plan && s0 && atLanding && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: 8,
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid rgba(140, 180, 230, 0.12)',
          }}
        >
          <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(4, 9, 18, 0.65)', border: '1px solid rgba(140,180,230,0.14)' }}>
            <div className="dim mono" style={{ fontSize: 10 }}>TIME BEFORE TERRAIN SUNSET</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: hoursToSunset && hoursToSunset >= 200 ? '#5ee6a8' : '#ffd166', marginTop: 2 }}>
              {hoursToSunset !== null
                ? hoursToSunset >= (input.surfaceDays ?? 14) * 24 - 2
                  ? `>${((input.surfaceDays ?? 14) * 24).toFixed(0)}h (${(hoursToSunset / 24).toFixed(1)}d sunlit)`
                  : `${hoursToSunset.toFixed(0)}h (${(hoursToSunset / 24).toFixed(1)}d left)`
                : '—'}
            </div>
            <div className="dim" style={{ fontSize: 10.5 }}>
              {sunsetUtc ? `Sampled ridge sunset at ${sunsetUtc.slice(0, 16)}Z` : s0.sunVisible ? 'No sunset found in the sampled mission window' : 'Sun below local terrain at touchdown'}
            </div>
          </div>

          <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(4, 9, 18, 0.65)', border: '1px solid rgba(140,180,230,0.14)' }}>
            <div className="dim mono" style={{ fontSize: 10 }}>TIME BEFORE EARTHSET (DTE LINK)</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: hoursToEarthset && hoursToEarthset > 0 ? '#8fd3ff' : '#ff6b6b', marginTop: 2 }}>
              {hoursToEarthset !== null
                ? hoursToEarthset === 0
                  ? input.useRelay
                    ? '0h DTE (Relay Assumed)'
                    : 'BELOW HORIZON (0h)'
                  : hoursToEarthset >= (input.surfaceDays ?? 14) * 24 - 2
                    ? `Continuous (${(hoursToEarthset / 24).toFixed(1)}d DTE)`
                    : `${hoursToEarthset.toFixed(0)}h before Earthset`
                : '—'}
            </div>
            <div className="dim" style={{ fontSize: 10.5 }}>
              {earthsetUtc ? `Earth drops behind ridge at ${earthsetUtc.slice(0, 16)}Z` : s0.earthVisible ? 'Direct-to-Earth LOS open entire window' : 'Far-side / polar ridge blocks Earth'}
            </div>
          </div>

          <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(4, 9, 18, 0.65)', border: '1px solid rgba(140,180,230,0.14)' }}>
            <div className="dim mono" style={{ fontSize: 10 }}>SOLAR &amp; EARTH RIDGE CLEARANCE</div>
            <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, color: '#e3ebf6', marginTop: 2 }}>
              ☀ {s0.sunClearanceDeg >= 0 ? '+' : ''}{s0.sunClearanceDeg.toFixed(1)}° · ⊕ {s0.earthClearanceDeg >= 0 ? '+' : ''}{s0.earthClearanceDeg.toFixed(1)}°
            </div>
            <div className="dim" style={{ fontSize: 10.5 }}>
              Terrain mask: ☀ {(s0.sunElevationDeg - s0.sunClearanceDeg).toFixed(1)}° / ⊕ {(s0.earthElevationDeg - s0.earthClearanceDeg).toFixed(1)}° (0&apos; vacuum refraction)
            </div>
          </div>

          <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(4, 9, 18, 0.65)', border: '1px solid rgba(140,180,230,0.14)' }}>
            <div className="dim mono" style={{ fontSize: 10 }}>OPTICAL LIBRATION &amp; RANGE</div>
            <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, color: '#c792ff', marginTop: 2 }}>
              {atLanding.subEarthLat >= 0 ? '+' : ''}{atLanding.subEarthLat.toFixed(2)}° lat, {atLanding.subEarthLon >= 0 ? '+' : ''}{atLanding.subEarthLon.toFixed(2)}° lon
            </div>
            <div className="dim" style={{ fontSize: 10.5 }}>
              Earth range {Math.round(atLanding.earthDistanceKm).toLocaleString()} km · Sub-solar {atLanding.subSolarLat.toFixed(1)}°
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
