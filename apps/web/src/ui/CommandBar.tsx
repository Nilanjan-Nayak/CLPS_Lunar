import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { intentToRoute } from '@/app/routes';
import { parseIntent } from '@/scene-manager/IntentParser';
import { useLandingSites, useMissions, useRegions } from '@/services/queries';
import { useSceneStore } from '@/state/sceneStore';

const EXAMPLES = ['show IM-1 mission', 'Blue Ghost landing site', 'south pole missions', 'go to the Moon', 'Earth', 'compare IM-1 and IM-2', 'landing history', 'plan a nova-c landing at 84.79 S, 29.2 E'];

/**
 * CommandBar — natural-language entry point. Text → structured SceneIntent (local grammar; anything else goes to the
 * Copilot / AI engine) → route → ScenePlanner. Neither parser touches the scene.
 */
export function CommandBar() {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const missions = useMissions();
  const sites = useLandingSites();
  const regions = useRegions();
  const setMessage = useSceneStore((s) => s.setMessage);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!missions.data || !sites.data || !regions.data) return;
    const r = parseIntent(text, { missions: missions.data.missions, landingSites: sites.data.landingSites, regions: regions.data.regions });
    if ('error' in r) {
      // Not a scene command the local grammar knows → hand it to the Copilot (AI engine: answers, richer parsing).
      setMessage('Asking the Copilot…');
      navigate(`/copilot?q=${encodeURIComponent(text)}`);
      setText('');
      return;
    }
    setMessage(r.explanation);
    navigate(intentToRoute(r.intent));
    setText('');
  };
  return (
    <form className="command-bar" onSubmit={submit}>
      <span className="prompt">›</span>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Where to? e.g. “show IM-2 with payloads”, “south pole”, “Earth”" list="cmd-examples" />
      <datalist id="cmd-examples">{EXAMPLES.map((x) => <option key={x} value={x} />)}</datalist>
      <button type="submit" className="btn primary">Go</button>
    </form>
  );
}
