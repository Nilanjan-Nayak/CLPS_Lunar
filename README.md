# CLPS Lunar Mission Browser

NASA-grounded **Earth → Moon → Lunar Surface → CLPS Mission** dynamic environment, built to the
*Master Architecture* contract (data-, asset-, scene- and user-driven; nothing fabricated).

> বাংলা সারাংশ: এটা একটা monorepo — `apps/web` (React + TypeScript + Vite + React Three Fiber) হল
> dynamic virtual lunar environment, `services/api` (Fastify) হল একমাত্র data source, আর `assets/`
> হল NASA asset registry (প্রতিটা asset-এর source / credit / license / sha256 metadata সহ)।
> Frontend-এ কোনো CLPS database নেই; সব data `/api/v1/*` থেকে আসে।

## Run

```bash
npm install                 # workspaces: apps/web, services/api, services/ai-engine
npm run dev                 # API :8787 + web :5173 + Python research engine :8790 (vite proxies /api and /assets)
# or separately: npm run dev:api (builds services/ai-engine first) / npm run dev:web / npm run dev:research
npm run train:research      # re-train the outcome model from services/research-engine/dataset (writes model/model.json)
npm run test:ai             # AI-engine self-test: 36 checks (rule grammar, catalogue answers, intent validation, mock-LLM tool loop)
npm run typecheck           # all packages
npm run build
# headless verification of the live environment (needs playwright + chromium; DEV server running):
node tools/e2e/sky.mjs            # star positions vs. rendered SVS sky (Orion field)
node tools/e2e/world-clock.mjs    # clock pinning, Earth follow across a clock jump, mission-time hand-over
npm run check:ephemeris           # Sun/Earth/Moon geometry vs. JPL Horizons DE441 (15 quantities, 3 epochs; tolerance 2′)
python3 tools/asset-pipeline/calibrate-earth-glb.py --write   # re-derive the VTAD Earth GLB orientation from its texture

# optional LLM provider for the Copilot (OpenAI-compatible chat completions with tool calling); without it the
# deterministic rule provider answers everything it can, and nothing else changes:
AI_API_KEY=… AI_BASE_URL=https://api.openai.com/v1 AI_MODEL=gpt-4o-mini npm run dev:api
```

Optional asset refresh (downloads the NASA originals again and rebuilds derived tiles + manifest):

```bash
npm run assets:all          # fetch.mjs → derive.py (needs python3 + Pillow + numpy) → build-manifest.mjs
```

## What is real, what is visualization

| Layer | Data | Grade |
|---|---|---|
| LOD0 Moon globe | NASA SVS CGI Moon Kit `ldem_4` (LOLA-derived DEM, 4 px/deg) + LROC colour map | derived, not science-grade |
| LOD1 terrain tiles (47 × 22.5°) | CGI Moon Kit `ldem_16_uint` (16 px/deg ≈ 1.9 km/px) + `lroc_color_poles_4k` | derived (`derive.py`) |
| LOD2 imagery | LROC WAC global mosaic 303 ppd (100 m/px) via NASA Solar System Treks WMTS, proxied + cached by the API | NASA/GSFC/ASU |
| Landing-site elevation / slope / normal | sampled from the LOD1 DEM by `services/api/src/services/terrain.ts` (bilinear), datum 1737.4 km | derived; published values shown alongside with the Δ |
| Earth | 6,371 km globe with NASA Visible Earth textures — Blue Marble NG (Aug 2004, day), Black Marble 2016 (night lights), Blue Marble Clouds — placed and oriented by the world-clock ephemeris (position/distance, Earth Rotation Angle, terminator). The NASA VTAD "Earth with Clouds" GLB remains selectable (`earthRenderer: nasa-glb`; its cube-projected texture was image-calibrated to Blue Marble — `tools/asset-pipeline/calibrate-earth-glb.py`, yaw −90°, 89 % land/ocean agreement, clouds baked/static) | context layer driven by an ephemeris checked against JPL Horizons (≤0.6′); not an operational ephemeris |
| Star sky | NASA SVS **Deep Star Maps 2020** (Hipparcos-2 / Tycho-2 / Gaia DR2) celestial equirectangular map, tone-mapped from the OpenEXR original (8k on quality *high*, 4k otherwise), rotated from ICRF/J2000 into the Moon body-fixed frame (IAU 2009) — verified against Orion, Sirius, Aldebaran (`tools/e2e/sky.mjs`) | real catalogue sky; star brightness not photometric after tone mapping |
| Sun | directional light + camera-relative 0.53° disc along the ephemeris Sun direction | ephemeris-driven |
| Moon (far views) | NASA SVS `moon_small.glb` | context |
| LRO | NASA 3D Resources GLB on a schematic ~125 km polar orbit (×400 display scale) | schematic, labelled as such |
| CLPS landers (Nova-C, Blue Ghost, Peregrine, Griffin, APEX, Blue Moon Mk1) | **no NASA-published model exists → information marker**, never an invented model | — |
| Trajectories | none on file → none rendered (`trajectoryNote` shown) | — |
| Lighting | default **`ephemeris`**: the real Sun for the world-clock time (sub-solar point from `solar-system/ephemeris.ts`, Meeus + IAU 1976 precession + IAU 2009, ≤0.05°); `auto` restores the planner's per-scene visualization light (`lightingFor()`), `manual` exposes sliders; the HUD states which one is active. A *night aid* (earthshine-level fill) keeps the surface legible in lunar night | ephemeris by default |

