import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { intentToRoute } from '@/app/routes';
import { parseIntent } from '@/scene-manager/IntentParser';
import type { SceneIntent } from '@/scene-manager/SceneConfig';
import { api } from '@/services/api';
import { useLandingSites, useMissions, useRegions } from '@/services/queries';
import { useSelectionStore } from '@/state/selectionStore';
import type { AiContext, AiResponse, AiTurn } from '@/types/domain';
import { Badge, Note, Panel } from '@/ui/primitives';

/**
 * Copilot (Phase 12). Free text → backend AI engine (/api/v1/ai/message) → one of three *data* results:
 *   intent  — a validated SceneIntent; the user runs it (or auto-run is on) → route → ScenePlanner → SceneConfig.
 *   answer  — catalogue/research facts with citations; may carry a suggested intent.
 *   clarify — nothing verifiable matched; options are offered.
 * The AI never manipulates the scene: the only way into the 3-D world is the same intent route the command bar uses.
 * When the API is unreachable the page falls back to the local rule parser (intents only, no answers).
 */
type Msg = { id: number; role: 'user'; text: string } | { id: number; role: 'assistant'; res: AiResponse; offline?: boolean };

export function CopilotPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selected = useSelectionStore((s) => s.selected);
  const caps = useQuery({ queryKey: ['ai-capabilities'], queryFn: api.aiCapabilities, staleTime: 5 * 60_000, retry: 1 });
  const missions = useMissions(); const sites = useLandingSites(); const regions = useRegions();

  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [lastContext, setLastContext] = useState<AiContext>({});
  const seq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const sentFromQuery = useRef<string | null>(null);

  // Conversation memory for the engine: the last mission/site we talked about + the current selection.
  const context = useMemo<AiContext>(() => {
    const ctx: AiContext = { route: location.pathname + location.search, ...lastContext };
    if (selected?.kind === 'mission') ctx.missionId = selected.id;
    if (selected?.kind === 'landing-site') ctx.landingSiteId = selected.id;
    if (selected?.kind === 'region') ctx.regionId = selected.id;
    return ctx;
  }, [location.pathname, location.search, selected, lastContext]);

  const history = useMemo<AiTurn[]>(() => msgs.slice(-8).map((m) => (m.role === 'user' ? { role: 'user', text: m.text } : { role: 'assistant', text: m.res.kind === 'intent' ? m.res.explanation : m.res.text })), [msgs]);

  const remember = (res: AiResponse) => {
    if (res.entities && Object.keys(res.entities).length) { setLastContext({ ...res.entities }); return; }
    const it = res.kind === 'intent' ? res.intent : res.kind === 'answer' ? res.suggestedIntent : undefined;
    if (!it) return;
    const next: AiContext = {};
    if (typeof it.missionId === 'string') next.missionId = it.missionId;
    if (Array.isArray(it.missionIds) && typeof it.missionIds[0] === 'string') next.missionId = it.missionIds[0];
    if (typeof it.landingSiteId === 'string') next.landingSiteId = it.landingSiteId;
    if (typeof it.regionId === 'string') next.regionId = it.regionId;
    if (Object.keys(next).length) setLastContext(next);
  };

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busy) return;
    setText('');
    setMsgs((m) => [...m, { id: ++seq.current, role: 'user', text: t }]);
    setBusy(true);
    try {
      const res = await api.aiMessage({ text: t, context, history });
      setMsgs((m) => [...m, { id: ++seq.current, role: 'assistant', res }]);
      remember(res);
      if (autoRun && res.kind === 'intent') navigate(intentToRoute(res.intent as unknown as SceneIntent));
    } catch (e) {
      // offline fallback: local rule parser (intents only)
      const ctx = missions.data && sites.data && regions.data ? { missions: missions.data.missions, landingSites: sites.data.landingSites, regions: regions.data.regions } : null;
      const local = ctx ? parseIntent(t, ctx) : { error: 'catalogue not loaded' };
      const res: AiResponse = 'intent' in local
        ? { kind: 'intent', intent: local.intent as unknown as { type: string } & Record<string, unknown>, explanation: local.explanation, facts: [], provider: 'rules', confidence: 0.6, citations: [], trace: [{ step: 'offline', detail: (e as Error).message }], ms: 0 }
        : { kind: 'clarify', text: `AI engine unreachable (${(e as Error).message}); the local parser could not map this either: ${local.error}`, options: [], provider: 'rules', confidence: 0.1, citations: [], trace: [], ms: 0, explanation: '' };
      setMsgs((m) => [...m, { id: ++seq.current, role: 'assistant', res, offline: true }]);
    } finally {
      setBusy(false);
    }
  };

  // /copilot?q=… (e.g. from the command bar when it cannot parse locally)
  useEffect(() => {
    const q = params.get('q');
    if (q && sentFromQuery.current !== q) { sentFromQuery.current = q; void send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length, busy]);

  const submit = (e: FormEvent) => { e.preventDefault(); void send(text); };
  const examples = caps.data?.examples ?? ['show IM-2 with payloads', 'when did Blue Ghost land?', 'plan a landing at 84.79 S, 29.2 E with Nova-C on 2026-11-17'];

  return (
    <div className="copilot">
      <div className="page-head">
        <h1>Copilot</h1>
        <p className="dim">
          Natural language → AI engine → <b>structured SceneIntent</b> or a <b>grounded answer</b> with citations → you run it → ScenePlanner → SceneConfig.
          {caps.data && <> Providers: {caps.data.providers.map((p) => <Badge key={p} tone={p === 'llm' ? 'info' : 'neutral'}>{p === 'llm' ? `LLM · ${caps.data?.llmModel}` : 'rules'}</Badge>)} · catalogue {caps.data.catalogue.missions} missions, {caps.data.catalogue.sources} sources.</>}
          {caps.isError && <> <Badge tone="warn">API offline — local parser only</Badge></>}
        </p>
      </div>

      <div className="copilot-grid">
        <div className="copilot-main">
          <div className="chat" role="log" aria-live="polite">
            {msgs.length === 0 && (
              <div className="chat-empty">
                <p className="dim">Try one of these — commands become scene intents, questions become cited answers:</p>
                <div className="chips">{examples.map((x) => <button key={x} className="chip" onClick={() => void send(x)}>{x}</button>)}</div>
              </div>
            )}
            {msgs.map((m) => m.role === 'user'
              ? <div key={m.id} className="bubble user"><span className="who">you</span><div>{m.text}</div></div>
              : <AssistantBubble key={m.id} res={m.res} offline={m.offline} showTrace={showTrace} onOption={(t) => void send(t)} onRun={(it) => navigate(intentToRoute(it))} />)}
            {busy && <div className="bubble assistant"><span className="who">copilot</span><div className="dim">thinking…</div></div>}
            <div ref={bottom} />
          </div>
          <form className="command-bar static" onSubmit={submit}>
            <span className="prompt">›</span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask or command — “where did IM-1 land?”, “show Blue Ghost with payloads”, “plan 84.79 S, 29.2 E with Nova-C”" disabled={busy} autoFocus />
            <button type="submit" className="btn primary" disabled={busy || !text.trim()}>Send</button>
          </form>
          <div className="copilot-options dim">
            <label><input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} /> run scene intents immediately (still via the ScenePlanner)</label>
            <label><input type="checkbox" checked={showTrace} onChange={(e) => setShowTrace(e.target.checked)} /> show engine trace</label>
            {msgs.length > 0 && <button className="btn small" onClick={() => { setMsgs([]); setLastContext({}); }}>clear</button>}
          </div>
        </div>

        <aside className="copilot-side">
          <Panel title="Rules of the engine">
            <ul className="tight">
              {(caps.data?.rules ?? [
                'The AI never manipulates the scene: it returns a SceneIntent that the frontend hands to the ScenePlanner.',
                'Every intent is validated against the schema and the catalogue ids before it leaves the engine.',
                'Answers are assembled from catalogue records / research-engine results and carry citations.',
                'Nothing is invented: unknown missions, coordinates, spacecraft or dates produce a clarification.',
              ]).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Panel>
          <Panel title="Intent types">
            <div className="chips">{(caps.data?.intentTypes ?? []).map((t) => <span key={t} className="badge">{t}</span>)}</div>
            <Note>Same schema as the command bar and URLs (<code>scene-manager/SceneConfig.ts</code>). An LLM provider is enabled by setting <code>AI_API_KEY</code> (+ optional <code>AI_BASE_URL</code>, <code>AI_MODEL</code>) on the API; it can only act through validated tools and falls back to the rules.</Note>
          </Panel>
          <Panel title="Context">
            <div className="kv"><span className="k">route</span><span className="v mono">{context.route}</span></div>
            <div className="kv"><span className="k">mission</span><span className="v mono">{context.missionId ?? '—'}</span></div>
            <div className="kv"><span className="k">site</span><span className="v mono">{context.landingSiteId ?? '—'}</span></div>
            <Note>“it / this mission” resolves against the selection in the scene or the last thing we talked about.</Note>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function AssistantBubble({ res, offline, showTrace, onOption, onRun }: { res: AiResponse; offline?: boolean; showTrace: boolean; onOption: (t: string) => void; onRun: (it: SceneIntent) => void }) {
  const [showJson, setShowJson] = useState(false);
  const provider = <Badge tone={res.provider === 'rules' ? 'neutral' : 'info'}>{offline ? 'offline rules' : res.provider}</Badge>;
  const conf = <span className="dim mono small">conf {Math.round(res.confidence * 100)} % · {res.ms} ms</span>;
  const citations = res.citations.length > 0 && (
    <div className="citations">
      {res.citations.map((c) => <a key={c.id} className="cite" href={c.url ?? '#'} target="_blank" rel="noreferrer" title={`${c.publisher ?? ''} — ${c.title}`}>{c.id}</a>)}
      <Link className="cite more" to="/sources">sources</Link>
    </div>
  );
  const trace = showTrace && res.trace.length > 0 && <pre className="code small">{res.trace.map((t) => `${t.step}${t.ms !== undefined ? ` (${t.ms} ms)` : ''}${t.detail ? ` — ${t.detail}` : ''}`).join('\n')}</pre>;
  const facts = (f: { label: string; value: string }[]) => f.length > 0 && <div className="facts">{f.map((x, i) => <div key={i} className="kv"><span className="k">{x.label}</span><span className="v">{x.value}</span></div>)}</div>;

  if (res.kind === 'intent') {
    const it = res.intent as unknown as SceneIntent;
    return (
      <div className="bubble assistant intent">
        <span className="who">copilot · scene intent {provider}</span>
        <div className="head-row"><b>{res.intent.type}</b> {conf}</div>
        <p>{res.explanation}</p>
        {facts(res.facts)}
        <div className="actions">
          <button className="btn primary" onClick={() => onRun(it)}>Run in 3D</button>
          <Link className="btn" to={intentToRoute(it)} target="_blank" rel="noreferrer">open route</Link>
          <button className="btn small" onClick={() => setShowJson((v) => !v)}>{showJson ? 'hide' : 'show'} intent JSON</button>
        </div>
        {showJson && <pre className="code small">{JSON.stringify(res.intent, null, 2)}</pre>}
        {citations}{trace}
      </div>
    );
  }
  if (res.kind === 'answer') {
    return (
      <div className="bubble assistant answer">
        <span className="who">copilot {provider} {!res.grounded && <Badge tone="warn">unverified</Badge>}</span>
        <p>{res.text}</p>
        {facts(res.facts)}
        {res.suggestedIntent && <div className="actions"><button className="btn" onClick={() => onRun(res.suggestedIntent as unknown as SceneIntent)}>Show in 3D → {res.suggestedIntent.type}</button> {conf}</div>}
        {!res.suggestedIntent && <div className="actions">{conf}</div>}
        {citations}{trace}
      </div>
    );
  }
  return (
    <div className="bubble assistant clarify">
      <span className="who">copilot {provider}</span>
      <p>{res.text}</p>
      {res.options.length > 0 && <div className="chips">{res.options.map((o) => <button key={o.text} className="chip" onClick={() => onOption(o.text)}>{o.label}</button>)}</div>}
      {trace}
    </div>
  );
}
