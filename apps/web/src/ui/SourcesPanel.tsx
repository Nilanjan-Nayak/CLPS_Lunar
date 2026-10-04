import { useState } from 'react';
import { useSources } from '@/services/queries';
import { useSceneStore } from '@/state/sceneStore';
import { Panel } from './primitives';

const EMPTY: string[] = [];

/** Provenance for the current scene: every source id referenced by the SceneConfig, resolved via the API. */
export function SourcesPanel() {
  const ids = useSceneStore((s) => s.config?.provenance.sourceIds) ?? EMPTY;
  const { data } = useSources();
  const [open, setOpen] = useState(false);
  if (!ids.length) return null;
  const list = (data?.sources ?? []).filter((s) => ids.includes(s.id));
  return (
    <Panel title={`Sources (${list.length || ids.length})`} collapsed={!open} onToggle={() => setOpen((o) => !o)} className="sources">
      <ul className="sources-list">
        {list.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
            <div className="small dim">{s.publisher}{s.date ? ` · ${s.date}` : ''} · {s.type}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
