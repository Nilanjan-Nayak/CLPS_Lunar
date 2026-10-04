import type {
  Citation, Fact, KbEvent, KbHistoric, KbLandingSite, KbMission, KbPayload, KbProvider, KbRegion, KbSpacecraft, KnowledgeSnapshot, LanderPreset, ResearchGateway, TransferPreset,
} from './types.js';

/** lower-case, ASCII-ish, single-spaced */
export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’'"]/g, '').replace(/[^a-z0-9.+\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export interface EntityHit<T> { entity: T; score: number; alias: string }

/**
 * Read-only knowledge base over the API catalogue (+ research-engine catalogue on demand).
 * Everything the copilot says must be traceable to one of these records and their sourceIds.
 */
export class KnowledgeBase {
  landerPresets: LanderPreset[] = [];
  transferPresets: TransferPreset[] = [];
  private historicCache: KbHistoric[] | null = null;
  private missionAliases: Array<{ id: string; alias: string }> = [];

  constructor(public snapshot: KnowledgeSnapshot, public research: ResearchGateway) {
    for (const m of snapshot.missions) {
      const lander = snapshot.spacecraft.find((s) => s.id === m.landerId);
      const provider = snapshot.providers.find((p) => p.id === m.providerId);
      const aliases = [m.id, m.shortName, m.name, m.taskOrder, lander?.name ?? '', m.name.match(/'([^']+)'/)?.[1] ?? '']
        .flatMap((a) => [a, a.replace(/[-–—]/g, ' ')])
        .map(norm).filter((a) => a.length >= 3);
      // "peregrine" alone, "griffin" alone, "im 1" without lander etc.
      const short = norm(m.shortName).split(' ');
      if (short.length > 1) aliases.push(short.slice(0, 2).join(' '));
      if (provider && snapshot.missions.filter((x) => x.providerId === provider.id).length === 1) aliases.push(norm(provider.name));
      for (const a of uniq(aliases)) this.missionAliases.push({ id: m.id, alias: a });
    }
  }

  /** Called once the research engine is reachable (presets are used to validate PLAN_LANDING intents). */
  async warm() {
    try {
      const o = await this.research.options();
      this.landerPresets = o.landers; this.transferPresets = o.transfers;
    } catch { /* research engine offline: presets stay empty → lenient validation */ }
  }

  // ---- lookups -----------------------------------------------------------------------------------------------------
  missionById(id: string) { return this.snapshot.missions.find((m) => m.id === id); }
  siteById(id: string) { return this.snapshot.landingSites.find((s) => s.id === id); }
  regionById(id: string) { return this.snapshot.regions.find((r) => r.id === id); }
  providerById(id: string) { return this.snapshot.providers.find((p) => p.id === id); }
  spacecraftById(id: string) { return this.snapshot.spacecraft.find((s) => s.id === id); }
  payloadById(id: string) { return this.snapshot.payloads.find((p) => p.id === id); }
  sourceById(id: string) { return this.snapshot.sources.find((s) => s.id === id); }
  eventsFor(missionId: string) { return this.snapshot.events.filter((e) => e.missionId === missionId).sort((a, b) => a.date.localeCompare(b.date)); }

  /** All missions mentioned in the text, best (longest alias) first. */
  findMissions(text: string): EntityHit<KbMission>[] {
    const t = ` ${norm(text)} `;
    const hits = new Map<string, EntityHit<KbMission>>();
    for (const { id, alias } of this.missionAliases) {
      if (!t.includes(` ${alias} `) && !t.includes(` ${alias}`) && !(alias.length >= 5 && t.includes(alias))) continue;
      const score = alias.length;
      const prev = hits.get(id);
      if (!prev || prev.score < score) hits.set(id, { entity: this.missionById(id)!, score, alias });
    }
    return [...hits.values()].sort((a, b) => b.score - a.score);
  }
  findMission(text: string) { return this.findMissions(text)[0]?.entity; }

