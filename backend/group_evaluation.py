"""Read-only held-out error analysis by locality/type/BHK.

This report proposes analysis-only locality aliases. It never changes the CSV,
MongoDB documents, saved production model, or prediction route.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.model_selection import train_test_split

from .model_evaluation import BASELINE_FEATURES, DATA_PATH, _frame, _metrics, _pipeline


ROOT = Path(__file__).resolve().parent.parent
REPORT_PATH = ROOT / "models" / "group_evaluation.json"
MIN_GROUP_TOTAL_ROWS = 20
MIN_GROUP_TEST_ROWS = 5


def _canonical_key(value: Any) -> str:
    text = str(value or "").lower().replace("dwaraka", "dwarka").replace("gurugram", "").replace("gurgaon", "")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def proposed_locality_mapping(values: list[Any]) -> dict[str, str]:
    """Return aliases for analysis only, preserving the original labels."""
    groups: dict[str, list[str]] = {}
    for value in values:
        label = str(value).strip()
        groups.setdefault(_canonical_key(label), []).append(label)
    mapping: dict[str, str] = {}
    for labels in groups.values():
        canonical = sorted(labels, key=lambda item: (len(item), item.lower()))[0]
        for label in sorted(set(labels)):
            if label != canonical:
                mapping[label] = canonical
    return mapping


def evaluate_groups() -> dict[str, Any]:
    df = pd.read_csv(DATA_PATH)
    target = pd.to_numeric(df["Price"], errors="raise")
    train_indices, test_indices = train_test_split(range(len(df)), test_size=0.2, random_state=42)
    model = _pipeline(BASELINE_FEATURES)
    features = _frame(df, BASELINE_FEATURES)
    model.fit(features.iloc[train_indices], target.iloc[train_indices])
    predicted = model.predict(features.iloc[test_indices])

    suspicious_mask = (
        df["Locality"].astype(str).eq("Sector 113")
        & df["Flat Type"].astype(str).eq("Apartment")
        & pd.to_numeric(df["Rate per sqft"], errors="coerce").isin([20000, 220000])
    )
    clean_train_indices = [index for index in train_indices if not bool(suspicious_mask.iloc[index])]
    clean_test_indices = [index for index in test_indices if not bool(suspicious_mask.iloc[index])]
    clean_test_positions = [position for position, index in enumerate(test_indices) if index in set(clean_test_indices)]
    sensitivity_baseline = _metrics(target.iloc[clean_test_indices], predicted[clean_test_positions])
    diagnostic_model = _pipeline(BASELINE_FEATURES)
    diagnostic_model.fit(features.iloc[clean_train_indices], target.iloc[clean_train_indices])
    diagnostic_predicted = diagnostic_model.predict(features.iloc[clean_test_indices])
    sector113_clean_positions = [position for position, index in enumerate(clean_test_indices) if str(df.iloc[index]["Locality"]) == "Sector 113"]
    sensitivity = {
        "excluded_records": int(suspicious_mask.sum()),
        "excluded_rule": "Locality == Sector 113, Flat Type == Apartment, Rate per sqft in {20000, 220000}",
        "training_rows_baseline": len(train_indices),
        "training_rows_diagnostic": len(clean_train_indices),
        "common_clean_test_rows": len(clean_test_indices),
        "baseline_all_records_on_common_test": sensitivity_baseline,
        "diagnostic_excluded_from_training": _metrics(target.iloc[clean_test_indices], diagnostic_predicted),
        "sector113_common_test_rows": len(sector113_clean_positions),
        "sector113_baseline": _metrics(target.iloc[[clean_test_indices[i] for i in sector113_clean_positions]], predicted[clean_test_positions][sector113_clean_positions]) if len(sector113_clean_positions) >= 2 else None,
        "sector113_diagnostic": _metrics(target.iloc[[clean_test_indices[i] for i in sector113_clean_positions]], diagnostic_predicted[sector113_clean_positions]) if len(sector113_clean_positions) >= 2 else None,
        "interpretation": "Diagnostic comparison only; excluding records does not prove they are incorrect and does not change production data or the active model.",
    }

    test = df.iloc[test_indices].copy()
    test["actual"] = target.iloc[test_indices].to_numpy()
    test["predicted"] = predicted
    test["absolute_error"] = (test["actual"] - test["predicted"]).abs()
    mapping = proposed_locality_mapping(df["Locality"].dropna().tolist())
    test["canonical_locality"] = test["Locality"].map(lambda value: mapping.get(str(value), str(value)))
    test["bhk"] = pd.to_numeric(test["BHK_Count"], errors="coerce").round().astype("Int64")

    group_columns = ["canonical_locality", "Flat Type", "bhk"]
    groups = []
    all_group_counts = (
        df.assign(canonical_locality=df["Locality"].map(lambda value: mapping.get(str(value), str(value))), bhk=pd.to_numeric(df["BHK_Count"], errors="coerce").round().astype("Int64"))
        .groupby(group_columns, dropna=False)
        .size()
        .reset_index(name="total_records")
    )
    test_grouped = test.groupby(group_columns, dropna=False)
    test_counts = test_grouped.size().reset_index(name="test_records")
    test_count_map = {
        (str(row["canonical_locality"]), str(row["Flat Type"]), None if pd.isna(row["bhk"]) else int(row["bhk"])): int(row["test_records"])
        for _, row in test_counts.iterrows()
    }
    for _, count_row in all_group_counts.iterrows():
        key = tuple(count_row[column] for column in group_columns)
        normalized_key = (str(key[0]), str(key[1]), None if pd.isna(key[2]) else int(key[2]))
        test_rows = test_count_map.get(normalized_key, 0)
        subset = test
        for column, value in zip(group_columns, key):
            subset = subset[subset[column].isna() if pd.isna(value) else subset[column].eq(value)]
        sufficient_for_metrics = int(count_row["total_records"]) >= MIN_GROUP_TOTAL_ROWS and test_rows >= MIN_GROUP_TEST_ROWS
        groups.append({
            "locality": str(key[0]),
            "property_type": str(key[1]),
            "bhk": None if pd.isna(key[2]) else int(key[2]),
            "total_records": int(count_row["total_records"]),
            "test_records": test_rows,
            "status": "sufficient for group metrics" if sufficient_for_metrics else "sparse; insufficient test evidence",
            "metrics": _metrics(subset["actual"], subset["predicted"]) if sufficient_for_metrics else None,
        })
    groups.sort(key=lambda row: (-row["total_records"], row["locality"], row["property_type"], row["bhk"] or 0))
    sufficient = [row for row in groups if row["status"] == "sufficient for group metrics"]
    poor = sorted(sufficient, key=lambda row: row["metrics"]["mae"], reverse=True)[:20]
    largest_error_records = []
    for group in poor[:5]:
        subset = test[
            test["canonical_locality"].eq(group["locality"])
            & test["Flat Type"].eq(group["property_type"])
            & (test["bhk"].isna() if group["bhk"] is None else test["bhk"].eq(group["bhk"]))
        ].sort_values("absolute_error", ascending=False).head(10)
        for _, row in subset.iterrows():
            largest_error_records.append({
                "group": {"locality": group["locality"], "property_type": group["property_type"], "bhk": group["bhk"]},
                "source_locality": str(row["Locality"]),
                "property_type": str(row["Flat Type"]),
                "bhk": None if pd.isna(row["bhk"]) else int(row["bhk"]),
                "area": float(row["Area"]),
                "price_per_sqft": float(row["Rate per sqft"]),
                "actual_price": float(row["actual"]),
                "predicted_price": float(row["predicted"]),
                "absolute_error": float(row["absolute_error"]),
            })
    raw_group_count = int(df.groupby(["Locality", "Flat Type", "BHK_Count"], dropna=False).ngroups)
    return {
        "methodology": {
            "dataset": str(DATA_PATH.relative_to(ROOT)),
            "rows": len(df),
            "split": "80/20 train/test",
            "random_state": 42,
            "features": BASELINE_FEATURES,
            "target": "Price",
            "preprocessing": "same ColumnTransformer, median numeric imputation, most-frequent categorical imputation, OneHotEncoder(handle_unknown=ignore)",
            "minimum_group_total_records": MIN_GROUP_TOTAL_ROWS,
            "minimum_group_test_records": MIN_GROUP_TEST_ROWS,
            "canonicalization": "analysis-only aliases; original locality labels and model inputs remain unchanged",
        },
        "overall": _metrics(test["actual"], test["predicted"]),
        "baseline_reference": "models/model_evaluation.json baseline metrics are the same 80/20 random-state-42 reference procedure",
        "proposed_locality_mapping": mapping,
        "normalization_effect": {
            "raw_group_count": raw_group_count,
            "canonical_group_count": len(groups),
            "groups_reduced_by": raw_group_count - len(groups),
            "note": "Canonical labels are used only for this report; source labels and model inputs are unchanged.",
        },
        "groups": groups,
        "sufficient_groups": len(sufficient),
        "poor_accuracy_groups": poor,
        "largest_error_records": largest_error_records,
        "sensitivity_experiment": sensitivity,
    }


if __name__ == "__main__":
    report = evaluate_groups()
    REPORT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"overall": report["overall"], "groups": len(report["groups"]), "sufficient_groups": report["sufficient_groups"], "poor_accuracy_groups": report["poor_accuracy_groups"]}, indent=2))
