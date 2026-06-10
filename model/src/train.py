"""
Trains an XGBoost classifier on the preprocessed Sparkov data, evaluates on
PR-AUC (spec §05: "never accuracy"), picks an operating threshold from the
precision-recall curve, and exports the model + threshold for serving.

Experiment tracking via Weights & Biases (spec §03). Set WANDB_MODE=disabled
to run offline.

Usage:
    python -m src.train [--no-wandb]

Outputs (written to model/artifacts/):
    model.ubj          XGBoost model in binary format
    threshold.json     {"threshold": float, "precision": float, "recall": float}
    pr_curve.png       precision-recall curve plot
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, precision_recall_curve

from src.preprocess import build, export_vocab

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# XGBoost hyperparameters — sensible starting point; tune via W&B sweeps later.
_XGB_PARAMS: dict = {
    "objective": "binary:logistic",
    "eval_metric": "aucpr",
    "n_estimators": 500,
    "learning_rate": 0.05,
    "max_depth": 6,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 10,
    "tree_method": "hist",   # fast histogram method; GPU-ready via device="cuda"
    "random_state": 42,
    "n_jobs": -1,
}


def _pick_threshold(
    precision: np.ndarray,
    recall: np.ndarray,
    thresholds: np.ndarray,
    min_precision: float = 0.70,
) -> tuple[float, float, float]:
    """
    Select the highest-recall threshold that still achieves min_precision.
    min_precision=0.70 is a product default (spec §05): flag fewer transactions
    but be confident when you do. Callers can lower this for higher recall.
    """
    mask = precision[:-1] >= min_precision
    if not mask.any():
        # Nothing meets the bar — fall back to F1-maximising threshold.
        f1 = 2 * precision[:-1] * recall[:-1] / (precision[:-1] + recall[:-1] + 1e-9)
        idx = int(np.argmax(f1))
    else:
        idx = int(np.where(mask)[0][np.argmax(recall[:-1][mask])])
    return float(thresholds[idx]), float(precision[idx]), float(recall[idx])


def train(use_wandb: bool = True) -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading preprocessed data…")
    processed = DATA_DIR / "processed"
    if (processed / "train.parquet").exists():
        train_df = pd.read_parquet(processed / "train.parquet")
        test_df = pd.read_parquet(processed / "test.parquet")
        y_train = train_df.pop("is_fraud")
        y_test = test_df.pop("is_fraud")
        X_train, X_test = train_df, test_df
    else:
        X_train, y_train, X_test, y_test = build()

    # XGBoost handles imbalance via scale_pos_weight = neg / pos
    neg, pos = int((y_train == 0).sum()), int((y_train == 1).sum())
    scale_pos_weight = neg / pos
    print(f"Class ratio  neg={neg:,}  pos={pos:,}  scale_pos_weight={scale_pos_weight:.1f}")

    params = {**_XGB_PARAMS, "scale_pos_weight": scale_pos_weight}

    if use_wandb:
        try:
            import wandb
            run = wandb.init(project="tripwire", config=params, job_type="train")
        except Exception:
            use_wandb = False
            print("W&B init failed — continuing without tracking.")

    print(f"Training XGBoost  n_estimators={params['n_estimators']}…")
    model = xgb.XGBClassifier(**params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    print("Evaluating…")
    y_prob = model.predict_proba(X_test)[:, 1]
    pr_auc = average_precision_score(y_test, y_prob)
    print(f"PR-AUC: {pr_auc:.4f}")

    precision, recall, thresholds = precision_recall_curve(y_test, y_prob)
    threshold, thr_prec, thr_rec = _pick_threshold(precision, recall, thresholds)
    print(f"Threshold: {threshold:.4f}  precision={thr_prec:.3f}  recall={thr_rec:.3f}")

    # PR curve plot
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(recall, precision, lw=1.5, label=f"PR-AUC = {pr_auc:.3f}")
    ax.scatter([thr_rec], [thr_prec], color="red", zorder=5,
               label=f"threshold={threshold:.3f}  P={thr_prec:.2f}  R={thr_rec:.2f}")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-Recall Curve — Tripwire")
    ax.legend()
    ax.grid(alpha=0.3)
    plot_path = ARTIFACTS_DIR / "pr_curve.png"
    fig.savefig(plot_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved PR curve → {plot_path}")

    # Persist model
    model_path = ARTIFACTS_DIR / "model.ubj"
    model.save_model(model_path)
    print(f"Saved model     → {model_path}")

    # Persist threshold
    meta = {"threshold": threshold, "precision": thr_prec, "recall": thr_rec, "pr_auc": pr_auc}
    threshold_path = ARTIFACTS_DIR / "threshold.json"
    threshold_path.write_text(json.dumps(meta, indent=2))
    print(f"Saved threshold → {threshold_path}")

    # Persist label-encoding vocabulary (needed by the serving container)
    vocab_path = ARTIFACTS_DIR / "vocab.json"
    export_vocab(out_path=vocab_path)
    print(f"Saved vocab     → {vocab_path}")

    if use_wandb:
        wandb.log({"pr_auc": pr_auc, "threshold": threshold,
                   "precision_at_threshold": thr_prec, "recall_at_threshold": thr_rec})
        wandb.log({"pr_curve": wandb.Image(str(plot_path))})
        wandb.save(str(model_path))
        wandb.finish()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-wandb", action="store_true")
    args = parser.parse_args()
    train(use_wandb=not args.no_wandb)


if __name__ == "__main__":
    main()
