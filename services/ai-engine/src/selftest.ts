/**
 * Self-test: loads the API's JSON catalogue directly (no server needed), runs the rule provider over a set of
 * commands/questions and checks the results; then exercises the LLM provider against an in-process mock of an
 * OpenAI-compatible endpoint (tool calling round-trip + validation of a bad intent).
 *
 *   npm run test -w services/ai-engine
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiEngine } from './engine.js';
import type { KnowledgeSnapshot, ResearchGateway } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../../api/src/data');
const load = <T,>(f: string) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')) as T;
const snapshot: KnowledgeSnapshot = {
  missions: load('missions.json'), providers: load('providers.json'), spacecraft: load('spacecraft.json'), payloads: load('payloads.json'),
  landingSites: load('landing-sites.json'), regions: load('regions.json'), sources: load('sources.json'), events: load('events.json'),
};

const RESEARCH = process.env.RESEARCH_ENGINE_URL ?? 'http://127.0.0.1:8790';
const getJson = async (p: string) => { try { const r = await fetch(`${RESEARCH}${p}`, { signal: AbortSignal.timeout(8000) }); return r.ok ? r.json() : null; } catch { return null; } };
const research: ResearchGateway = {
  historic: async () => ((await getJson('/missions')) as { missions?: unknown[] } | null)?.missions as never ?? [],
  options: async () => { const o = (await getJson('/options')) as { landers?: Array<{ id: string; name: string }>; transfers?: Array<{ id: string; name: string }> } | null; return { landers: o?.landers ?? [], transfers: o?.transfers ?? [] }; },
  ephemeris: (lat, lon, utc) => getJson(`/ephemeris?lat=${lat}&lon=${lon}${utc ? `&utc=${encodeURIComponent(utc)}` : ''}`) as Promise<Record<string, unknown> | null>,
  windows: (lat, lon, from, count) => getJson(`/windows?lat=${lat}&lon=${lon}${from ? `&from=${encodeURIComponent(from)}` : ''}${count ? `&count=${count}` : ''}`) as Promise<Record<string, unknown> | null>,
  terrain: (lat, lon) => getJson(`/terrain?lat=${lat}&lon=${lon}`) as Promise<Record<string, unknown> | null>,
};

let failures = 0;
const check = (name: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`); if (!ok) failures++; };

const engine = new AiEngine({ snapshot, research, env: {} });
await engine.warm();
const online = engine.kb.landerPresets.length > 0;
console.log(`research engine ${online ? 'online' : 'OFFLINE (ephemeris/historic checks skipped)'}; presets: ${engine.kb.landerPresets.map((l) => l.id).join(', ') || '—'}`);

type Case = { text: string; expect: (r: Awaited<ReturnType<AiEngine['handle']>>) => boolean; needsResearch?: boolean; context?: { missionId?: string } };
const cases: Case[] = [
  { text: 'show IM-2 with payloads', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_MISSION' && r.intent.missionId === 'im-2' && r.intent.detail === 'payloads' },
  { text: 'take me from Earth to the Blue Ghost landing site', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_LANDING_SITE' && r.intent.landingSiteId === 'ls-bgm1-mare-crisium' && r.intent.journeyFromEarth === true },
  { text: 'south pole missions with landers', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_MISSIONS' && r.intent.regionId === 'south-pole' && r.intent.includeLanders === true },
  { text: 'compare IM-1 and IM-2', expect: (r) => r.kind === 'intent' && r.intent.type === 'COMPARE' && r.intent.missionIds.length === 2 },
  { text: 'explore moon', expect: (r) => r.kind === 'intent' && r.intent.type === 'EXPLORE_MOON' },
  { text: 'landing history', expect: (r) => r.kind === 'intent' && r.intent.type === 'HISTORY' },
  { text: 'Intuitive Machines missions', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_MISSIONS' && (r.intent.missionIds?.length ?? 0) >= 2 },
  { text: 'plan a landing at 84.79 S, 29.2 E with Nova-C on 2026-11-17', expect: (r) => r.kind === 'intent' && r.intent.type === 'PLAN_LANDING' && r.intent.plan.latitude === -84.79 && r.intent.plan.longitude === 29.2 && r.intent.plan.landerId === 'nova-c' && r.intent.plan.landingDate === '2026-11-17' },
  { text: 'plan a landing at Mare Crisium with Blue Ghost, 150 kg payload, phasing transfer, in March 2027', expect: (r) => r.kind === 'intent' && r.intent.type === 'PLAN_LANDING' && Math.abs(r.intent.plan.latitude - 18.56) < 0.01 && r.intent.plan.landerId === 'blue-ghost' && r.intent.plan.payloadKg === 150 && r.intent.plan.transferId === 'phasing' && r.intent.plan.landingDate === '2027-03-01' },
  { text: 'simulate a 14 day mission at 0.5 N, 23.4 E', expect: (r) => r.kind === 'intent' && r.intent.type === 'PLAN_LANDING' && r.intent.plan.surfaceDays === 14 && r.intent.plan.latitude === 0.5 },
  { text: 'how did IM-1 get to the Moon?', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_JOURNEY' && r.intent.missionId === 'im-1' },
  { text: 'journey of Blue Ghost Mission 1 from Earth', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_JOURNEY' && r.intent.missionId === 'blue-ghost-mission-1' },
  { text: 'where did Peregrine launch from and how long did it take', expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_JOURNEY' && r.intent.missionId === 'peregrine-mission-one' },
  { text: 'plan a journey from Earth to 84.79 S, 29.2 E with Nova-C', expect: (r) => r.kind === 'intent' && r.intent.type === 'PLAN_JOURNEY' && r.intent.plan.latitude === -84.79 && r.intent.plan.landerId === 'nova-c' },
  { text: 'when did Blue Ghost land?', expect: (r) => r.kind === 'answer' && /2025-03-02/.test(r.text) && r.citations.length > 0 },
  { text: 'where did IM-1 land?', expect: (r) => r.kind === 'answer' && /Malapert/i.test(r.text) && /80\.1\d°S/.test(r.text) },
  { text: 'what payloads are on Griffin Mission One?', expect: (r) => r.kind === 'answer' && r.facts.length >= 1 && r.suggestedIntent?.type === 'SHOW_MISSION' },
  { text: 'why did IM-2 end early?', expect: (r) => r.kind === 'answer' && /side|crater/i.test(r.text) },
  { text: 'who built Peregrine?', expect: (r) => r.kind === 'answer' && /Astrobotic/.test(r.text) },
  { text: 'which CLPS missions are planned for 2026?', expect: (r) => r.kind === 'answer' && r.facts.length >= 2 && r.suggestedIntent?.type === 'SHOW_MISSIONS' },
  { text: 'show its payloads', context: { missionId: 'im-1' }, expect: (r) => r.kind === 'intent' && r.intent.type === 'SHOW_MISSION' && r.intent.missionId === 'im-1' && r.intent.detail === 'payloads' },
  { text: 'when did it land?', context: { missionId: 'im-1' }, expect: (r) => r.kind === 'answer' && /2024-02-22/.test(r.text) },
  { text: 'where did IM-1 land?', expect: (r) => r.entities?.missionId === 'im-1' && r.entities?.landingSiteId === 'ls-im1-malapert-a' },
  { text: 'what are the sources?', expect: (r) => r.kind === 'answer' && r.citations.length >= 10 },
  { text: 'make the moon purple', expect: (r) => r.kind === 'clarify' && r.options.length >= 2 },
  { text: 'show mission Zeus 9', expect: (r) => r.kind === 'clarify' },
  { text: 'how many lunar landings have there been?', needsResearch: true, expect: (r) => r.kind === 'answer' && /47 lunar landing attempts/.test(r.text) },
  { text: 'when did Apollo 11 land?', needsResearch: true, expect: (r) => r.kind === 'answer' && /1969-07-20/.test(r.text) },
  { text: 'what happened to Luna 25?', needsResearch: true, expect: (r) => r.kind === 'answer' && /Luna 25/.test(r.text) && /fail|crash/i.test(r.text) },
  { text: 'next landing window at Mons Mouton', needsResearch: true, expect: (r) => r.kind === 'answer' && r.facts.length >= 1 && r.suggestedIntent?.type === 'PLAN_LANDING' },
  { text: 'sun elevation at 84.79 S, 29.2 E on 2026-11-17T17:24Z', needsResearch: true, expect: (r) => r.kind === 'answer' && /Sun/.test(r.text) && r.facts.some((f) => f.label === 'Sun') },
];
for (const c of cases) {
  if (c.needsResearch && !online) continue;
  const r = await engine.handle({ text: c.text, context: c.context, provider: 'rules' });
  const ok = c.expect(r);
  check(`rules: ${c.text}`, ok, ok ? `${r.kind}${r.kind === 'intent' ? ' ' + r.intent.type : ''} (${r.ms} ms)` : JSON.stringify(r).slice(0, 300));
}

// ---- intent validation --------------------------------------------------------------------------------------------
check('validate: unknown mission id rejected', !engine.validate({ type: 'SHOW_MISSION', missionId: 'apollo-99', detail: 'basic' }).ok);
check('validate: alias resolved', (() => { const v = engine.validate({ type: 'SHOW_MISSION', missionId: 'Blue Ghost', detail: 'basic' }); return v.ok && v.intent.type === 'SHOW_MISSION' && v.intent.missionId === 'blue-ghost-mission-1'; })());
check('validate: bad latitude rejected', !engine.validate({ type: 'PLAN_LANDING', plan: { latitude: 120, longitude: 0 } }).ok);
check('validate: bad type rejected', !engine.validate({ type: 'PAINT_MOON' }).ok);

// ---- LLM provider against a mock OpenAI-compatible endpoint -----------------------------------------------------------
const script: Array<(msgs: Array<{ role: string; content?: string; name?: string }>) => unknown> = [
  // 1st call: model proposes an invalid intent (unknown id) → engine must reject and let it retry
  () => ({ tool_calls: [{ id: 'c1', type: 'function', function: { name: 'scene_intent', arguments: JSON.stringify({ intent: { type: 'SHOW_MISSION', missionId: 'im-99', detail: 'basic' }, explanation: 'wrong id' }) } }] }),
  // 2nd call: lookup
  () => ({ tool_calls: [{ id: 'c2', type: 'function', function: { name: 'lookup', arguments: JSON.stringify({ query: 'IM-2', kind: 'mission' }) } }] }),
  // 3rd call: grounded answer citing a source id that appeared in the lookup
  (msgs) => {
    const tool = msgs.filter((m) => m.role === 'tool').pop();
    const ids = (JSON.parse(tool?.content ?? '{}') as { sourceIds?: string[] }).sourceIds ?? [];
    return { tool_calls: [{ id: 'c3', type: 'function', function: { name: 'answer', arguments: JSON.stringify({ text: 'IM-2 landed on 2025-03-06 and tipped over.', facts: [{ label: 'Landing', value: '2025-03-06' }], sourceIds: ids.slice(0, 1), suggestedIntent: { type: 'SHOW_MISSION', missionId: 'im-2', detail: 'basic' } }) } }] };
  },
];
let calls = 0;
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const { messages } = JSON.parse(body) as { messages: Array<{ role: string; content?: string }> };
    const step = script[Math.min(calls, script.length - 1)](messages);
    calls++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, ...(step as object) } }] }));
  });
});
await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
const port = (mock.address() as { port: number }).port;
const engineLlm = new AiEngine({ snapshot, research, env: { AI_API_KEY: 'test', AI_BASE_URL: `http://127.0.0.1:${port}`, AI_MODEL: 'mock' } });
await engineLlm.warm();
check('llm: provider configured from env', engineLlm.capabilities().providers.includes('llm'));
const r = await engineLlm.handle({ text: 'tell me about IM-2' });
check('llm: invalid intent rejected, lookup executed, grounded answer returned', r.kind === 'answer' && r.grounded && r.citations.length === 1 && r.suggestedIntent?.type === 'SHOW_MISSION' && r.trace.some((t) => t.step === 'llm.intent.invalid') && r.trace.some((t) => t.step === 'llm.tool.lookup'), JSON.stringify({ kind: r.kind, provider: r.provider, trace: r.trace.map((t) => t.step) }));
// LLM failure → rules fallback
const engineDown = new AiEngine({ snapshot, research, env: { AI_API_KEY: 'test', AI_BASE_URL: 'http://127.0.0.1:1', AI_MODEL: 'mock', AI_TIMEOUT_MS: '1500' } });
const r2 = await engineDown.handle({ text: 'show IM-1 with payloads' });
check('llm down → rules fallback', r2.kind === 'intent' && r2.provider === 'llm+rules' && r2.intent.type === 'SHOW_MISSION', r2.trace[0]?.detail?.slice(0, 80));
mock.close();

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