  findRegion(text: string): KbRegion | undefined {
    const t = norm(text);
    return this.snapshot.regions.find((r) => t.includes(norm(r.name)) || t.includes(norm(r.id).replace(/-/g, ' ')) || t.includes(norm(r.id)))
      ?? (/south pol|lunar south|antarct/.test(t) ? this.regionById('south-pole') : /far side|farside/.test(t) ? this.regionById('far-side') : /near side|nearside/.test(t) ? this.regionById('near-side') : undefined);
  }
  findSite(text: string): KbLandingSite | undefined {
    const t = norm(text);
    return this.snapshot.landingSites.find((s) => t.includes(norm(s.id)) || t.includes(norm(s.featureName)) || t.includes(norm(s.name)))
      ?? this.snapshot.landingSites.find((s) => norm(s.featureName).split(' ').filter((w) => w.length > 4).some((w) => t.includes(w)));
  }
  findProvider(text: string): KbProvider | undefined {
    const t = norm(text);
    return this.snapshot.providers.find((p) => t.includes(norm(p.name)) || t.includes(norm(p.id).replace(/-/g, ' ')) || norm(p.name).split(' ').filter((w) => w.length > 5).some((w) => t.includes(w)));
  }
  findSpacecraft(text: string): KbSpacecraft | undefined {
    const t = norm(text);
    return this.snapshot.spacecraft.find((s) => t.includes(norm(s.name)) || t.includes(norm(s.id).replace(/-/g, ' ')) || t.includes(norm(s.id)));
  }
  findPayload(text: string): KbPayload | undefined {
    const t = norm(text);
    return this.snapshot.payloads.find((p) => (p.acronym && p.acronym.length >= 3 && t.includes(norm(p.acronym))) || t.includes(norm(p.name)));
  }
  findLanderPreset(text: string): string | undefined {
    const t = norm(text);
    if (/blue ghost|firefly/.test(t)) return 'blue-ghost';
    if (/nova|intuitive|athena|odysseus/.test(t)) return 'nova-c';
    if (/apollo/.test(t)) return 'apollo-lm';
    if (/vikram|chandrayaan|isro/.test(t)) return 'vikram-class';
    if (/generic|clps 100/.test(t)) return 'generic-clps-100kg';
    return this.landerPresets.find((l) => t.includes(norm(l.id)) || t.includes(norm(l.name)))?.id;
  }
  findTransfer(text: string): string | undefined {
    const t = norm(text);
    if (/low energy|ballistic|weak stability|wsb/.test(t)) return 'low-energy';
    if (/phasing|elliptical phasing/.test(t)) return 'phasing';
    if (/carrier|rideshare orbit/.test(t)) return 'carrier-orbit';
    if (/apollo(-| )style|free return|apollo transfer/.test(t)) return 'apollo';
    if (/direct/.test(t)) return 'direct';
    return undefined;
  }

