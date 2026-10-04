import type { FastifyInstance } from 'fastify';
import { AiEngine } from '@clps/ai-engine';
import type { AiRequest, KnowledgeSnapshot, ResearchGateway } from '@clps/ai-engine';
import type { Repository } from '../repo/jsonRepository.js';

/**
 * Phase 12 — AI engine routes.
 *
 *   GET  /api/v1/ai/capabilities   providers, intent schema, examples, rules
 *   POST /api/v1/ai/message        { text, context?, history?, provider? } → intent | answer | clarify
 *   POST /api/v1/ai/validate       { intent } → validated intent or errors (used before running any client-side intent)
 *
 * The engine reads the same repository as the REST routes (frontend never holds the catalogue) and reaches the
 * research engine only server-side. It returns *data*; the frontend routes intents through the ScenePlanner.
 */
export function registerAiRoutes(app: FastifyInstance, repo: Repository, researchUrl: string) {
  const v1 = '/api/v1';
  const getJson = async (p: string) => {
    try { const r = await fetch(`${researchUrl}${p}`, { signal: AbortSignal.timeout(15_000) }); return r.ok ? ((await r.json()) as Record<string, unknown>) : null; } catch { return null; }
  };
  const research: ResearchGateway = {
    historic: async () => (((await getJson('/missions'))?.missions as never[]) ?? []),
    options: async () => { const o = await getJson('/options'); return { landers: ((o?.landers as Array<{ id: string; name: string }>) ?? []), transfers: ((o?.transfers as Array<{ id: string; name: string }>) ?? []) }; },
    ephemeris: (lat, lon, utc) => getJson(`/ephemeris?lat=${lat}&lon=${lon}${utc ? `&utc=${encodeURIComponent(utc)}` : ''}`),
    windows: (lat, lon, from, count) => getJson(`/windows?lat=${lat}&lon=${lon}${from ? `&from=${encodeURIComponent(from)}` : ''}${count ? `&count=${count}` : ''}`),
    terrain: (lat, lon) => getJson(`/terrain?lat=${lat}&lon=${lon}`),
  };
  const snapshot: KnowledgeSnapshot = {
    missions: repo.missions() as never, providers: repo.providers() as never, spacecraft: repo.spacecraft() as never, payloads: repo.payloads() as never,
    landingSites: repo.landingSites() as never, regions: repo.regions() as never, sources: repo.sources() as never, events: repo.events() as never,
  };
  const engine = new AiEngine({ snapshot, research });
  let warmed = false;
  const ensureWarm = async () => { if (!warmed || engine.kb.landerPresets.length === 0) { await engine.warm(); warmed = true; } };
  void ensureWarm();

  app.get(`${v1}/ai/capabilities`, async () => { await ensureWarm(); return engine.capabilities(); });

  app.post<{ Body: AiRequest }>(`${v1}/ai/message`, async (req, reply) => {
    const body = req.body ?? ({} as AiRequest);
    if (!body.text || typeof body.text !== 'string') return reply.code(400).send({ error: 'text is required' });
    await ensureWarm();
    const res = await engine.handle({ text: body.text, context: body.context, history: Array.isArray(body.history) ? body.history.slice(-10) : [], provider: body.provider });
    return res;
  });

  app.post<{ Body: { intent: unknown } }>(`${v1}/ai/validate`, async (req, reply) => {
    await ensureWarm();
    const v = engine.validate(req.body?.intent);
    return v.ok ? v : reply.code(422).send(v);
  });
}
