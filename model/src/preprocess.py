"""
Cleans and engineers features from the raw Sparkov CSVs.

Known traps handled here:
- All merchant names carry a "fraud_" prefix in the synthetic data — stripped
  so the model can't trivially key on the string.
- Raw lat/long becomes cardholder-to-merchant Haversine distance (km), which
  is a causal signal; the raw coordinates are dropped.
- dob becomes age in years at transaction time.
- trans_date_trans_time is split into hour, day_of_week, month.
- PII columns (first, last, street) are dropped — they add no causal signal
  and would prevent generalisation.

Usage:
    python -m src.preprocess          # reads data/, writes data/processed/
    from src.preprocess import build  # returns (X_train, y_train, X_test, y_test)
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = DATA_DIR / "processed"

# Columns dropped before modelling
_DROP = [
    "Unnamed: 0",   # row index artefact
    "trans_num",    # unique identifier, not a feature
    "cc_num",       # high-cardinality identifier; velocity features would need a
                    # separate windowed aggregation pass — out of scope for P1
    "first", "last", "street",  # PII, no causal signal
    "trans_date_trans_time",    # consumed into hour/dow/month
    "unix_time",                # duplicate of trans_date_trans_time
    "dob",                      # consumed into age
    "lat", "long",              # consumed into distance_km
    "merch_lat", "merch_long",  # consumed into distance_km
    "merchant",                 # consumed into merchant_clean then label-encoded
]

_CATEGORICAL = ["merchant_clean", "category", "gender", "city", "state", "zip", "job"]


def _haversine_km(lat1: pd.Series, lon1: pd.Series, lat2: pd.Series, lon2: pd.Series) -> pd.Series:
    R = 6_371.0
    lat1, lon1, lat2, lon2 = (np.radians(s) for s in (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return pd.Series(R * 2 * np.arcsin(np.sqrt(a)), index=lat1.index)


def _engineer(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Strip the decorative "fraud_" prefix present on every Sparkov merchant name.
    df["merchant_clean"] = df["merchant"].str.removeprefix("fraud_")

    # Cardholder-to-merchant distance (km)
    df["distance_km"] = _haversine_km(df["lat"], df["long"], df["merch_lat"], df["merch_long"])

    # Cardholder age at time of transaction
    trans_dt = pd.to_datetime(df["trans_date_trans_time"])
    dob_dt = pd.to_datetime(df["dob"])
    df["age"] = ((trans_dt - dob_dt).dt.days / 365.25).astype("float32")

    # Time-of-day / calendar features
    df["hour"] = trans_dt.dt.hour.astype("int8")
    df["day_of_week"] = trans_dt.dt.dayofweek.astype("int8")
    df["month"] = trans_dt.dt.month.astype("int8")

    return df.drop(columns=[c for c in _DROP if c in df.columns])


def _label_encode_categoricals(
    train: pd.DataFrame,
    test: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Label-encode categorical columns using the train vocabulary.
    Unseen values in test receive -1.
    """
    for col in _CATEGORICAL:
        if col not in train.columns:
            continue
        vocab = {v: i for i, v in enumerate(train[col].astype(str).unique())}
        train[col] = train[col].astype(str).map(vocab).astype("int32")
        test[col] = test[col].astype(str).map(vocab).fillna(-1).astype("int32")
    return train, test


def build(
    train_csv: Path = DATA_DIR / "fraudTrain.csv",
    test_csv: Path = DATA_DIR / "fraudTest.csv",
) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
    train_raw = pd.read_csv(train_csv)
    test_raw = pd.read_csv(test_csv)

    train = _engineer(train_raw)
    test = _engineer(test_raw)

    train, test = _label_encode_categoricals(train, test)

    y_train = train.pop("is_fraud")
    y_test = test.pop("is_fraud")

    return train, y_train, test, y_test


def export_vocab(
    train_csv: Path = DATA_DIR / "fraudTrain.csv",
    out_path: Path | None = None,
) -> dict[str, dict[str, int]]:
    """
    Build the label-encoding vocabulary from the training split and optionally
    persist it so the serving container can encode incoming transactions
    identically to training.  Unseen values map to -1 at serve time.
    """
    train_raw = pd.read_csv(train_csv)
    train = _engineer(train_raw)
    vocab: dict[str, dict[str, int]] = {}
    for col in _CATEGORICAL:
        if col in train.columns:
            vocab[col] = {v: i for i, v in enumerate(train[col].astype(str).unique())}
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(vocab))
    return vocab


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    X_train, y_train, X_test, y_test = build()

    print(f"Train: {X_train.shape}  |  fraud: {y_train.mean():.4%}")
    print(f"Test:  {X_test.shape}   |  fraud: {y_test.mean():.4%}")
    print(f"\nFeatures: {X_train.columns.tolist()}")

    X_train.assign(is_fraud=y_train).to_parquet(OUT_DIR / "train.parquet", index=False)
    X_test.assign(is_fraud=y_test).to_parquet(OUT_DIR / "test.parquet", index=False)
    print(f"\nWrote parquets to {OUT_DIR}")


if __name__ == "__main__":
    main()
