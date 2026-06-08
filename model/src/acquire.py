"""
Acquires the Sparkov-generated Credit Card Transactions Fraud Detection
dataset (Kaggle `kartik2112/fraud-detection`, CC0 — spec §04 "Why this
dataset"). kagglehub handles authentication via ~/.kaggle/kaggle.json or
the KAGGLE_USERNAME / KAGGLE_KEY environment variables; see
https://github.com/Kaggle/kagglehub#authenticate for setup.

Run from model/: python -m src.acquire
"""

import shutil
from pathlib import Path

import kagglehub

DATASET = "kartik2112/fraud-detection"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def main() -> None:
    print(f"Downloading {DATASET} via kagglehub…")
    cache_path = Path(kagglehub.dataset_download(DATASET))
    print(f"Cached at {cache_path}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    csvs = sorted(cache_path.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(f"No CSVs found in {cache_path} — dataset layout may have changed.")

    for csv in csvs:
        destination = DATA_DIR / csv.name
        shutil.copy2(csv, destination)
        print(f"Copied {csv.name} -> {destination}")


if __name__ == "__main__":
    main()
