# research-engine (Python)

Scientific/derived-data service of the CLPS Lunar Mission Browser — kept separate from the NASA visual asset system.

* `dataset/lunar_missions.json` — 47 historical lunar impact / landing attempts (1959–2025) with coordinates, outcome,
  failure category and source ids (NSSDCA primary, LROC-located sites, secondary compilations flagged `approx`).
* `engine/dem.py` — global LOLA-derived DEM sampling (SVS CGI Moon Kit `ldem_16_uint`, re-downloaded on demand; LOD0 fallback).
* `engine/model.py` — terrain features for every historical site → exploratory logistic-regression outcome model
  (leave-one-out CV reported honestly) + nearest historical neighbours.
* `engine/descent.py` — 2-D powered-descent simulation (central gravity, closed-loop E-guidance, throttle limits).
* `engine/mission.py` — mission calculation: phases/timeline, Δv & propellant chain, payload capacity, comms.
* `server.py` — stdlib HTTP service on :8790, proxied by the Fastify API under `/api/v1/research/*`.

```bash
python3 train.py          # rebuild dataset/features.json + model/model.json
python3 server.py 8790    # run (auto-trains if the model file is missing)
```
Dependencies: numpy, Pillow, scikit-learn (system packages; no venv needed).
