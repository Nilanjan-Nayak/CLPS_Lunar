"""Exploratory outcome model trained on the historical landing catalogue (n≈40).

Binary target: 'nominal' = landed upright and operated (outcome == success). Features mix terrain (from the
LOLA-derived DEM at the site), environment (|lat| → illumination) and programme factors (hazard avoidance,
crewed, commercial, era). Logistic regression with L2, class balancing and leave-one-out cross-validation.
The sample is tiny and historical — the output is an *exploratory* probability, never a mission-success prediction."""
from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.preprocessing import StandardScaler
from . import dem

HERE = Path(__file__).resolve().parents[1]
DATASET = HERE / "dataset" / "lunar_missions.json"
FEATURES = HERE / "dataset" / "features.json"
MODEL = HERE / "model" / "model.json"
FEATURE_NAMES = ["absLat", "slopeDeg", "roughnessM", "reliefM", "elevationKm", "hazardAvoidance", "crewed", "commercial", "era"]
TERRAIN_KEYS = ["absLat", "slopeDeg", "roughnessM", "reliefM", "elevationKm"]


def catalogue() -> list[dict]:
    return json.loads(DATASET.read_text())["missions"]


def year_of(m: dict) -> int:
    return int((m.get("eventDate") or m["launchDate"])[:4])


def feature_vector(lat: float, lon: float, terrain: dict, hazard: bool, crewed: bool, commercial: bool, year: int) -> list[float]:
    return [abs(lat), terrain["slopeDeg"], terrain["roughnessM"], terrain["reliefM"], terrain["elevationM"] / 1000.0,
            1.0 if hazard else 0.0, 1.0 if crewed else 0.0, 1.0 if commercial else 0.0, (year - 1966) / 10.0]


def build_features() -> list[dict]:
    rows = []
    for m in catalogue():
        if m["missionType"] == "impact" or not m.get("site"):
            continue
        s = m["site"]
        t = dem.terrain_features_regional(s["latitude"], s["longitude"])
        rows.append({
            "id": m["id"], "name": m["name"], "year": year_of(m), "outcome": m["outcome"], "failureCategory": m.get("failureCategory"),
            "latitude": s["latitude"], "longitude": s["longitude"], "precision": s["precision"], "terrain": t,
            "x": feature_vector(s["latitude"], s["longitude"], t, m["hazardAvoidance"], m["crewed"], m["commercial"], year_of(m)),
            "y": 1 if m["outcome"] == "success" else 0,
        })
    FEATURES.write_text(json.dumps({"featureNames": FEATURE_NAMES, "demSource": dem.source(), "rows": rows}, indent=1))
    return rows


def train() -> dict:
    rows = build_features()
    X = np.array([r["x"] for r in rows]); y = np.array([r["y"] for r in rows])
    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)
    clf = LogisticRegression(C=0.5, class_weight="balanced", max_iter=2000)
    loo_p = cross_val_predict(clf, Xs, y, cv=LeaveOneOut(), method="predict_proba")[:, 1]
    loo_pred = (loo_p >= 0.5).astype(int)
    tp = int(((loo_pred == 1) & (y == 1)).sum()); tn = int(((loo_pred == 0) & (y == 0)).sum())
    fp = int(((loo_pred == 1) & (y == 0)).sum()); fn = int(((loo_pred == 0) & (y == 1)).sum())
    acc = (tp + tn) / len(y)
    bal = 0.5 * (tp / max(tp + fn, 1) + tn / max(tn + fp, 1))
    brier = float(np.mean((loo_p - y) ** 2))
    clf.fit(Xs, y)
    coef = clf.coef_[0]
    model = {
        "version": 1, "trainedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "algorithm": "sklearn LogisticRegression(C=0.5, class_weight=balanced) on standardized features",
        "target": "nominal landing (outcome == success) vs partial/failure",
        "n": int(len(y)), "positives": int(y.sum()), "majorityBaselineAccuracy": round(float(max(y.mean(), 1 - y.mean())), 3),
        "featureNames": FEATURE_NAMES,
        "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
        "coef": coef.tolist(), "intercept": float(clf.intercept_[0]),
        "coefficientsStandardized": {n: round(float(c), 3) for n, c in zip(FEATURE_NAMES, coef)},
        "looCv": {"accuracy": round(acc, 3), "balancedAccuracy": round(bal, 3), "brier": round(brier, 3), "confusion": {"tp": tp, "tn": tn, "fp": fp, "fn": fn}},
        "demSource": dem.source(),
        "caveats": [
            "Exploratory model on ~40 historical attempts spanning 1965–2025; technology and programmes differ enormously.",
            "Terrain features are sampled from a 16 px/deg (≈1.9 km) LOLA-derived DEM, far coarser than landing-hazard scales (metres).",
            "Probabilities are not calibrated mission-success predictions; use the neighbour comparison and the physics budgets for engineering judgement.",
        ],
    }
    MODEL.parent.mkdir(exist_ok=True)
    MODEL.write_text(json.dumps(model, indent=1))
    return model


def load_model() -> dict:
    if not MODEL.exists():
        return train()
    return json.loads(MODEL.read_text())


def load_features() -> dict:
    if not FEATURES.exists():
        build_features()
    return json.loads(FEATURES.read_text())


def predict(x: list[float]) -> dict:
    m = load_model()
    z = [(v - mu) / sd for v, mu, sd in zip(x, m["scaler"]["mean"], m["scaler"]["scale"])]
    contrib = {n: round(zi * c, 3) for n, zi, c in zip(m["featureNames"], z, m["coef"])}
    logit = m["intercept"] + sum(contrib.values())
    p = 1.0 / (1.0 + math.exp(-logit))
    return {"pNominal": round(p, 3), "logit": round(logit, 3), "contributions": contrib, "modelVersion": m["version"], "looCv": m["looCv"], "n": m["n"]}


def neighbours(x: list[float], k: int = 5) -> list[dict]:
    """Nearest historical sites in standardized terrain-feature space (|lat|, slope, roughness, relief, elevation)."""
    f = load_features(); m = load_model()
    idx = [m["featureNames"].index(n) for n in TERRAIN_KEYS]
    mean = np.array(m["scaler"]["mean"])[idx]; scale = np.array(m["scaler"]["scale"])[idx]
    q = (np.array(x)[idx] - mean) / scale
    out = []
    for r in f["rows"]:
        v = (np.array(r["x"])[idx] - mean) / scale
        out.append((float(np.linalg.norm(v - q)), r))
    out.sort(key=lambda t: t[0])
    return [{"id": r["id"], "name": r["name"], "year": r["year"], "outcome": r["outcome"], "failureCategory": r["failureCategory"],
             "latitude": r["latitude"], "longitude": r["longitude"], "precision": r["precision"], "distance": round(d, 3),
             "terrain": {k: r["terrain"][k] for k in ("elevationM", "slopeDeg", "roughnessM", "reliefM", "maxSunElevationDeg")}} for d, r in out[:k]]
