"""Train and evaluate the MedAgentX Triage classifier.

Trains two lightweight models on the synthetic emergency transcript dataset:
  * category  (which department/specialisation the emergency belongs to)
  * urgency   (critical / high / moderate / low)

The trained pipeline is a TF-IDF + Linear SVM baseline that can be used to
cross-check the deterministic rule engine in
src/backend/src/agents/triageAgent.js.

Usage:
    python3 generate_dataset.py     # creates dataset/triage_samples.csv
    python3 train_triage.py
Outputs:
    results/triage_metrics.json
    ml_model/triage_category.joblib
    ml_model/triage_urgency.joblib
"""

import json
import os

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "dataset", "triage_samples.csv")
RESULTS_DIR = os.path.join(HERE, "..", "..", "results")
CATEGORY_MODEL = os.path.join(HERE, "triage_category.joblib")
URGENCY_MODEL = os.path.join(HERE, "triage_urgency.joblib")


def build_pipeline():
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("clf", LinearSVC(C=1.0)),
    ])


def train_target(df, target):
    X_train, X_test, y_train, y_test = train_test_split(
        df["text"], df[target], test_size=0.2, random_state=42, stratify=df[target]
    )
    model = build_pipeline()
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    acc = accuracy_score(y_test, pred)
    print(f"\n=== {target} (accuracy {acc:.3f}) ===")
    print(classification_report(y_test, pred, zero_division=0))
    labels = sorted(df[target].unique())
    cm = confusion_matrix(y_test, pred, labels=labels)
    return model, {
        "accuracy": round(float(acc), 4),
        "labels": labels,
        "confusion_matrix": cm.tolist(),
        "report": classification_report(y_test, pred, zero_division=0, output_dict=True),
    }


def main():
    if not os.path.exists(DATA):
        raise SystemExit("Run generate_dataset.py first to create the dataset.")
    os.makedirs(RESULTS_DIR, exist_ok=True)

    df = pd.read_csv(DATA)
    print(f"Loaded {len(df)} samples across {df['category'].nunique()} categories")

    cat_model, cat_metrics = train_target(df, "category")
    urg_model, urg_metrics = train_target(df, "urgency")

    joblib.dump(cat_model, CATEGORY_MODEL)
    joblib.dump(urg_model, URGENCY_MODEL)

    metrics = {
        "dataset_size": int(len(df)),
        "category": cat_metrics,
        "urgency": urg_metrics,
    }
    out = os.path.join(RESULTS_DIR, "triage_metrics.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nSaved models and metrics -> {out}")


if __name__ == "__main__":
    main()
