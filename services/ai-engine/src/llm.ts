import type { KnowledgeBase } from './knowledge.js';
import { INTENT_JSON_SCHEMA, validateIntent } from './schema.js';
import type { AiContext, AiResponse, AiTurn, Citation, Fact, LlmConfig, SceneIntent, TraceStep } from './types.js';

/**
 * Optional LLM provider (OpenAI-compatible chat completions with tool calling).
 *
 * Guard-rails that make it safe inside this product:
 *  - the model can only act through four tools; free text is never executed;
 *  - `scene_intent` is validated against the SceneIntent schema *and* the catalogue ids (unknown id → the model is
 *    told why and may retry); the frontend still routes it through the ScenePlanner like any other intent;
 *  - `answer` must cite source ids that appeared in tool results; an answer without lookups is marked ungrounded;
 *  - every catalogue fact the model sees comes from the same KnowledgeBase as the rule provider.
 */
export class LlmProvider {
  constructor(private kb: KnowledgeBase, private cfg: LlmConfig) {}

  static fromEnv(kb: KnowledgeBase, env: NodeJS.ProcessEnv = process.env): LlmProvider | null {
    const apiKey = env.AI_API_KEY;
    if (!apiKey) return null;
    return new LlmProvider(kb, {
      baseUrl: (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
      apiKey,
      model: env.AI_MODEL ?? 'gpt-4o-mini',
      timeoutMs: Number(env.AI_TIMEOUT_MS ?? 25_000),
    });
  }

  get model() { return this.cfg.model; }

  private tools() {
    return [
      { type: 'function', function: { name: 'lookup', description: 'Look up catalogue facts about a CLPS mission, landing site, region, provider, spacecraft, payload or a historic lunar landing (1959→today). Returns facts and the source ids you must cite.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'name or id' }, kind: { enum: ['mission', 'site', 'region', 'provider', 'spacecraft', 'payload', 'historic', 'missions-list', 'sources'], description: 'missions-list returns every CLPS mission' } }, required: ['query'] } } },
      { type: 'function', function: { name: 'research', description: 'Ask the research engine: Sun/Earth geometry at a lunar site for a UTC time, the next landing windows (sunrise) at a site, or terrain features (LOLA).', parameters: { type: 'object', properties: { kind: { enum: ['ephemeris', 'windows', 'terrain'] }, latitude: { type: 'number' }, longitude: { type: 'number' }, utc: { type: 'string', description: 'ISO UTC time (ephemeris) or start date (windows)' } }, required: ['kind', 'latitude', 'longitude'] } } },
      { type: 'function', function: { name: 'scene_intent', description: 'Propose the structured scene the user asked to SEE. Use only ids from the catalogue index or lookups. The user confirms before it runs; you never control the scene directly.', parameters: { type: 'object', properties: { intent: INTENT_JSON_SCHEMA, explanation: { type: 'string', description: 'one sentence for the user' } }, required: ['intent', 'explanation'] } } },
      { type: 'function', function: { name: 'answer', description: 'Final grounded answer to a QUESTION. Only state facts returned by lookup/research tool results and cite their source ids.', parameters: { type: 'object', properties: { text: { type: 'string' }, facts: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } }, sourceIds: { type: 'array', items: { type: 'string' } }, suggestedIntent: INTENT_JSON_SCHEMA }, required: ['text', 'sourceIds'] } } },
    ];
  }

  private system(ctx: AiContext) {
    const idx = this.kb.index();
    return [
      'You are the Copilot of the CLPS Lunar Mission Browser, a NASA-grounded Earth → Moon → lunar-surface viewer.',
      'RULES: (1) Never invent missions, dates, coordinates, spacecraft, trajectories or scientific facts. If it is not in a tool result, say it is not in the catalogue.',
      '(2) When the user wants to SEE something, call scene_intent with ids from the index below. When the user ASKS something, call lookup/research first, then answer with sourceIds copied from the tool results.',
      '(3) You never manipulate the scene; you only propose intents. (4) Keep answers short. Reply in the user\'s language, but keep ids/units as-is.',
      `(5) Today is ${new Date().toISOString().slice(0, 10)}. Landing plans (PLAN_LANDING) are model studies by the research engine, not flight data.`,
      ctx.route ? `Current frontend route: ${ctx.route}${ctx.missionId ? ` (mission ${ctx.missionId})` : ''}${ctx.landingSiteId ? ` (site ${ctx.landingSiteId})` : ''}.` : '',
      `CATALOGUE INDEX (the only ids you may use): ${JSON.stringify(idx)}`,
    ].filter(Boolean).join('\n');
  }

  private async runTool(name: string, args: Record<string, unknown>, seen: Set<string>, trace: TraceStep[]): Promise<unknown> {
    const kb = this.kb;
    const t0 = Date.now();
    const q = String(args.query ?? '');
    const remember = (ids: string[]) => ids.forEach((id) => seen.add(id));
    let out: unknown;
    if (name === 'lookup') {
      const kind = String(args.kind ?? '');
      if (kind === 'missions-list') { out = kb.snapshot.missions.map((m) => ({ ...kb.missionFacts(m), id: m.id })); remember(kb.snapshot.missions.flatMap((m) => m.sourceIds)); }
      else if (kind === 'sources') { out = kb.snapshot.sources; remember(kb.snapshot.sources.map((s) => s.id)); }
      else if (kind === 'historic' || (!kind && !kb.findMission(q))) { const h = await kb.findHistoric(q); out = h ? { id: h.id, facts: kb.historicFacts(h), sourceIds: h.sourceIds ?? ['src-nssdca-nmc'] } : { error: `no historic mission matches '${q}'` }; if (h) remember(h.sourceIds ?? ['src-nssdca-nmc']); }
      if (out === undefined) {
        const m = kb.missionById(q) ?? kb.findMission(q);
        const s = kind === 'site' || !m ? kb.siteById(q) ?? kb.findSite(q) : undefined;
        const r = kind === 'region' || (!m && !s) ? kb.regionById(q) ?? kb.findRegion(q) : undefined;
        const p = kind === 'provider' || (!m && !s && !r) ? kb.providerById(q) ?? kb.findProvider(q) : undefined;
        const sc = kind === 'spacecraft' || (!m && !s && !r && !p) ? kb.spacecraftById(q) ?? kb.findSpacecraft(q) : undefined;
        const pl = kind === 'payload' || (!m && !s && !r && !p && !sc) ? kb.payloadById(q) ?? kb.findPayload(q) : undefined;
        if (m && kind !== 'site') { const mf = kb.missionFacts(m); const pf = kb.payloadFacts(m); const ev = kb.eventsFor(m.id); out = { id: m.id, facts: mf.facts, payloads: pf.facts, events: kb.eventFacts(ev), sourceIds: [...new Set([...mf.sourceIds, ...ev.flatMap((e) => e.sourceIds)])] }; remember((out as { sourceIds: string[] }).sourceIds); }
        else if (s) { const sf = kb.siteFacts(s); out = { id: s.id, facts: sf.facts, sourceIds: sf.sourceIds }; remember(sf.sourceIds); }
        else if (r) { out = { id: r.id, facts: [{ label: r.name, value: r.description }, { label: 'Science themes', value: r.scienceThemes.join(', ') }], sourceIds: r.sourceIds }; remember(r.sourceIds); }
        else if (p) { out = { id: p.id, facts: [{ label: p.name, value: `${p.headquarters}, ${p.country}; landers ${p.landers.join(', ')}` }], missions: kb.snapshot.missions.filter((m2) => m2.providerId === p.id).map((m2) => m2.id), sourceIds: p.sourceIds }; remember(p.sourceIds); }
        else if (sc) { out = { id: sc.id, facts: [{ label: sc.name, value: `${sc.type}, ${sc.class}${sc.payloadCapacityKg ? `, payload ≈ ${sc.payloadCapacityKg} kg` : ''}; ${sc.assetStatus}${sc.assetNote ? ` — ${sc.assetNote}` : ''}` }], sourceIds: sc.sourceIds }; remember(sc.sourceIds); }
        else if (pl) { const ids = pl.missionIds.flatMap((id) => kb.missionById(id)?.sourceIds ?? []); out = { id: pl.id, facts: [{ label: pl.acronym || pl.name, value: `${pl.name} — ${pl.type}, ${pl.leadOrganization}. ${pl.summary}` }, { label: 'Flies on', value: pl.missionIds.join(', ') }], sourceIds: ids }; remember(ids); }
        else out = { error: `nothing in the catalogue matches '${q}'` };
      }
    } else if (name === 'research') {
      const lat = Number(args.latitude); const lon = Number(args.longitude); const utc = args.utc ? String(args.utc) : undefined;
      const kind = String(args.kind);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) out = { error: 'latitude/longitude required' };
      else if (kind === 'ephemeris') { out = await this.kb.research.ephemeris(lat, lon, utc); remember(['src-meeus', 'src-iau-wgccre-2009']); }
      else if (kind === 'windows') { out = await this.kb.research.windows(lat, lon, utc, 4); remember(['src-meeus', 'src-iau-wgccre-2009']); }
      else if (kind === 'terrain') { out = await this.kb.research.terrain(lat, lon); remember(['src-pds-lola-gdr']); }
      else out = { error: `unknown research kind '${kind}'` };
      if (out === null) out = { error: 'research engine unavailable' };
    } else out = { error: `unknown tool ${name}` };
    trace.push({ step: `llm.tool.${name}`, detail: JSON.stringify(args).slice(0, 160), ms: Date.now() - t0 });
    return out;
  }

