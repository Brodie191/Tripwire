"""
Tripwire — Modal scale-to-zero inference endpoint  (spec §05 "Serving").

Accepts a single raw transaction, runs the same preprocessing pipeline used
during training, scores it with the exported XGBoost model, computes per-row
SHAP values, and returns:

    {
      "probability": 0.923,
      "is_fraud": true,
      "threshold": 0.851,
      "contributions": [
        {"feature": "amt",         "shap_value": 0.41, "raw_value": 1234.56},
        {"feature": "distance_km", "shap_value": 0.18, "raw_value": 832.1},
        ...
      ]
    }

The contributions list is sorted descending by |shap_value| so the UI can
render the top-N explanation bar without any further processing.

Deploy:
    modal deploy model/serve/app.py

Smoke-test (runs inside Modal's sandbox):
    modal run model/serve/app.py::smoke

Environment variables expected at deploy time:
    TRIPWIRE_API_KEY   shared secret the Next.js backend sends as
                       X-Tripwire-Key; rejects all other callers.
                       Set via: modal secret create tripwire-secrets TRIPWIRE_API_KEY=<value>
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import modal
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Container image — pin versions to match training; artifacts baked in at
# deploy time via add_local_dir so the model is always warm on cold start.
# ---------------------------------------------------------------------------
_ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "xgboost==3.2.0",
        "shap==0.52.0",   # 0.46 can't parse XGBoost 3.x base_score format '[5E-1]'
        "pandas==3.0.3",
        "numpy==2.4.6",
        "scikit-learn",
        "fastapi[standard]",
    )
    .add_local_dir(_ARTIFACTS_DIR, remote_path="/artifacts")
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = modal.App("tripwire-scorer", image=image)

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class TransactionIn(BaseModel):
    trans_date_trans_time: str   # "2019-06-21 12:13:00"
    merchant: str                # raw, e.g. "fraud_Robel-Mayert" — prefix stripped server-side
    category: str
    amt: float
    gender: str
    city: str
    state: str
    zip: int
    lat: float
    long: float                  # cardholder longitude
    city_pop: int
    job: str
    dob: str                     # "1968-03-19"
    merch_lat: float
    merch_long: float


class Contribution(BaseModel):
    feature: str
    shap_value: float
    raw_value: float | str | int


class ScoreOut(BaseModel):
    probability: float
    is_fraud: bool
    threshold: float
    contributions: list[Contribution]


# ---------------------------------------------------------------------------
# Preprocessing helpers — inlined so the container needs no external imports
# ---------------------------------------------------------------------------

_CATEGORICAL = ["merchant_clean", "category", "gender", "city", "state", "zip", "job"]

# Column order must exactly match what the model was trained on (from preprocess.py).
_FEATURE_COLS = [
    "category", "amt", "gender", "city", "state", "zip",
    "city_pop", "job", "merchant_clean", "distance_km",
    "age", "hour", "day_of_week", "month",
]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    R = 6_371.0
    lat1, lon1, lat2, lon2 = (math.radians(x) for x in (lat1, lon1, lat2, lon2))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _to_row(tx: TransactionIn, vocab: dict[str, dict[str, int]]) -> "pd.DataFrame":
    import pandas as pd

    trans_dt = pd.to_datetime(tx.trans_date_trans_time)
    dob_dt = pd.to_datetime(tx.dob)
    age = (trans_dt - dob_dt).days / 365.25

    raw: dict[str, Any] = {
        "category": tx.category,
        "amt": tx.amt,
        "gender": tx.gender,
        "city": tx.city,
        "state": tx.state,
        "zip": tx.zip,
        "city_pop": tx.city_pop,
        "job": tx.job,
        "merchant_clean": tx.merchant.removeprefix("fraud_"),
        "distance_km": _haversine_km(tx.lat, tx.long, tx.merch_lat, tx.merch_long),
        "age": float(age),
        "hour": trans_dt.hour,
        "day_of_week": trans_dt.dayofweek,
        "month": trans_dt.month,
    }

    df = pd.DataFrame([raw])

    for col in _CATEGORICAL:
        if col in df.columns:
            mapping = vocab.get(col, {})
            df[col] = df[col].astype(str).map(mapping).fillna(-1).astype("int32")

    return df[_FEATURE_COLS]


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------

@app.cls(
    scaledown_window=300,        # scale to zero after 5 min idle
    # Add secrets=[modal.Secret.from_name("tripwire-secrets")] once you run:
    #   modal secret create tripwire-secrets TRIPWIRE_API_KEY=<your-key>
)
class Scorer:

    @modal.enter()
    def load(self) -> None:
        import os
        import xgboost as xgb
        import shap

        self.model = xgb.XGBClassifier()
        self.model.load_model("/artifacts/model.ubj")

        threshold_meta = json.loads(Path("/artifacts/threshold.json").read_text())
        self.threshold = threshold_meta["threshold"]

        self.vocab: dict[str, dict[str, int]] = json.loads(
            Path("/artifacts/vocab.json").read_text()
        )

        self.explainer = shap.TreeExplainer(self.model)
        self._api_key = os.environ.get("TRIPWIRE_API_KEY", "")

    @modal.fastapi_endpoint(method="POST", docs=True)
    def score(self, body: TransactionIn, x_tripwire_key: str = "") -> ScoreOut:
        if self._api_key and x_tripwire_key != self._api_key:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Unauthorized")

        row = _to_row(body, self.vocab)
        prob = float(self.model.predict_proba(row)[0, 1])
        shap_vals = self.explainer.shap_values(row)[0]

        contributions = sorted(
            [
                Contribution(
                    feature=col,
                    shap_value=round(float(shap_vals[i]), 6),
                    raw_value=row.iloc[0][col],
                )
                for i, col in enumerate(_FEATURE_COLS)
            ],
            key=lambda c: abs(c.shap_value),
            reverse=True,
        )

        return ScoreOut(
            probability=round(prob, 6),
            is_fraud=prob >= self.threshold,
            threshold=self.threshold,
            contributions=contributions,
        )


# ---------------------------------------------------------------------------
# Local smoke test  —  modal run model/serve/app.py
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def smoke() -> None:
    import httpx

    # @fastapi_endpoint methods are HTTP endpoints — call them via httpx.
    # The dev URL is printed during `modal run`; for a deployed app it's stable.
    # Dev URL follows the deterministic pattern: {user}--{app}-{cls}-{method}-dev.modal.run
    url = "https://brodie191--tripwire-scorer-scorer-score-dev.modal.run"
    print(f"Endpoint: {url}")

    payload = {
        "trans_date_trans_time": "2019-06-21 23:47:00",
        "merchant": "fraud_Robel-Mayert",
        "category": "misc_net",
        "amt": 2389.0,
        "gender": "M",
        "city": "Birmingham",
        "state": "AL",
        "zip": 35209,
        "lat": 33.5186,
        "long": -86.8104,
        "city_pop": 212237,
        "job": "Software engineer",
        "dob": "1980-05-14",
        "merch_lat": 34.21,
        "merch_long": -118.49,
    }

    resp = httpx.post(url, json=payload, timeout=120)
    resp.raise_for_status()
    print(json.dumps(resp.json(), indent=2))
