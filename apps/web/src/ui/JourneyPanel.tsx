import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { intentToRoute } from '@/app/routes';
import { useJourneyIndex } from '@/services/queries';
import { SEGMENT_COLORS, formatJourneyTime, journeyEndS, scrubMap, useJourneyStore } from '@/state/journeyStore';
import { useSceneStore } from '@/state/sceneStore';
import type { Journey, JourneyEvent } from '@/types/domain';
import { Badge, KV, Note, Panel } from './primitives';

const GLYPH: Record<string, string> = { ascent: '↑', parking: '◯', phasing: '⟳', translunar: '⤳', 'lunar-orbit': '◎', 'descent-orbit': '◝', descent: '↓', return: '↩' };
const EVENT_GLYPH: Record<string, string> = { launch: '🚀', burn: '🔥', capture: '◎', doi: '◝', pdi: '↓', landing: '⌂', end: '■', note: '·' };
const fmtDur = (s: number) => (s >= 86400 ? `${(s / 86400).toFixed(1)} d` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);
const fmtUtc = (iso: string) => iso.replace('T', ' ').slice(0, 16) + 'Z';
const fmtKm = (km: number) => (km >= 10_000 ? `${Math.round(km / 1000).toLocaleString()},000 km` : km >= 50 ? `${Math.round(km).toLocaleString()} km` : `${Math.round(km * 1000).toLocaleString()} m`);

const FIDELITY: Record<Journey['fidelity'], { label: string; tone: 'ok' | 'warn' | 'info'; text: string }> = {
  reconstructed: { label: 'RECONSTRUCTED', tone: 'info', text: 'Published pad, times and site; two-body arcs between them (model, not telemetry).' },
  projected: { label: 'PROJECTED', tone: 'warn', text: 'Not flown yet: the provider\u2019s previous profile on an illustrative date in the announced window.' },
  planned: { label: 'PLANNED · MODEL', tone: 'warn', text: 'Computed for your plan from the precedent profile of the lander class — not a real flight.' },
};
const PROFILE: Record<Journey['profile'], string> = { direct: 'Direct transfer', phasing: 'Earth-orbit phasing loops → transfer', 'earth-return': 'Lunar-distance loop → Earth re-entry (no landing)' };

