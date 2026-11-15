# research-engine (Python)

Scientific/derived-data service of SELENARA X — kept separate from the NASA visual asset system.

* `dataset/lunar_missions.json` — 47 historical lunar impact / landing attempts (1959–2025) with coordinates, outcome,
  failure category and source ids (NSSDCA primary, LROC-located sites, secondary compilations flagged `approx`).
* `dataset/challenge_sites.json` — rounded quick-comparison reference points served via `/options`; mission data and spacecraft records remain in backend catalogues, not React components.
* `engine/dem.py` — global LOLA-derived DEM sampling (SVS CGI Moon Kit `ldem_16_uint`, re-downloaded on demand; LOD0 fallback).
* `engine/model.py` — terrain features for every historical site → exploratory logistic-regression outcome model
  (leave-one-out CV reported honestly) + nearest historical neighbours.
* `engine/descent.py` — 2-D powered-descent simulation (central gravity, closed-loop E-guidance, throttle limits).
* `engine/horizons.py` — opt-in JPL Horizons Sun/Earth observer tables, compared with the local model and masked by the selected site's LOLA terrain horizon. Six-hour samples, interpolated crossings, centre-of-body only; the automatic plan continues to use the offline analytical ephemeris.
* `engine/mission.py` — mission calculation: phases/timeline, Δv & propellant chain, payload capacity, comms.
* `server.py` — stdlib HTTP service on :8790, proxied by the Fastify API under `/api/v1/research/*`.

```bash
python3 train.py          # rebuild dataset/features.json + model/model.json
python3 server.py 8790    # run (auto-trains if the model file is missing)
python3 -m unittest test_horizons test_dem_sources -v  # offline parser, validation and terrain-provenance tests
```
`GET /api/v1/research/horizons?lat=-84.79&lon=29.2&utc=2026-09-28T12%3A00%3A00Z&days=14` requests two NASA/JPL tables, with one-hour caching. Comparisons use whole days from 1 to 45; longer or fractional missions disclose the different checked interval in the interface. It returns 503 without fabricated data if JPL cannot be reached. The horizon resolution, observer height, retrieval time and sampling limitations are included in the response. Where polar horizon rays or grid cells extend beyond the polar product coverage, they continue on the coarser global LOLA-derived grid and are labelled as mixed-resolution; the fallback's actual resolution is reported.
Dependencies: numpy, Pillow, scikit-learn (system packages; no venv needed).