  async historic(): Promise<KbHistoric[]> {
    if (this.historicCache) return this.historicCache;
    try { this.historicCache = await this.research.historic(); } catch { this.historicCache = []; }
    return this.historicCache;
  }
  async findHistoric(text: string): Promise<KbHistoric | undefined> {
    const t = ` ${norm(text)} `;
    const list = await this.historic();
    const hits = list.map((h) => {
      const aliases = uniq([h.id, h.name, h.name.replace(/[-–—]/g, ' '), ...(h.name.match(/^[A-Za-z']+[ -]?\d+[a-z]?/g) ?? [])].map(norm)).filter((a) => a.length >= 4);
      const score = aliases.reduce((acc, a) => (t.includes(` ${a} `) || t.includes(` ${a}`) ? Math.max(acc, a.length) : acc), 0);
      return { h, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    return hits[0]?.h;
  }

  // ---- facts & citations ---------------------------------------------------------------------------------------------
  citations(sourceIds: string[]): Citation[] {
    return uniq(sourceIds).map((id) => { const s = this.sourceById(id); return s ? { id, title: s.title, publisher: s.publisher, url: s.url } : { id, title: id }; });
  }

  fmtDate(iso: string | null | undefined, withTime = true) {
    if (!iso) return null;
    return withTime && iso.includes('T') ? iso.replace('T', ' ').replace(/:\d{2}Z?$/, ' UTC').replace(/Z$/, ' UTC') : iso.slice(0, 10);
  }
  fmtLatLon(lat: number | null, lon: number | null) {
    if (lat === null || lon === null) return 'coordinates not published';
    return `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
  }

  missionFacts(m: KbMission): { facts: Fact[]; sourceIds: string[] } {
    const provider = this.providerById(m.providerId); const lander = this.spacecraftById(m.landerId); const site = this.siteById(m.landingSiteId); const region = site ? this.regionById(site.regionId) : undefined;
    const facts: Fact[] = [
      { label: 'Mission', value: `${m.name} (${m.taskOrder}, ${m.program})` },
      { label: 'Provider / lander', value: `${provider?.name ?? m.providerId} · ${lander?.name ?? m.landerId}${lander?.class ? ` (${lander.class})` : ''}` },
      { label: 'Status', value: `${m.status} — ${m.statusDetail}` },
      { label: 'Launch', value: m.launch.date ? `${this.fmtDate(m.launch.date)} on ${m.launch.vehicle}${m.launch.site ? ` from ${m.launch.site}` : ''}` : `${m.launch.nominal ?? 'TBD'} (nominal) on ${m.launch.vehicle}` },
      { label: 'Landing', value: m.landing.date ? `${this.fmtDate(m.landing.date)}${m.landing.outcome ? ` — ${m.landing.outcome}` : ''}` : m.landing.attempted ? 'attempted — no date on file' : 'not yet (planned)' },
      { label: 'Landing site', value: site ? `${site.name} — ${this.fmtLatLon(site.latitude, site.longitude)}${site.elevationM !== null ? `, ${site.elevationM} m` : ''} (${site.precision}${region ? `, ${region.name}` : ''})` : 'not catalogued' },
      { label: 'NASA payloads', value: `${m.nasaPayloadCount ?? m.payloadIds.length}${m.commercialPayloads?.length ? ` + ${m.commercialPayloads.length} commercial` : ''}` },
    ];
    if (m.endOfMission) facts.push({ label: 'End of mission', value: m.endOfMission });
    return { facts, sourceIds: [...m.sourceIds, ...(site?.sourceIds ?? [])] };
  }

  siteFacts(s: KbLandingSite): { facts: Fact[]; sourceIds: string[] } {
    const region = this.regionById(s.regionId);
    return {
      facts: [
        { label: 'Landing site', value: `${s.name} (${s.featureName})` },
        { label: 'Coordinates', value: `${this.fmtLatLon(s.latitude, s.longitude)}${s.elevationM !== null ? ` · ${s.elevationM} m` : ''} — ${s.precision}: ${s.precisionNote}` },
        { label: 'Region', value: region?.name ?? s.regionId },
        { label: 'Missions', value: s.missionIds.map((id) => this.missionById(id)?.shortName ?? id).join(', ') || '—' },
        { label: 'Status', value: s.status },
      ],
      sourceIds: s.sourceIds,
    };
  }

  payloadFacts(m: KbMission): { facts: Fact[]; sourceIds: string[] } {
    const list = m.payloadIds.map((id) => this.payloadById(id)).filter(Boolean) as KbPayload[];
    const facts: Fact[] = list.map((p) => ({ label: p.acronym || p.name, value: `${p.name} — ${p.type}, ${p.leadOrganization}. ${p.summary}` }));
    if (m.commercialPayloads?.length) facts.push({ label: 'Commercial / partner', value: m.commercialPayloads.join('; ') });
    return { facts, sourceIds: m.sourceIds };
  }

  historicFacts(h: KbHistoric): Fact[] {
    return [
      { label: 'Mission', value: `${h.name} — ${h.agency} (${h.country}), ${h.missionType}${h.crewed ? ', crewed' : ''}${h.commercial ? ', commercial' : ''}` },
      { label: 'Launch → event', value: `${h.launchDate ?? '?'} → ${h.eventDate ?? '?'}` },
      { label: 'Site', value: h.site ? `${this.fmtLatLon(h.site.latitude, h.site.longitude)}${h.site.precision ? ` (${h.site.precision})` : ''}` : 'not catalogued' },
      { label: 'Outcome', value: `${h.outcome}${h.failureCategory ? ` (${h.failureCategory})` : ''}${h.summary ? ` — ${h.summary}` : ''}` },
      ...(h.massKg ? [{ label: 'Mass', value: `${h.massKg} kg` }] : []),
    ];
  }

  /** Compact index for LLM system prompts (ids the model is allowed to use). */
  index() {
    return {
      missions: this.snapshot.missions.map((m) => ({ id: m.id, shortName: m.shortName, status: m.status, landingSiteId: m.landingSiteId, providerId: m.providerId, landing: m.landing.date ?? m.launch.nominal ?? null })),
      landingSites: this.snapshot.landingSites.map((s) => ({ id: s.id, name: s.name, regionId: s.regionId, latitude: s.latitude, longitude: s.longitude })),
      regions: this.snapshot.regions.map((r) => ({ id: r.id, name: r.name })),
      providers: this.snapshot.providers.map((p) => ({ id: p.id, name: p.name })),
      spacecraft: this.snapshot.spacecraft.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      landerPresets: this.landerPresets.map((l) => l.id),
      transferPresets: this.transferPresets.map((t) => t.id),
    };
  }

  eventFacts(events: KbEvent[]): Fact[] { return events.map((e) => ({ label: this.fmtDate(e.date) ?? e.date, value: e.title })); }
}
