import { KnowledgeBase } from './knowledge.js';
import { LlmProvider } from './llm.js';
import { RuleProvider } from './rules.js';
import { INTENT_JSON_SCHEMA, INTENT_TYPES, validateIntent } from './schema.js';
import type { AiRequest, AiResponse, KnowledgeSnapshot, ResearchGateway } from './types.js';

export interface AiEngineOptions {
  snapshot: KnowledgeSnapshot;
  research: ResearchGateway;
  /** environment used to configure the optional LLM provider (AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_TIMEOUT_MS) */
  env?: NodeJS.ProcessEnv;
}

export const EXAMPLES = [
  'show IM-2 with payloads',
  'take me from Earth to the Blue Ghost landing site',
  'south pole missions with landers',
  'compare IM-1 and IM-2',
  'when did Blue Ghost land?',
  'where did IM-1 land?',
  'what payloads are on Griffin Mission One?',
  'why did IM-2 end early?',
  'which CLPS missions are planned for 2026?',
  'how many lunar landings have there been?',
  'when did Apollo 11 land?',
  'next landing window at Mons Mouton',
  'sun elevation at 84.79 S, 29.2 E on 2026-11-17',
  'plan a landing at 84.79 S, 29.2 E with Nova-C on 2026-11-17',
  'plan a landing at Mare Crisium with Blue Ghost, 150 kg payload, phasing transfer, in March 2027',
  'landing history',
];

/**
 * The AI engine: one entry point, two providers.
 *  - rules: deterministic grammar + catalogue templates (always on, no network);
 *  - llm:   optional OpenAI-compatible model with tool calling, validated against the same schema/catalogue,
 *           falling back to the rules whenever it errors or produces something unverifiable.
 */
export class AiEngine {
  readonly kb: KnowledgeBase;
  readonly rules: RuleProvider;
  readonly llm: LlmProvider | null;

  constructor(opts: AiEngineOptions) {
    this.kb = new KnowledgeBase(opts.snapshot, opts.research);
    this.rules = new RuleProvider(this.kb);
    this.llm = LlmProvider.fromEnv(this.kb, opts.env ?? process.env);
  }

  /** Load research-engine presets (lander/transfer ids) — call once at startup; safe to call again. */
  warm() { return this.kb.warm(); }

  capabilities() {
    return {
      providers: this.llm ? ['llm', 'rules'] : ['rules'],
      llmModel: this.llm?.model ?? null,
      intentTypes: INTENT_TYPES,
      intentSchema: INTENT_JSON_SCHEMA,
      examples: EXAMPLES,
      rules: [
        'The AI never manipulates the scene: it returns a SceneIntent that the frontend hands to the ScenePlanner (same path as the command bar and URLs).',
        'Every intent is validated against the schema and the catalogue ids before it leaves the engine.',
        'Answers are assembled from catalogue records / research-engine results and carry source citations; unverifiable LLM text is flagged.',
        'Nothing is invented: unknown missions, coordinates, spacecraft or dates produce a clarification instead.',
      ],
      catalogue: { missions: this.kb.snapshot.missions.length, landingSites: this.kb.snapshot.landingSites.length, regions: this.kb.snapshot.regions.length, payloads: this.kb.snapshot.payloads.length, sources: this.kb.snapshot.sources.length, landerPresets: this.kb.landerPresets.map((l) => l.id) },
    };
  }

  validate(raw: unknown) { return validateIntent(raw, this.kb); }

  async handle(req: AiRequest): Promise<AiResponse> {
    const text = (req.text ?? '').toString().slice(0, 1000);
    const context = req.context ?? {};
    const wantLlm = this.llm && req.provider !== 'rules';
    if (wantLlm && this.llm) {
      try {
        const r = await this.llm.handle(text, context, req.history ?? []);
        // an ungrounded LLM answer is worth less than a grounded rule answer: try the rules and prefer them if they know
        if (r.kind === 'answer' && !r.grounded) {
          const alt = await this.rules.handle(text, context);
          if (alt.kind !== 'clarify') return { ...alt, provider: 'llm+rules', trace: [...r.trace, { step: 'fallback', detail: 'LLM answer was ungrounded; rules answered instead' }, ...alt.trace] };
        }
        return r;
      } catch (e) {
        const alt = await this.rules.handle(text, context);
        return { ...alt, provider: 'llm+rules', trace: [{ step: 'llm.error', detail: (e as Error).message.slice(0, 200) }, ...alt.trace] };
      }
    }
    return this.rules.handle(text, context);
  }
}