  async handle(text: string, context: AiContext = {}, history: AiTurn[] = []): Promise<AiResponse> {
    const t0 = Date.now();
    const trace: TraceStep[] = [];
    const seen = new Set<string>();
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: this.system(context) },
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.text })),
      { role: 'user', content: text },
    ];
    const base = { provider: 'llm' as const, trace, citations: [] as Citation[] };
    let usedTools = false;
    for (let round = 0; round < 6; round++) {
      const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ model: this.cfg.model, messages, tools: this.tools(), tool_choice: 'auto', temperature: 0 }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { choices: Array<{ message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('LLM returned no choices');
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      const calls = msg.tool_calls ?? [];
      if (!calls.length) {
        // plain text: allowed, but it is not grounded in any tool result
        const grounded = usedTools;
        return { ...base, kind: 'answer', text: msg.content ?? '', facts: [], grounded, citations: this.kb.citations([...seen]), explanation: grounded ? 'Answer composed by the LLM from catalogue lookups.' : 'LLM text without catalogue lookups — unverified.', confidence: grounded ? 0.6 : 0.3, ms: Date.now() - t0 };
      }
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const name = call.function.name;
        if (name === 'scene_intent') {
          const v = validateIntent(args.intent, this.kb);
          if (v.ok) {
            trace.push({ step: 'llm.intent', detail: JSON.stringify(v.intent).slice(0, 200), ms: Date.now() - t0 });
            const facts = this.intentFacts(v.intent);
            return { ...base, kind: 'intent', intent: v.intent, explanation: String(args.explanation ?? 'Proposed scene.') + (v.warnings.length ? ` (${v.warnings.join('; ')})` : ''), facts: facts.facts, citations: this.kb.citations(facts.sourceIds), confidence: 0.8, ms: Date.now() - t0 };
          }
          trace.push({ step: 'llm.intent.invalid', detail: v.errors.join('; ').slice(0, 200) });
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'invalid intent', details: v.errors }) });
          continue;
        }
        if (name === 'answer') {
          const ids = Array.isArray(args.sourceIds) ? (args.sourceIds as unknown[]).map(String).filter((id) => seen.has(id)) : [];
          const facts = Array.isArray(args.facts) ? (args.facts as Fact[]).filter((f) => f && typeof f.label === 'string' && typeof f.value === 'string').slice(0, 24) : [];
          let suggested: SceneIntent | undefined;
          if (args.suggestedIntent) { const v = validateIntent(args.suggestedIntent, this.kb); if (v.ok) suggested = v.intent; }
          const grounded = usedTools && ids.length > 0;
          return { ...base, kind: 'answer', text: String(args.text ?? ''), facts, grounded, citations: this.kb.citations(ids), explanation: grounded ? 'Grounded in catalogue lookups (LLM composed).' : 'The LLM answered without verifiable citations — treat as unverified.', confidence: grounded ? 0.75 : 0.3, ...(suggested ? { suggestedIntent: suggested } : {}), ms: Date.now() - t0 };
        }
        usedTools = true;
        const out = await this.runTool(name, args, seen, trace);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12_000) });
      }
    }
    throw new Error('LLM did not converge within 6 tool rounds');
  }

  private intentFacts(intent: SceneIntent): { facts: Fact[]; sourceIds: string[] } {
    const kb = this.kb;
    if (intent.type === 'SHOW_MISSION' || intent.type === 'RESEARCH') { const m = intent.missionId ? kb.missionById(intent.missionId) : undefined; return m ? kb.missionFacts(m) : { facts: [], sourceIds: [] }; }
    if (intent.type === 'SHOW_LANDING_SITE') { const s = kb.siteById(intent.landingSiteId); return s ? kb.siteFacts(s) : { facts: [], sourceIds: [] }; }
    if (intent.type === 'COMPARE' || (intent.type === 'SHOW_MISSIONS' && intent.missionIds)) { const ids = intent.missionIds ?? []; return { facts: ids.map((id) => ({ label: kb.missionById(id)?.shortName ?? id, value: kb.missionById(id)?.status ?? '' })), sourceIds: ids.flatMap((id) => kb.missionById(id)?.sourceIds ?? []) }; }
    if (intent.type === 'PLAN_LANDING') return { facts: [{ label: 'Site', value: kb.fmtLatLon(intent.plan.latitude, intent.plan.longitude) }, ...(intent.plan.landerId ? [{ label: 'Lander preset', value: intent.plan.landerId }] : []), ...(intent.plan.landingDate ? [{ label: 'Landing date', value: intent.plan.landingDate }] : [])], sourceIds: ['src-pds-lola-gdr', 'src-meeus'] };
    return { facts: [], sourceIds: [] };
  }
}
