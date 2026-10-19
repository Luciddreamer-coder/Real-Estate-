"""Reproducible held-out evaluation for the property price models.

This module deliberately trains fresh models on the training portion of the
CSV.  The supplied joblib model was trained outside this repository, so its
training split cannot be proven from the artifact alone.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import TransformedTargetRegressor


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "gurugram_real_estate_final.csv"
METRICS_PATH = ROOT / "models" / "model_evaluation.json"
REDUCED_MODEL_PATH = ROOT / "models" / "gurugram_price_model_without_context.joblib"
SUSPICIOUS_PATH = ROOT / "models" / "suspicious_rate_records.csv"
SECTOR42_PATH = ROOT / "models" / "sector42_review.csv"

BASELINE_FEATURES = [
    "Area",
    "BHK_Model",
    "Locality",
    "Status",
    "RERA Approval",
    "Model_Flat_Type",
    "Society",
    "Builder Name",
]
REDUCED_FEATURES = BASELINE_FEATURES[:6]
NUMERIC_FEATURES = ["Area", "BHK_Model"]
CATEGORICAL_FEATURES = ["Locality", "Status", "RERA Approval", "Model_Flat_Type"]


def _frame(df: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    source = {
        "Area": df["Area"],
        "BHK_Model": df["BHK_Count"],
        "Locality": df["Locality"],
        "Status": df["Status"],
        "RERA Approval": df["RERA Approval"],
        "Model_Flat_Type": df["Flat Type"],
        "Society": df["Society"],
        "Builder Name": df["Builder Name"],
    }
    return pd.DataFrame({feature: source[feature] for feature in features}, columns=features)


def _pipeline(features: list[str]) -> Pipeline:
    categorical = [feature for feature in features if feature not in NUMERIC_FEATURES]
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), NUMERIC_FEATURES),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical,
            ),
        ]
    )
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("regressor", RandomForestRegressor(min_samples_leaf=2, n_jobs=-1, random_state=42)),
        ]
    )


def _metrics(actual: pd.Series, predicted: Any) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted) ** 0.5),
        "r2": float(r2_score(actual, predicted)),
    }


def evaluate_and_write() -> dict[str, Any]:
    df = pd.read_csv(DATA_PATH)
    target = pd.to_numeric(df["Price"], errors="raise")
    area = pd.to_numeric(df["Area"], errors="raise")
    rate = pd.to_numeric(df["Rate per sqft"], errors="raise")
    expected_price = area * rate
    relative_difference = (target - expected_price).abs() / expected_price
    suspicious = df.loc[relative_difference > 0.10].copy()
    suspicious.insert(0, "source_row", suspicious.index + 2)
    suspicious.insert(1, "expected_price_from_area_rate", expected_price.loc[suspicious.index])
    suspicious.insert(2, "relative_difference", relative_difference.loc[suspicious.index])
    suspicious.insert(3, "review_priority", suspicious["relative_difference"].map(lambda value: "high" if value > 0.25 else "review"))
    suspicious.to_csv(SUSPICIOUS_PATH, index=False)
    sector42 = df[df["Locality"].eq("Sector 42")].copy()
    sector42.insert(0, "review_category", sector42["Price"].map(lambda value: "luxury" if value > 100_000_000 else "typical_or_mid_range"))
    sector42.sort_values("Price", ascending=False).to_csv(SECTOR42_PATH, index=False)
    def mode_value(series: pd.Series, default: str) -> str:
        values = series.dropna().astype(str).str.strip()
        values = values[values != ""]
        modes = values.mode()
        return str(modes.iloc[0]) if len(modes) else default

    global_society = mode_value(df["Society"], "Unknown")
    global_builder = mode_value(df["Builder Name"], "Unknown")
    locality_fallbacks = {
        str(locality): {
            "Society": mode_value(group["Society"], global_society),
            "Builder Name": mode_value(group["Builder Name"], global_builder),
        }
        for locality, group in df.groupby("Locality", dropna=False)
        if pd.notna(locality)
    }
    coverage_rows = df.dropna(subset=["Locality", "Flat Type", "BHK_Count"]).copy()
    coverage_rows["BHK_Model"] = coverage_rows["BHK_Count"].round().astype(int)
    coverage = {
        f"{locality}|{flat_type}|{bhk}": {
            "locality": str(locality),
            "property_type": str(flat_type),
            "bhk": int(bhk),
            "min_area": float(group["Area"].min()),
            "max_area": float(group["Area"].max()),
            "records": int(len(group)),
        }
        for (locality, flat_type, bhk), group in coverage_rows.groupby(["Locality", "Flat Type", "BHK_Model"])
    }
    comparable_fallbacks = {
        f"{locality}|{flat_type}|{bhk}": {
            "Society": mode_value(group["Society"], global_society),
            "Builder Name": mode_value(group["Builder Name"], global_builder),
            "records": int(len(group)),
        }
        for (locality, flat_type, bhk), group in coverage_rows.groupby(["Locality", "Flat Type", "BHK_Model"])
    }
    indices = range(len(df))
    train_indices, test_indices = train_test_split(indices, test_size=0.2, random_state=42)
    results: dict[str, Any] = {
        "dataset": {
            "path": str(DATA_PATH.relative_to(ROOT)),
            "rows": int(len(df)),
            "test_size": 0.2,
            "random_state": 42,
        },
        "warning": "These are valid held-out scores for freshly trained reference models. The supplied joblib model's original split is unavailable.",
        "data_quality": {
            "rate_records_over_10_percent": int((relative_difference > 0.10).sum()),
            "rate_records_over_25_percent": int((relative_difference > 0.25).sum()),
            "suspicious_records_report": str(SUSPICIOUS_PATH.relative_to(ROOT)),
            "sector42_review_report": str(SECTOR42_PATH.relative_to(ROOT)),
            "action": "Review source values before correcting, excluding, or retaining records. No records were changed.",
        },
        "fallbacks": {
            "strategy": "most_frequent_nonempty_value_by_locality",
            "global": {"Society": global_society, "Builder Name": global_builder},
            "by_locality": locality_fallbacks,
            "by_comparable_group": comparable_fallbacks,
        },
        "coverage": coverage,
        "models": {},
    }

    evaluated_predictions: dict[str, tuple[pd.Series, Any]] = {}
    for name, features in (("baseline", BASELINE_FEATURES), ("without_context", REDUCED_FEATURES)):
        X = _frame(df, features)
        model = _pipeline(features)
        model.fit(X.iloc[train_indices], target.iloc[train_indices])
        predictions = model.predict(X.iloc[test_indices])
        results["models"][name] = {
            "name": "Random Forest Regressor",
            "features": features,
            "metrics": _metrics(target.iloc[test_indices], predictions),
            "training_rows": len(train_indices),
            "test_rows": len(test_indices),
        }
        if name == "without_context":
            joblib.dump(model, REDUCED_MODEL_PATH)
        evaluated_predictions[name] = (df.iloc[test_indices]["Locality"].reset_index(drop=True), predictions)

    log_model = TransformedTargetRegressor(
        regressor=_pipeline(BASELINE_FEATURES),
        func=np.log1p,
        inverse_func=np.expm1,
    )
    baseline_x = _frame(df, BASELINE_FEATURES)
    log_model.fit(baseline_x.iloc[train_indices], target.iloc[train_indices])
    log_predictions = log_model.predict(baseline_x.iloc[test_indices])
    results["models"]["log_price"] = {
        "name": "Random Forest Regressor (log price)",
        "features": BASELINE_FEATURES,
        "metrics": _metrics(target.iloc[test_indices], log_predictions),
        "training_rows": len(train_indices),
        "test_rows": len(test_indices),
    }
    evaluated_predictions["log_price"] = (df.iloc[test_indices]["Locality"].reset_index(drop=True), log_predictions)

    locality_errors: dict[str, dict[str, dict[str, float]]] = {}
    for name, (localities, predictions) in evaluated_predictions.items():
        error_frame = pd.DataFrame({"Locality": localities, "actual": target.iloc[test_indices].reset_index(drop=True), "predicted": predictions})
        error_frame["absolute_error"] = (error_frame["actual"] - error_frame["predicted"]).abs()
        locality_errors[name] = {
            str(locality): {
                "records": int(group.shape[0]),
                "mae": float(group["absolute_error"].mean()),
                "actual_median": float(group["actual"].median()),
                "predicted_median": float(group["predicted"].median()),
            }
            for locality, group in error_frame.groupby("Locality")
        }
    results["locality_errors"] = locality_errors

    METRICS_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


if __name__ == "__main__":
    print(json.dumps(evaluate_and_write(), indent=2))