Coordinates and elevations for landed missions come from LROC/NASA statements (IM-1 80.13°S 1.44°E,
Blue Ghost M1 18.56°N 61.81°E, IM-2 84.7906°S 29.1957°E). Sites with unpublished coordinates
(Blue Ghost M2, Blue Moon Mk1) are catalogued but not plotted; approximate targets are drawn with a dashed ring.

## Real sky + world clock (live environment)

The environment is **time-driven**. A single world clock (`state/clockStore.ts`) feeds `ClockDriver`, which evaluates
`solar-system/ephemeris.ts` every frame and publishes a `Geometry` (sub-solar / sub-Earth points, Earth vector and distance,
Sun direction, Earth Rotation Angle, Moon illuminated fraction, ICRF→scene rotation) that the Sun, the Earth, the sky sphere,
the Moon material and the HUD all read. Nothing is animated by hand.

| Clock mode | Set by | Behaviour |
|---|---|---|
| **LIVE** (default) | app start, `now` chip, leaving a mission scene | UTC now; Earth rotates, Moon phase/libration change exactly as in the real sky |
| **FIXED** | `ScenePlanner.timeFor()` (mission scenes → landing UTC; `/plan/scene` → planned landing UTC), the clock bar's editable UTC field, rate chips (paused, 1×, 1 min/s … 1 day/s) | frozen or fast-forwarded from a chosen epoch; user edits *pin* the clock so later scenes do not override it |
| **MISSION TIME** | `MissionSimulation` playback / scrub | launch UTC + simulated *t*; hands back to LIVE when the simulation unmounts |

* **Sky** — `solar-system/SkyMap.tsx`: SVS Deep Star Maps 2020 on a camera-centred 1e6 km sphere (`scale(1,1,−1)` so RA increases eastward),
  group matrix `skyMatrixScene = C·M(ICRF→Moon body-fixed)·Cᵀ`. `tools/e2e/sky.mjs` aims the dev camera at Alnilam, projects the catalogue
  RA/Dec of ten bright stars through the same matrices and checks each lands on a rendered star (see `docs/screenshots/sky-orion-projection-check.png`).
