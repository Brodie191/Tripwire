"""
Generates SHAP explanations for the trained XGBoost model.

Produces two artefacts (written to model/artifacts/):
    shap_summary.png     Beeswarm summary of global feature importance
    shap_values.npy      Per-row SHAP values for the test split (float32, shape [N, F])
    shap_columns.json    Feature names in column order (for the API to look up by index)

The SHAP values are what the /api/score route will serve back alongside each
prediction so the UI can render the per-transaction explanation bar chart
(spec §07).

Usage:
    python -m src.explain               # uses artifacts/model.ubj + data/processed/
    python -m src.explain --sample 5000 # faster: explain a random 5k-row sample
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
import xgboost as xgb

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def explain(sample_n: int | None = None) -> None:
    model_path = ARTIFACTS_DIR / "model.ubj"
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at {model_path} — run src.train first.")

    print("Loading model…")
    model = xgb.XGBClassifier()
    model.load_model(model_path)

    print("Loading test data…")
    test_df = pd.read_parquet(DATA_DIR / "processed" / "test.parquet")
    test_df.pop("is_fraud")

    if sample_n is not None:
        test_df = test_df.sample(min(sample_n, len(test_df)), random_state=42)
        print(f"Using {len(test_df):,}-row sample for SHAP.")

    print(f"Computing SHAP values for {len(test_df):,} rows…")
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(test_df)  # shape: [N, F]

    # Summary beeswarm plot
    fig, ax = plt.subplots(figsize=(9, 6))
    shap.summary_plot(shap_values, test_df, show=False, plot_size=None)
    plt.title("SHAP Feature Importance — Tripwire")
    plt.tight_layout()
    summary_path = ARTIFACTS_DIR / "shap_summary.png"
    plt.savefig(summary_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Saved summary plot → {summary_path}")

    # Persist raw SHAP values + column list for the API
    np.save(ARTIFACTS_DIR / "shap_values.npy", shap_values.astype("float32"))
    (ARTIFACTS_DIR / "shap_columns.json").write_text(json.dumps(test_df.columns.tolist(), indent=2))
    print(f"Saved shap_values.npy ({shap_values.shape}) + shap_columns.json")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=None,
                        help="Explain only this many random rows (faster for dev)")
    args = parser.parse_args()
    explain(sample_n=args.sample)


if __name__ == "__main__":
    main()
