# CLPS Lunar Mission Browser

> A NASA-grounded, interactive **Earth → Moon → Lunar Surface → CLPS mission** environment for exploring lunar missions, terrain, spacecraft, landing sites, mission journeys, and future landing plans.

[![TypeScript](https://img.shields.io/badge/TypeScript-72.5%25-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-18.3%25-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/3D-Three.js-black?logo=three.js)](https://threejs.org/)
[![Fastify](https://img.shields.io/badge/API-Fastify-000000?logo=fastify)](https://fastify.dev/)
[![NASA Data](https://img.shields.io/badge/Data-NASA%20grounded-0B3D91?logo=nasa&logoColor=white)](https://www.nasa.gov/)

## Overview

**CLPS Lunar Mission Browser** is a full-stack interactive lunar exploration platform built around NASA and public scientific datasets. It combines a real-time 3D solar-system context, dynamic lunar terrain, mission catalogues, landing-site analysis, journey reconstruction, and a grounded AI Copilot.

The project is designed around one core principle:

> **Visualize what is known, label what is reconstructed, and never invent what is unavailable.**

The frontend does not contain a separate mission database. Catalogue data is served through the Fastify API, while visual assets are managed through a versioned NASA asset registry with source, credit, license, and checksum metadata.

## Highlights

- Interactive **Earth → Moon → lunar surface** navigation
- NASA-grounded lunar terrain with DEM elevation and LROC imagery
- Real-time world clock with live, fixed, and mission-time modes
- Ephemeris-driven Sun, Earth, Moon, lighting, phase, libration, and sky orientation
- CLPS mission, provider, spacecraft, payload, landing-site, and timeline exploration
- Dynamic terrain sampling: elevation, slope, aspect, normal, roughness, and relief
- Mission journey reconstruction from launch site to lunar arrival
- Future landing planner with terrain analysis, descent simulation, launch windows, and model outputs
- Grounded AI Copilot that returns validated scene intents, cited answers, or clarification requests
- Clear fidelity labels for reconstructed, projected, and modelled content
- Automated end-to-end checks for sky projection, world-clock behaviour, and ephemeris accuracy

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Three Fiber, Three.js, Zustand, TanStack Query |
| API | Fastify, TypeScript, typed REST endpoints |
| AI engine | TypeScript, deterministic rule provider, OpenAI-compatible tool calling |
| Research engine | Python, NumPy, Pillow, scikit-learn |
| Scientific data | NASA SVS, LROC, LOLA-derived DEMs, NASA Visible Earth, NSSDCA, JPL Horizons validation |
| Architecture | npm workspaces monorepo with separate web, API, AI, research, asset, and testing layers |

## Project Structure

```text
CLPS_Lunar/
├── apps/
│   └── web/                    # React + TypeScript + Vite application
├── services/
│   ├── api/                    # Fastify API and catalogue services
│   ├── ai-engine/              # Validated intents, grounded answers, and Copilot logic
│   └── research-engine/        # Python terrain, ephemeris, descent, and planning engine
├── assets/                     # NASA asset registry and provenance metadata
├── tools/
│   ├── asset-pipeline/         # Download, derive, inspect, and manifest tools
│   └── e2e/                    # Headless browser verification scripts
├── docs/screenshots/            # Verification and product screenshots
└── package.json                 # Workspace scripts and project configuration
```

## Quick Start

### Prerequisites

- Node.js **20 or newer**
- npm
- Python 3
- Python packages for research and asset workflows: `numpy`, `Pillow`, and `scikit-learn`
- Playwright and Chromium for optional browser-based verification

### Install

```bash
npm install
```

### Start the development environment

Run the web app, API, and Python research service together:

```bash
npm run dev
```

Services:

- Web application: `http://localhost:5173`
- Fastify API: `http://localhost:8787`
- Research engine: `http://localhost:8790`

You can also run services independently:

```bash
npm run dev:web
npm run dev:api
npm run dev:research
```

### Optional AI provider

The deterministic rule provider is enabled by default. To enable an OpenAI-compatible chat-completions provider:

```bash
AI_API_KEY=your-key \
AI_BASE_URL=https://api.openai.com/v1 \
AI_MODEL=gpt-4o-mini \
npm run dev:api
```

The AI engine validates model-generated intents against the application schema and catalogue IDs before they can affect the scene.

## Useful Commands

```bash
npm run build             # Build the AI engine, API, and web application
npm run typecheck         # Type-check all TypeScript packages
npm run test:ai           # Run AI-engine self-tests
npm run train:research   # Rebuild research features and outcome model
npm run check:ephemeris  # Compare computed geometry with JPL Horizons DE441
```

### Asset pipeline

Refresh and rebuild derived NASA assets and the asset manifest:

```bash
npm run assets:all
```

This pipeline downloads source assets, generates derived textures and tiles, and rebuilds the registry manifest. Each asset retains provenance metadata, including source URL, credit, license, encoding, and SHA-256 checksum.

### End-to-end verification

With the development server running:

```bash
node tools/e2e/sky.mjs
node tools/e2e/world-clock.mjs
```

Additional Earth orientation calibration:

```bash
python3 tools/asset-pipeline/calibrate-earth-glb.py --write
```

## Scientific and Visualization Data

The application intentionally separates scientific inputs from visual assets.

| Layer | Source / behaviour |
| --- | --- |
| Moon globe | NASA SVS CGI Moon Kit DEM and LROC colour data |
| Detailed terrain | Derived DEM tiles from NASA CGI Moon Kit data |
| Lunar imagery | LROC WAC global mosaic through NASA Solar System Treks WMTS |
| Earth | NASA Visible Earth Blue Marble, Black Marble, and cloud textures |
| Star sky | NASA SVS Deep Star Maps 2020 using Hipparcos, Tycho-2, and Gaia data |
| Landing-site analysis | LOLA-derived DEM sampling and terrain feature extraction |
| Mission catalogue | Public NASA/NSSDCA and LROC-referenced records |
| Ephemeris validation | JPL Horizons DE441 comparison tooling |

### Accuracy and limitations

The ephemeris implementation is intended for visual context, lighting, lunar phase, libration, and mission-scene orientation. It is **not a flight-navigation system** and should not be used as a substitute for SPICE or mission-grade trajectory data.

The research outcome model is exploratory. Its predictions are model outputs based on historical features and user-selected parameters, not official mission assessments or guarantees.

## World Clock and Real Sky

A single world clock drives the solar-system context and lunar environment:

- **Live mode** follows the current UTC time.
- **Fixed mode** supports mission dates, planned landing dates, and manual time control.
- **Mission-time mode** plays back a mission timeline using launch and event anchors.

The clock drives the Sun direction, Earth rotation, Moon phase, lunar illumination, sub-solar and sub-Earth points, camera framing, and HUD values. The environment is time-driven rather than hand-animated.

## Mission Journeys

Mission journeys reconstruct the route from launch site to lunar arrival using published mission anchors and modelled flight segments.

Each journey can include:

- Launch pad and vehicle information
- Transfer type and coast duration
- Translunar, lunar-orbit, descent, and landing phases
- Earth-centred parking or phasing loops
- Timeline controls and event seeking
- Fidelity labels describing whether data is reconstructed, projected, or user-planned

> Journey arcs represent scientific or engineering reconstructions between known anchors. They are not spacecraft telemetry.

## Research and Landing Planning

The Python research engine provides terrain and mission-planning services through the Fastify API. It supports:

- Historical lunar landing and impact-attempt catalogue
- Elevation, slope, aspect, roughness, relief, and horizon analysis
- Landing-site suitability grids
- Sun and Earth visibility calculations
- Landing-window estimation
- Lander and payload configuration presets
- Powered-descent simulation
- Exploratory outcome modelling
- End-to-end future landing plans

Run the research engine directly:

```bash
cd services/research-engine
python3 train.py
python3 server.py 8790
```

## AI Copilot

The AI engine is designed to **propose, not control**. It can return one of three response types:

- `intent` — a validated `SceneIntent` that the frontend can execute
- `answer` — a grounded response with fact rows and source citations
- `clarify` — a request for more information when nothing verifiable matches

The rule-based provider is always available. The optional LLM provider is constrained by schema validation, catalogue validation, and tool-based lookup so that unsupported missions, sites, and regions are rejected rather than fabricated.

## API Surface

The Fastify API exposes typed endpoints under `/api/v1`, including:

- `/health`
- `/missions`
- `/providers`
- `/spacecraft`
- `/landers`
- `/payloads`
- `/landing-sites`
- `/lunar/regions`
- `/lunar/terrain`
- `/lunar/imagery`
- `/timeline`
- `/search`
- `/sources`
- `/research/*`
- `/ai/*`
- `/journeys`

## Current Status

| Area | Status |
| --- | --- |
| React and 3D frontend foundation | Complete |
| NASA asset pipeline and registry | Complete |
| Earth and Moon rendering | Complete |
| Live, fixed, and mission world clock | Complete |
| Dynamic lunar terrain and imagery | Complete for current LOD pipeline |
| Fastify backend on JSON seed data | Complete |
| Dynamic spacecraft registry | Complete; unavailable models are represented honestly |
| Mission scenes and comparisons | Complete |
| Python research engine | Available and integrated through API proxy |
| AI Copilot | Available with deterministic provider; optional LLM provider supported |
| PostgreSQL/PostGIS ingestion | Planned |
| Mission-grade trajectory and SPICE integration | Planned |

## Data Provenance and Credits

This project uses and credits public NASA and scientific resources, including:

- NASA Scientific Visualization Studio
- NASA Visible Earth
- NASA Solar System Treks
- LROC / Arizona State University
- NASA NSSDCA
- JPL Horizons / DE441 validation data
- ESA Gaia / DPAC datasets used by the NASA SVS star map

Detailed source, credit, license, and checksum information is stored beside the relevant assets under `assets/`.

## Responsible Use

CLPS Lunar Mission Browser is an educational, exploratory, and visualization project. It combines authoritative public records with derived geometry, simplified physical models, and clearly labelled reconstructions. Always consult official mission documentation and mission-grade navigation products for operational or safety-critical decisions.

## License

A repository-wide license has not yet been selected. Individual assets may have separate NASA, agency, or provider-specific terms; review the metadata files in `assets/` before redistributing them.

## Author

Created and maintained by **Nilanjan Nayak**.

If you find an issue, have a data correction, or want to propose an enhancement, please open a GitHub issue with reproducible details and relevant source references.
