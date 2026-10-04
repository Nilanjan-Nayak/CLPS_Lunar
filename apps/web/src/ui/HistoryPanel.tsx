import { useEffect } from 'react';
import { Badge, KV, Note, Panel } from './primitives';
import { useHistoryStore } from '@/state/historyStore';
import { useSceneStore } from '@/state/sceneStore';
import { useCameraStore } from '@/state/cameraStore';
import { OUTCOME_COLOR, OUTCOME_GLYPH } from '@/features/history/HistoricLanding';

const tone = (o: string) => (o === 'success' ? 'ok' : o === 'partial' ? 'warn' : 'bad');

/** HistoryPanel — the "Mission Lunar" card: chronological playback of every catalogued lunar impact/landing attempt. */
export function HistoryPanel() {
  const active = useSceneStore((s) => s.config?.panels.includes('history'));
  const missions = useHistoryStore((s) => s.missions);
  const cursor = useHistoryStore((s) => s.cursor);
  const playing = useHistoryStore((s) => s.playing);
  const selectedId = useHistoryStore((s) => s.selectedId);
  const { step, setCursor, play, pause } = useHistoryStore.getState();
  const current = selectedId ? missions.find((m) => m.id === selectedId) : missions[cursor - 1];

  // auto-advance
  useEffect(() => {
    if (!active || !playing) return;
    const id = window.setInterval(() => {
      const s = useHistoryStore.getState();
      if (s.cursor >= s.missions.length) s.pause();
      else s.step(1);
    }, 1700);
    return () => window.clearInterval(id);
  }, [active, playing]);

  // the camera tours the current site
  useEffect(() => {
    if (!active || !current?.site) return;
    useCameraStore.getState().requestFlight(['MOON_ORBIT'], { latitude: current.site.latitude, longitude: current.site.longitude, label: current.name }, 1.3);
  }, [active, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;
  return (
    <Panel title={<>Mission Lunar <Badge tone="info">{cursor}/{missions.length}</Badge></>} actions={<span className="mono">{current ? current.eventDate.slice(0, 4) : '—'}</span>}>
      <div className="panel-body">
        <div className="sim-controls">
          <button className="btn" onClick={() => { pause(); step(-1); }}>◀</button>
          <button className="btn primary" onClick={() => (playing ? pause() : play())}>{playing ? '❚❚ Pause' : '▶ Play timeline'}</button>
          <button className="btn" onClick={() => { pause(); step(1); }}>▶</button>
        </div>
        <input className="sim-scrub" type="range" min={0} max={missions.length} value={cursor} onChange={(e) => { pause(); setCursor(Number(e.target.value)); }} />
        {current ? (
          <>
            <h4 className="card-title" style={{ color: OUTCOME_COLOR[current.outcome] }}>{OUTCOME_GLYPH[current.outcome]} {current.name}</h4>
            <KV k="Agency" v={`${current.agency} · ${current.country}`} />
            <KV k="Launch" v={current.launchDate} />
            <KV k={current.missionType === 'impact' ? 'Impact' : 'Landing / end'} v={current.eventDate} />
            <KV k="Type" v={current.missionType} />
            <KV k="Outcome" v={<Badge tone={tone(current.outcome)}>{current.outcome}{current.failureCategory ? ` · ${current.failureCategory}` : ''}</Badge>} />
            <KV k="Site" v={current.site ? `${Math.abs(current.site.latitude).toFixed(2)}°${current.site.latitude < 0 ? 'S' : 'N'}, ${Math.abs(current.site.longitude).toFixed(2)}°${current.site.longitude < 0 ? 'W' : 'E'} · ${current.site.precision}` : 'never reached the surface'} />
            {current.massKg != null && <KV k="Mass" v={`${current.massKg.toLocaleString()} kg${current.massNote ? ` (${current.massNote})` : ''}`} />}
            <p className="summary">{current.summary}</p>
            <div className="chips">{current.sourceIds.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          </>
        ) : (
          <Note>Press play to walk through 1959 → today. Marker colour = outcome; dashed ring = approximate crash site.</Note>
        )}
      </div>
    </Panel>
  );
}
