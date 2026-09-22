# Triage ML model (baseline)

This folder contains an optional, self-contained machine-learning baseline for
the **Triage Agent**. It is a guardrail/validation layer, not the primary
decision path — the production triage logic is the deterministic, explainable
rule engine in `src/backend/src/agents/triageAgent.js`, optionally augmented by
Amazon Bedrock/LLM.

## Contents

| File                       | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `generate_dataset.py`      | Builds a synthetic emergency-transcript dataset (no real data) |
| `train_triage.py`          | Trains TF-IDF + LinearSVC classifiers, writes metrics          |
| `dataset/triage_samples.csv` | Generated dataset (symptom text → category, urgency)         |
| `triage_category.joblib`   | Trained category model (generated, not committed)              |
| `triage_urgency.joblib`    | Trained urgency model (generated, not committed)               |

## Run

```bash
cd src/ml_model
python3 -m pip install scikit-learn pandas joblib
python3 generate_dataset.py
python3 train_triage.py
```

Metrics are written to `results/triage_metrics.json`.

## Notes

- The dataset is **synthetic** and built from the same keyword families as the
  rule engine, so the baseline separates classes almost perfectly. It exists to
  demonstrate the ML pipeline and to provide a cross-check mechanism; it is not
  a claim of clinical accuracy.
- No real patient data is used anywhere in this project.
- To use the model at inference time, load the joblib pipeline and call
  `.predict([transcript])`; the rule engine remains the safe default when the
  model confidence is low or the model is unavailable.