* **Earth** — `solar-system/Earth.tsx` + `EarthMaterial.ts`: day/night blend across the true terminator, city lights, cloud layer, atmosphere rim;
  `earthMatrixScene` orients the geographic grid (Earth's pole = celestial pole, ERA from UT). Sanity checks: 2026-10-10 10:00 UTC (new Moon) →
  full Earth with central Africa facing the Moon (`docs/screenshots/earth-2026-10-10-full-africa.png`); 2025-03-06 17:28:50 UTC (IM-2 landing) →
  Moon 50 % illuminated (first quarter was at 16:32 UTC that day).
* **Camera** — in the EARTH / EARTH_ORBIT states `CameraRig` follows the Earth (libration and distance change with the clock, including
  jumps that happen mid-flight), so the framing holds when the time changes.
* **HUD** — `ui/WorldClockBar.tsx`: mode badge, editable UTC, rate chips, sub-solar point, Earth distance, Moon phase, focus-site Sun elevation
  with a *next sunrise* jump, night-aid toggle. The scene-config panel exposes lighting mode, sky / Earth renderers and quality tier.
* **Accuracy** — Meeus low-precision Sun and truncated ELP-2000 Moon, IAU 1976 precession + mean obliquity of date, IAU 2006 GMST about the
  mean pole of date, IAU 2009 Moon orientation, TT = UTC + 69.184 s; nutation (≤17″) and polar motion ignored. `npm run check:ephemeris` compares
  15 quantities (Moon sub-Earth/sub-solar points, Earth sub-solar/sub-lunar points, range) with **JPL Horizons DE441** at three epochs:
  worst error **0.6′ (0.01°)**, range within 42 km. Good for phase, terminator, libration and lighting; not a mission ephemeris (use SPICE for that).
* **Textures & quality** — `assets:fetch` downloads the SVS EXR (130 MB, cached in `assets/.cache/raw`) and the Visible Earth originals;
  `derive.py` tone-maps the EXR (`exr-to-jpg`, needs `pip install OpenEXR`) and writes the Earth JPEGs + low-res variants (`earth-texture`).
  Quality `low` uses the 4k sky and 2048×1024 Blue Marble; `high` loads the 8k sky and 5400×2700 day map. In DEV `?quality=low|medium|high` overrides the tier.

Credits: sky — *NASA/Goddard Space Flight Center Scientific Visualization Studio; Gaia DR2: ESA/Gaia/DPAC*; Earth — *NASA Earth Observatory /
Visible Earth (Blue Marble NG, Black Marble 2016, Blue Marble Clouds)*. Full source/credit/license metadata sits next to each file under `assets/`.

## Architecture map (Master Architecture → code)

```
apps/web/src
  app/            App, Router, routes, providers, layouts
  pages/          Space/Earth/Moon scene pages, missions, timeline, payloads, providers, map, research, assets, sources
  solar-system/   Earth, Sun, StarField, MoonOrbit, SpaceNavigation arc, BodyLabels   (context layer)
  lunar-world/
    core/         WorldRenderer (R3F canvas, km frame, log depth), LunarScene, LunarWorld
    moon/         MoonSurface (LOD0 DEM globe), MoonMaterial (DEM displacement shader, manual bilinear, coverage masks),
                  MoonGeometry (lat/lon patches), MoonModel (NASA GLB for far views)
    terrain/      TerrainLoader/Cache (LOD1), TerrainSystem (what to load per camera sub-point), TerrainTile,
                  ImageryLoader/ImageryTile (LOD2 WAC draped over LOD1 DEM), CoverageMask (LOD replacement),
                  ElevationResolver (lat/lon → elevation, normal, north/east frame)
    locations/    LandingSite, LocationMarker, LunarRegion
    spacecraft/   SpacecraftRegistry, SpacecraftResolver (NASA asset or info-marker — no hard-coded mission→model mapping),
                  SpacecraftSystem/SpacecraftInstance, landers/ orbiters/ rovers/
    trajectories/ Trajectory (renders only verified datasets — currently none on file)
    camera/       CameraPoses (per CameraState), CameraDirector (multi-leg flights), CameraRig
    interaction/  useSceneInteraction (picking → selection store)
    overlays/     CoordinateGrid
  scene-manager/  SceneConfig (declarative), ScenePlanner (intent → SceneConfig), IntentParser, SceneLoader, SceneManager
  asset-system/   AssetRegistry (manifest), AssetCache, ModelLoader, TextureLoader, AssetResolver, AssetManager
  map/            2-D LROC map (equirectangular projection)
  services/       api.ts (typed fetchers), queries.ts (TanStack Query)
  state/          zustand stores: world, camera, scene, selection, asset, terrain
  hooks/ utils/ constants/ types/
services/api/src
  routes/         /api/v1/{health, assets, assets/:id, missions[?status|providerId|regionId], missions/:id,
                  missions/:id/assets, missions/:id/events, providers[/:id], spacecraft[/:id], landers/:id, payloads[/:id],
                  landing-sites[/:id], landing-sites/:id/terrain[?radiusKm], lunar/regions[/:id], lunar/terrain/tilesets,
                  lunar/terrain/elevation?lat&lon, lunar/terrain/tiles?lat&lon&radiusKm, lunar/imagery/tilesets,
                  lunar/imagery/:layer/:z/:y/:x.jpg, sources[/:id], timeline, search?q}
  services/       terrain.ts (DEM sampling), imagery.ts (Trek WMTS proxy + disk cache), catalog
  repo/           jsonRepository (seed JSON now; prisma/schema.prisma ready for PostgreSQL/PostGIS — Phase 8)
  routes/ai.ts    /api/v1/ai/{capabilities, message, validate} — mounts services/ai-engine on the same repository
services/ai-engine/src (Phase 12, framework-free TypeScript library used by the API)
  types.ts        SceneIntent (mirror of the frontend contract), AiRequest/AiResponse (intent | answer | clarify)
  schema.ts       INTENT_JSON_SCHEMA (LLM tool signature) + validateIntent(): schema + catalogue-id validation
  knowledge.ts    KnowledgeBase: entity index/aliases, fuzzy lookup, fact cards with sourceIds, research gateway
  rules.ts        RuleProvider: command grammar → intents; question templates → cited answers (always on)
  llm.ts          LlmProvider: OpenAI-compatible tool calling (lookup / research / scene_intent / answer), validated
  engine.ts       AiEngine: provider selection, fallback, capabilities; selftest.ts
services/research-engine  Python: DEM/terrain, ephemeris, descent, outcome model (see below)
assets/           NASA asset registry: every folder has metadata.json (source URL, credit, license, sha256, encoding)
tools/asset-pipeline  fetch.mjs, derive.py, inspect-glb.mjs, build-manifest.mjs
tools/e2e         headless screenshot/flight harness (needs `playwright`)
```

### Scene flow (user-driven, declarative)

URL is the source of truth: `CommandBar → IntentParser → route` → `useSceneIntent → SceneManager.run()` →
`ScenePlanner` (missions/sites/regions from the API + SpacecraftRegistry + AssetRegistry) → **SceneConfig**
(objects, layers, camera path, lighting, notes, provenance) → stores + `SceneLoader.preload` →
`cameraStore.requestFlight` → `LunarScene` renders `config.objects` gated by `config.layers`.
The AI/Copilot page produces the same structured intents; it never touches the scene directly.

### Terrain / LOD pipeline

`camera sub-point + altitude → TerrainSystem` picks LOD1 tiles inside a radius, then WAC imagery level
(5–8) inside a view radius; imagery patches are draped on the parent LOD1 DEM texture (`uDemRect`),
and `CoverageMask` textures make coarser LODs *discard* where finer LODs exist (no z-fighting).
Everything is lazy-loaded, LRU-cached (LOD1 tiles 18, imagery 72) and disposed on evict.

## Research engine (Phase 11) — planning a *future* research landing

`services/research-engine` is a Python 3 service (stdlib + numpy/Pillow for the DEMs; no web framework). It reads two **separate** scientific inputs — never the visual assets: the CGI Moon Kit LOLA-derived global DEM (16 px/deg ≈ 1.9 km) and, for |lat| ≥ 75°, the **PDS LOLA GDR polar stereographic DEMs at 240 m/px** (`ldem_75s_240m` / `ldem_75n_240m`, PDS Geosciences Node, auto-downloaded to `assets/.cache/raw/`). Each plan says which one it used (`site.terrain.grade` = `science (LOLA GDR)` or `regional (…16 px/deg)`).

| Endpoint (via API proxy `/api/v1/research/…`) | What it returns |
|---|---|
| `GET /missions` | 47 lunar landing attempts 1959 → 2025 (NSSDCA Master Catalog + timeline; coordinates flagged `published` / `approx` / none) |
| `GET /model`, `GET /features` | trained logistic-regression outcome model (standardized coefficients, leave-one-out CV, caveats) and the feature table |
| `GET /options` | editable lander presets (Nova-C, Blue Ghost, Apollo LM, Vikram, generic), launch vehicles, transfer types — approximate public figures, marked with a confidence level |
| `GET /terrain?lat&lon`, `GET /grid?lat&lon&halfKm` | elevation, slope, aspect, roughness, relief, max Sun elevation (240 m polar GDR when covered, else regional); 32 × 32 suitability heuristic on a metric ±15 km box (≈ 940 m cells) |
| `GET /horizon?lat&lon` | geometric terrain horizon from the DEM (36 azimuths, 60 km), polar sites only |
| `GET /ephemeris?lat&lon&utc` | Sun/Earth elevation + azimuth at the site, sub-solar/sub-Earth points, Earth distance (Meeus low-precision Sun/Moon + IAU 1976 precession + IAU WGCCRE 2009 Moon orientation; validated against Apollo 11/12/15/17 to ≈ 0.3° and against JPL Horizons sub-points to ≤ 0.6′) |
| `GET /windows?lat&lon&from&count&target` | next landing opportunities: local sunrise passing through the target Sun elevation (default 7°, lowered adaptively near the poles), with sunlit hours after landing, peak Sun and 14-day Earth elevation range; terrain-horizon-masked at the poles |
| `POST /plan` (`latitude, longitude, landerId, transferId, payloadKg, surfaceDays, landingDate?, gridHalfKm?, …`) | full plan: terrain (+ regional cross-check, horizon), outcome probability + 5 nearest historical analogues, Δv chain (corrections → LOI → DOI → powered descent → reserve), mass chain, max payload, closed-loop E-guidance descent samples, 7-phase timeline with UTC (Launch → Separation/TLI → Transfer → LOI → Landing → Surface ops → Data relay), **ephemeris calendar** (landing = first sunrise window on/after `landingDate`, launch back-computed from the phase durations; Sun/Earth elevation samples over the whole mission; 4 alternative opportunities), comms summary (Earth visibility → relay needed?), summary card, flags |

The React scene consumes the plan through `ScenePlanner.planLanding()` → `SceneConfig` (`plan-site`, `analysis-grid`, `simulation`, neighbouring `historic-landing` objects, and `lighting` = the sub-solar point at the planned landing time) and animates it in `features/planning/MissionSimulation.tsx` (chase camera via `simCamera`, 10 Hz readouts in `simStore`). During playback the Sun direction follows mission time from the plan's ephemeris samples (`worldStore.lightingMode = 'ephemeris'`, status bar says so); moving the Sun sliders pins it (`manual`). The plan page shows the illumination/Earth-elevation chart, the terrain horizon strip and a landing-opportunities table ("Use" re-plans for that window). `HISTORY` intent → `ScenePlanner.history()` reveals the catalogue chronologically (`historyStore`, "Mission Lunar" card).

**Honesty notes.** Everything in the simulation is model output driven by the user's parameters — never flight data. The outcome model's leave-one-out accuracy (≈ 58 %) is *below* the majority baseline (60 %) on 40 samples: it is exploratory and shown with its CV numbers; the physics budgets (Tsiolkovsky chain + descent simulation) are the useful part. Lander presets are approximate and editable; where a preset's public figures do not close the budget the UI says so instead of hiding it.


Lander presets (`engine/landers.py`) are editable model parameters, not authoritative spacecraft data. The Blue Ghost preset uses the
published Mission 1 figures (launch mass 1,517 kg, dry 469 kg, ≈94 kg of NASA payloads → ≈954 kg propellant; LEROS 4-ET + 8 Spectre ≈ 2.6 kN,
Isp ≈ 320 s): with them the Δv chain (phasing transfer + LOI + DOI + simulated descent + 50 m/s reserve) closes with only ≈10–20 kg to spare —
as tight as the real flight — and the planner flags any configuration (e.g. the 155 kg payload capacity at the same launch mass) that does not close.
## Mission journeys — launch site → route → arrival, animated per mission

The permanent Earth→Moon line is gone. Instead every mission (flown or upcoming) and every user plan gets an **event-anchored journey**
that plays back inside the live environment: where it lifted off, how it flew (direct coast, phasing loops, or Peregrine's lunar-distance
loop back to Earth), and how long each leg took — with the world clock running at the journey's real UTC so the Earth's rotation, the
Moon's position and the Sun follow the flight.

| Piece | Where | What it does |
|---|---|---|
| Launch-pad catalogue | `services/api/src/data/launch-sites.json` | 8 pads (KSC LC-39A, CCSFS SLC-41/-40, LC-36, VSFB SLC-4E, SDSC SHAR, Tanegashima, Wenchang) with coordinates, operator, vehicles, sources |
| Flight profiles | `services/api/src/data/flight-profiles.json` | one spec per mission: pad, published launch/TLI/LOI/DOI/PDI/landing UTC (or an *illustrative date* for unflown missions), transfer type, parking/lunar orbit altitudes, extra published events, notes, source ids |
| Route builder | `services/research-engine/engine/journey.py` (`POST /journey`) | two-body model between the anchors: ascent + parking orbit → **Izzo Lambert** transfer from the parking orbit to the real Moon position at LOI (launch plane chosen through the LOI point) → circular lunar orbit in the Moon-fixed frame → DOI ellipse → powered-descent arc to the published site; phasing profiles add apogee-raising loops, `earth-return` (Peregrine) adds the ≈393,000 km loop and re-entry |
| API | `GET /api/v1/launch-sites`, `GET /api/v1/journeys` (index: which missions have a route and why not), `GET /api/v1/missions/:id/journey`, `POST /api/v1/plan/journey { planInput, launchSiteId }` | cached; a mission without published anchors returns **404 — routes are never invented** (Draper CP-12: cancelled, no route) |
| Scene | `SHOW_JOURNEY` / `PLAN_JOURNEY` intents → `ScenePlanner.journey()` → `SceneConfig` objects `journey` + pad/site markers → `lunar-world/trajectories/Journey.tsx` | segment lines (faint = full route, bright = flown so far), launch-pad marker that rotates with the Earth, spacecraft marker, chase / overview / free cameras, `journeyStore` playback (days compressed per phase, 0.5–4×), 10 Hz readouts |
| HUD | `ui/JourneyPanel.tsx` | launch site + vehicle + UTC, route summary (transfer type, coast days, launch-plane inclination), arrival, phase rail (click to seek), timeline with **how each anchor is known** (`published` / `modeled` / `projected (illustrative date)` / `planned (model input)`), Δv chain, sources; on `/space` it lists all journeys |
| Entry points | Missions list card **🚀 Journey**, mission page **Launch → Moon journey**, mission info panel, plan page **🚀 Journey from Earth** (with a launch-pad selector), Copilot / command bar (`how did IM-1 get to the Moon?`, `plan a journey from Earth to 84.79 S, 29.2 E with Nova-C on a Vulcan`) | the URL is the source of truth: `/missions/:id/journey`, `/plan/journey?<plan keys>&launchSiteId=…` |

**Frames.** The scene is Moon-body-fixed, so the trans-lunar arc is drawn as its *track in that frame* (≈ the Earth–Moon rotating frame):
a static Earth→Moon curve the spacecraft rides along, whose first 40,000 km are blended onto the Earth's current position so it stays
attached to the parking orbit. Earth-centred orbits (parking, phasing loops, Peregrine's loop) are drawn around the Earth's current
position with the inertial orientation of the moment, so they turn slowly as the Moon moves — correct for an inertially fixed ellipse
seen from a rotating frame. Speeds in the HUD are geocentric-inertial.

**Plans from precedent.** `POST /plan/journey` takes the research-engine plan — its transfer type (*direct* ≈ the IM-1/IM-2 CLPS
profile, ≈4.5 d coast; *phasing* ≈ Blue Ghost / Chandrayaan-style Earth-orbit raising loops, ≈30 d; *Apollo-like* 3 d; *low-energy*
schematic), the lander preset built from the flown missions' published figures (mass, thrust, Isp → the integrated powered descent) and the
plan calendar (landing at local sunrise, launch back-computed from the precedent phase durations) — and re-solves the Lambert transfer for
the plan's own dates and the Moon's real position, so two plans on different days get different routes. The low-energy option is drawn as a
labelled *schematic* (a ballistic-capture trajectory needs an n-body solver the engine does not have).

**Honesty labels.** `fidelity` is carried through everything: **RECONSTRUCTED** (flown mission: pad, event times and site are published,
the arcs between them are a model — *not telemetry*), **PROJECTED** (announced mission on an illustrative date inside its window,
provider's previous profile), **PLANNED · MODEL** (user plan). The spacecraft label repeats it on every frame.
Numbers to sanity-check: direct TLI Δv 3,130–3,140 m/s, LOI 810–880 m/s, arrival v∞ 0.8–1.0 km/s, IM-1 total 7.72 d, Blue Ghost M1 46.1 d,
Peregrine 10.57 d — all consistent with the published mission summaries.

Screenshots: `docs/screenshots/journey-im1-overview.png`, `journey-im1-translunar-follow.png`, `journey-im1-lunar-orbit.png`,
`journey-im1-descent.png`, `journey-bg1-phasing-loops.png`, `journey-peregrine-earth-return.png`, `journey-plan-overview.png`,
`space-journey-index.png`. E2E: `tools/e2e/journey-route.mjs <missionId>` and `tools/e2e/journey-space-plan.mjs` (run from a folder with
playwright installed; `?quality=low` is added automatically).

## AI engine (Phase 12) — Copilot that proposes, never controls

`services/ai-engine` answers `POST /api/v1/ai/message { text, context?, history? }` with **data only**:

| kind | what it is | how the frontend uses it |
|---|---|---|
| `intent` | a `SceneIntent` validated against the JSON schema **and** the catalogue ids (unknown mission/site/region/preset → rejected) | the user clicks *Run in 3D* (or enables auto-run) → `intentToRoute()` → URL → `useSceneIntent` → `ScenePlanner` → `SceneConfig`. Exactly the command-bar path; components never see free text |
| `answer` | text + fact rows + `citations[]` (source ids from the records used) + optional `suggestedIntent`; `grounded:false` flags LLM text that had no lookups | rendered as a cited card; *Show in 3D* runs the suggested intent through the same route |
| `clarify` | nothing verifiable matched | example chips |

Providers: **rules** (deterministic grammar for commands — missions, sites, regions, providers, years, journeys, compare, `plan … <lat> N|S, <lon> E|W [lander] [on YYYY-MM-DD | in March 2027] [150 kg] [14 days] [phasing]`; question templates — when/where/who/why/status/payloads/how-many/which-year, historic NSSDCA catalogue (“when did Apollo 11 land”), ephemeris (“next landing window at Mons Mouton”, “sun elevation at … on …”); “it / this mission” resolves against the scene selection or the last entities) and an optional **LLM** (OpenAI-compatible, tool calling: `lookup`, `research`, `scene_intent`, `answer`; every intent is re-validated, citations must come from tool results, any error → rules). `GET /api/v1/ai/capabilities` lists providers, the intent schema and examples; `POST /api/v1/ai/validate` validates any client-side intent. `npm run test:ai` runs the self-test (36 checks incl. a mock LLM endpoint that first proposes an invalid id and must retry).

## Status by phase

| Phase | Status |
|---|---|
| 1 Frontend foundation | done |
| 2 NASA asset pipeline + registry | done (13 assets incl. SVS Deep Star Map 2020 + Visible Earth textures with low-res variants; metadata + licenses, manifest) |
| 3 Earth | done (ephemeris-placed textured globe: Blue Marble NG / Black Marble / clouds; NASA VTAD GLB selectable) |
| 4 Moon | done (GLB + LOD0 DEM globe) |
| 5 Earth → Moon camera state machine | done (SPACE … MISSION_FOCUS, journeys; Earth-following in EARTH states) |
| Solar-system context (§ Real sky + world clock) | done — live/fixed/mission world clock, real Sun/Earth/Moon geometry, SVS star sky; verified by `tools/e2e/sky.mjs` and `tools/e2e/world-clock.mjs` |
| 6–7 Scientific / dynamic terrain | done for LOD0/LOD1/LOD2 imagery in the scene; research engine uses PDS LOLA GDR 240 m polar DEMs (|lat| ≥ 75°) for site analysis; finer GDR (80/40 m) and non-polar GDR tiles not yet ingested |
| 8 Backend | Fastify API done on JSON seed; Prisma schema present, PostGIS ingestion pending |
| 9 Dynamic spacecraft | registry/resolver done; LRO real model, landers = info markers |
| 10 Dynamic mission scene | done (lander / payloads / complete / multi-mission / compare) |
| 11 Research engine | Python engine (services/research-engine, :8790, proxied at /api/v1/research/*): 47-mission NSSDCA landing catalogue, LOLA-DEM terrain features (240 m polar GDR), terrain horizon, Sun/Earth ephemeris + landing windows + mission calendar, logistic outcome model (exploratory), Δv/mass budgets, powered-descent simulation → Landing plan studio (/plan), 3-D mission simulation with ephemeris lighting (/plan/scene) and landing-history tour (/moon?history=1) |
| 12 AI engine | `services/ai-engine` mounted at `/api/v1/ai/*`: text → validated **SceneIntent** *or* grounded **answer with citations** *or* clarification. Rule provider always on (grammar + catalogue templates + research-engine ephemeris/historic questions, pronoun context); optional OpenAI-compatible LLM provider (`AI_API_KEY`) restricted to four tools, schema/catalogue-validated, falls back to the rules; Copilot chat page (`/copilot`, `?q=` hand-off from the command bar), "Run in 3D" → route → ScenePlanner. The AI never touches the scene. |