/** JourneyPanel — launch site, route, timing, playback and honesty labels of the animated Earth→Moon journey. */
export function JourneyPanel() {
  const active = useSceneStore((s) => s.config?.panels.includes('journey'));
  const intent = useSceneStore((s) => s.config?.intent);
  const journey = useJourneyStore((s) => s.journey);
  const t = useJourneyStore((s) => s.t);
  const playing = useJourneyStore((s) => s.playing);
  const speed = useJourneyStore((s) => s.speed);
  const view = useJourneyStore((s) => s.view);
  const readout = useJourneyStore((s) => s.readout);
  const finished = useJourneyStore((s) => s.finished);
  const scrub = useMemo(() => (journey ? scrubMap(journey) : null), [journey]);
  if (!active) return null;
  if (!journey) return <JourneyIndex />;
  const { play, pause, restart, setT, setSpeed, setView } = useJourneyStore.getState();
  const fid = FIDELITY[journey.fidelity];
  const endS = journeyEndS(journey);
  const st = journey.stats;
  const seek = (sec: number) => { pause(); setT(Math.max(0, Math.min(endS, sec))); };
  const utc = readout.utc || journey.launchUtc;
  const arrival = journey.events.find((e) => e.type === 'landing') ?? journey.events.find((e) => e.type === 'end') ?? journey.events[journey.events.length - 1];
  const tli = st.tliDeltaVMps, inj = st.injectionDeltaVMps;
  const planQuery = intent?.type === 'PLAN_JOURNEY' ? new URLSearchParams(Object.entries(intent.plan).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) : null;
  return (
    <>
      <Panel
        title={<>{journey.mission?.shortName ?? 'Planned mission'} · journey <Badge tone={fid.tone}>{fid.label}</Badge></>}
        actions={<span className="mono" title={`${utc} (world clock = launch UTC + T+)`}>{formatJourneyTime(t)}<span className="dim"> · {utc.slice(5, 16).replace('T', ' ')}Z</span></span>}
      >
        <div className="panel-body">
          <KV k="Launch" v={<span>{journey.launchSite.name} <span className="mono dim">({journey.launchSite.latitude.toFixed(3)}°, {journey.launchSite.longitude.toFixed(3)}°)</span><br />{journey.vehicle ?? ''} · {fmtUtc(journey.launchUtc)}{journey.notes.some((n) => /illustrative/.test(n)) ? ' (illustrative date)' : ''}</span>} />
          <KV k="Route" v={<span>{PROFILE[journey.profile]}{st.transferDays != null ? ` · ${st.transferDays} d Earth→Moon coast` : ''}{st.launchPlaneInclinationDeg != null ? ` · launch plane ${st.launchPlaneInclinationDeg}°` : ''}</span>} />
          <KV k="Arrival" v={<span>{journey.landingSite ? journey.landingSite.name : journey.profile === 'earth-return' ? 'no lunar landing' : 'lunar orbit (site not published)'}<br />{arrival ? `${arrival.title} · ${fmtUtc(arrival.utc)}` : ''} · total {journey.totalDays} days</span>} />
          <div className="sim-controls">
            <button className="btn primary" onClick={() => (playing ? pause() : play())}>{playing ? '❚❚ Pause' : finished ? '▶ Replay' : '▶ Play journey'}</button>
            <button className="btn" onClick={restart}>↺</button>
            {[0.5, 1, 2, 4].map((x) => (
              <button key={x} className={`chip${speed === x ? ' on' : ''}`} onClick={() => setSpeed(x)}>{x}×</button>
            ))}
            <span className="dim" style={{ fontSize: 11 }}>view</span>
            {(['follow', 'overview', 'free'] as const).map((v) => (
              <button key={v} className={`chip${view === v ? ' on' : ''}`} onClick={() => setView(v)} title={v === 'follow' ? 'chase camera behind the spacecraft' : v === 'overview' ? 'Earth, Moon and the route in one frame' : 'orbit the camera yourself'}>{v}</button>
            ))}
          </div>
          {scrub && <input className="sim-scrub" type="range" min={0} max={1000} value={Math.round(scrub.fromT(t))} onChange={(e) => seek(scrub.toT(Number(e.target.value)))} />}
          <ol className="phase-rail">
            {journey.segments.map((s) => {
              const s0 = s.samples[0][0], s1 = s.samples[s.samples.length - 1][0];
              return (
                <li key={s.id} className={`phase${readout.segmentId === s.id ? ' active' : ''}${t >= s1 ? ' done' : ''}`} onClick={() => seek(s0)} title={s.note}>
                  <span className="phase-glyph" style={{ color: SEGMENT_COLORS[s.kind] }}>{GLYPH[s.kind] ?? '·'}</span>
                  <span className="phase-name">{s.label}</span>
                  <span className="phase-meta">{fmtDur(s.durationS)}{typeof s.stats.deltaVMps === 'number' ? ` · Δv ${Math.round(s.stats.deltaVMps)} m/s` : ''}</span>
                </li>
              );
            })}
          </ol>
          <div className="readouts mono">
            <span title={`altitude above the ${readout.nearBody === 'earth' ? 'Earth' : 'Moon'}'s mean radius`}>{readout.nearBody === 'earth' ? '⊕' : '☾'} alt {fmtKm(readout.altitudeKm)}</span>
            <span title="speed in the segment's frame (inertial for the Earth phases, Moon-fixed near the Moon)">v {readout.speedKms.toFixed(2)} km/s</span>
            <span>⊕ {fmtKm(readout.distanceEarthKm)}</span>
            <span>☾ {fmtKm(readout.distanceMoonKm)}</span>
          </div>
          {finished && (
            <div className="sim-banner" role="status">
              <strong>{journey.profile === 'earth-return' ? 'JOURNEY ENDED — re-entry' : journey.landingSite ? 'ARRIVED — touchdown' : 'ARRIVED — in lunar orbit'}</strong>
              <span>{journey.totalDays} days from {journey.launchSite.shortName ?? journey.launchSite.name}. {fid.text}</span>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Timeline & sources" collapsed={false}>
        <div className="panel-body">
          <ol className="phase-rail">
            {journey.events.map((e: JourneyEvent) => (
              <li key={e.id} className={`phase${t >= e.tSec ? ' done' : ''}`} onClick={() => seek(e.tSec)} title={e.note ?? e.source}>
                <span className="phase-glyph">{EVENT_GLYPH[e.type] ?? '·'}</span>
                <span className="phase-name">{e.title}</span>
                <span className="phase-meta">{fmtUtc(e.utc).slice(5)} · <span title="how this anchor is known">{e.source}</span></span>
              </li>
            ))}
          </ol>
          <KV k="Δv chain (model)" v={<span className="mono">{inj != null ? `inject ${Math.round(inj)} · ` : ''}{tli != null ? `TLI ${Math.round(tli)}` : ''}{st.loiDeltaVMps != null ? ` · LOI ${Math.round(st.loiDeltaVMps)}` : ''}{st.doiDeltaVMps != null ? ` · DOI ${Math.round(st.doiDeltaVMps)}` : ''} m/s</span>} />
          {st.lunarOrbitAltitudeKm != null && <KV k="Lunar orbit" v={<span className="mono">{Math.round(st.lunarOrbitAltitudeKm)} km · incl {st.lunarOrbitInclinationDeg}° · v∞ {st.arrivalVInfKms} km/s</span>} />}
          {st.apogeeKm != null && <KV k="Apogee" v={<span className="mono">{Math.round(st.apogeeKm).toLocaleString()} km</span>} />}
          <Note>{fid.text}</Note>
          <div className="btn-row">
            {journey.mission && <Link className="btn" to={`/missions/${journey.mission.id}`}>Mission data</Link>}
            {journey.mission && journey.landingSite && <Link className="btn" to={intentToRoute({ type: 'SHOW_MISSION', missionId: journey.mission.id, detail: 'lander' })}>Landing site scene</Link>}
            {planQuery && <Link className="btn" to={`/plan/scene?${planQuery.toString()}`}>Landing simulation</Link>}
            {planQuery && <Link className="btn" to={`/plan?${planQuery.toString()}&run=1`}>Edit plan</Link>}
            <Link className="btn" to="/space">All journeys</Link>
          </div>
        </div>
      </Panel>
    </>
  );
}

/** No journey loaded (Space scene / mission without a flight profile): the list of available journeys. */
function JourneyIndex() {
  const { data } = useJourneyIndex();
  const config = useSceneStore((s) => s.config);
  const missing = config?.intent.type === 'SHOW_JOURNEY' ? config.intent.missionId : null;
  return (
    <Panel title={<>Mission journeys <Badge tone="info">Earth → Moon</Badge></>}>
      <div className="panel-body">
        {missing && <Note>No route can be drawn for <b>{missing}</b>: the catalogue has no published launch/arrival anchors for it (routes are never invented).</Note>}
        {!missing && <Note>Pick a mission to watch its launch site, route and timing animated in the live environment — reconstructed from published event times for flown missions, projected from the provider’s previous profile for upcoming ones.</Note>}
        <ol className="phase-rail">
          {(data?.journeys ?? []).filter((j) => j.available).map((j) => (
            <li key={j.missionId} className="phase done journey-entry">
              <span className="phase-glyph" style={{ color: j.fidelity === 'reconstructed' ? '#8fd3ff' : '#ffd166' }}>{j.fidelity === 'reconstructed' ? '●' : '○'}</span>
              <Link className="phase-name" to={`/missions/${j.missionId}/journey`}>{j.shortName}</Link>
              <span className="phase-meta">{j.fidelity}</span>
              <span className="phase-meta journey-entry-sub">{j.launchSite} · {j.launchUtc?.slice(0, 10)}{j.illustrativeDate ? '*' : ''}{j.profile === 'phasing' ? ' · phasing loops' : j.profile === 'earth-return' ? ' · no landing (Earth return)' : ''}</span>
            </li>
          ))}
        </ol>
        <div className="btn-row">
          <Link className="btn" to="/plan">Plan your own mission → route</Link>
        </div>
        <Note>* illustrative date inside the announced window (launch not yet scheduled).</Note>
      </div>
    </Panel>
  );
}
