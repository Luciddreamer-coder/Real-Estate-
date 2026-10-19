from __future__ import annotations

from functools import lru_cache
import json
from typing import Any

import joblib
import pandas as pd

from .config import MODEL_PATH, PREDICTION_GOOD_COVERAGE_MIN_RECORDS


FALLBACK_PATH = MODEL_PATH.parent / "model_evaluation.json"


MODEL_FEATURES = [
    "Area",
    "BHK_Model",
    "Locality",
    "Status",
    "RERA Approval",
    "Model_Flat_Type",
    "Society",
    "Builder Name",
]


@lru_cache(maxsize=1)
def get_model():
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    model = joblib.load(MODEL_PATH)
    actual = list(getattr(model, "feature_names_in_", []))
    if actual != MODEL_FEATURES:
        raise RuntimeError(
            f"Model feature mismatch. Expected {MODEL_FEATURES}, received {actual}."
        )
    return model


def _required_number(payload: dict[str, Any], field: str, minimum: float = 0, maximum: float | None = None) -> float:
    value = payload.get(field)
    if value is None or value == "":
        raise ValueError(f"{field} is required")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a number") from None
    if number < minimum:
        raise ValueError(f"{field} must be at least {minimum}")
    if maximum is not None and number > maximum:
        raise ValueError(f"{field} must be at most {maximum}")
    return number


@lru_cache(maxsize=1)
def _fallback_values() -> dict[str, Any]:
    if not FALLBACK_PATH.exists():
        return {"global": {"Society": "Unknown", "Builder Name": "Unknown"}, "by_locality": {}}
    try:
        report = json.loads(FALLBACK_PATH.read_text(encoding="utf-8"))
        fallback_data = report.get("fallbacks", {})
        fallback_data["coverage"] = report.get("coverage", {})
        return fallback_data
    except (OSError, json.JSONDecodeError):
        return {"global": {"Society": "Unknown", "Builder Name": "Unknown"}, "by_locality": {}}


def _resolve_context(payload: dict[str, Any]) -> tuple[dict[str, str], list[str], str]:
    locality = str(payload.get("Locality", "")).strip()
    property_type = str(payload.get("Model_Flat_Type", "")).strip()
    try:
        bhk = int(float(payload.get("BHK_Model")))
    except (TypeError, ValueError):
        bhk = 0
    fallback_data = _fallback_values()
    comparable_values = fallback_data.get("by_comparable_group", {}).get(f"{locality}|{property_type}|{bhk}", {})
    locality_values = fallback_data.get("by_locality", {}).get(locality, {})
    global_values = fallback_data.get("global", {})
    values: dict[str, str] = {}
    used: list[str] = []
    source = "comparable locality/property type/BHK data" if comparable_values else ("locality data" if locality_values else "global training data")
    for field in ("Society", "Builder Name"):
        supplied = str(payload.get(field, "")).strip()
        if supplied:
            values[field] = supplied
        else:
            values[field] = str(comparable_values.get(field) or locality_values.get(field) or global_values.get(field) or "Unknown")
            used.append(field)
    return values, used, source


def _coverage_warning(payload: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    try:
        area = float(payload.get("Area"))
        bhk = int(float(payload.get("BHK_Model")))
    except (TypeError, ValueError):
        return None, None
    locality = str(payload.get("Locality", "")).strip()
    property_type = str(payload.get("Model_Flat_Type", "")).strip()
    report = _fallback_values()
    # Coverage is stored alongside the fallback metadata in the evaluation report.
    coverage = report.get("coverage", {})
    key = f"{locality}|{property_type}|{bhk}"
    match = coverage.get(key)
    if match is not None:
        records = int(match.get("records", 0))
        if records >= PREDICTION_GOOD_COVERAGE_MIN_RECORDS:
            warning = f"Good data coverage: {records} exact {bhk}-BHK {property_type} training records were found for {locality}."
        else:
            warning = f"Limited data — only {records} exact {bhk}-BHK {property_type} training record(s) were found for {locality}. Treat this estimate with additional caution."
        match = {**match, "scope": "locality, property type and BHK"}
        if area < match["min_area"] or area > match["max_area"]:
            warning += f" Area {area:g} sqft is outside the observed training range ({match['min_area']:g}-{match['max_area']:g} sqft)."
        return warning, match
    if match is None:
        candidates = [item for item in coverage.values() if item.get("locality") == locality and item.get("property_type") == property_type]
        if candidates:
            min_area = min(item["min_area"] for item in candidates)
            max_area = max(item["max_area"] for item in candidates)
            match = {"min_area": min_area, "max_area": max_area, "records": sum(item["records"] for item in candidates), "scope": "locality and property type"}
            warning = (
                f"Low coverage — no exact {bhk}-BHK {property_type} training records were found for {locality}. "
                "This is a model-generated estimate, not a verified local market valuation."
            )
            if area < min_area or area > max_area:
                warning += f" Area {area:g} sqft is also outside the broader observed range ({min_area:g}-{max_area:g} sqft)."
            return warning, match
        else:
            return (
                f"Low coverage — no exact {bhk}-BHK {property_type} training records were found for {locality}. "
                "This is a model-generated estimate, not a verified local market valuation.",
                None,
            )
    return None, match


def build_prediction_frame(payload: dict[str, Any]) -> pd.DataFrame:
    area = _required_number(payload, "Area", 0.01, 100_000)
    bhk = _required_number(payload, "BHK_Model", 1, 20)
    values: dict[str, Any] = {
        "Area": area,
        "BHK_Model": bhk,
    }
    context, _, _ = _resolve_context(payload)
    for field in MODEL_FEATURES[2:]:
        value = context[field] if field in context else payload.get(field)
        if value is None or not str(value).strip():
            raise ValueError(f"{field} is required")
        values[field] = str(value).strip()
    return pd.DataFrame([values], columns=MODEL_FEATURES)


def predict_price(payload: dict[str, Any]) -> dict[str, Any]:
    frame = build_prediction_frame(payload)
    model = get_model()
    prediction = float(model.predict(frame)[0])
    _, fallback_used, fallback_source = _resolve_context(payload)
    coverage_warning, coverage = _coverage_warning(payload)
    model_input_diagnostics = _model_input_diagnostics(model, frame)
    model_input_warning = None
    if model_input_diagnostics["unknown_categories"]:
        unknown_fields = ", ".join(model_input_diagnostics["unknown_categories"])
        model_input_warning = (
            f"The model was not trained with the selected {unknown_fields} value; "
            "it uses the model's broader patterns for this input."
        )
    return {
        "predicted_price": max(0, round(prediction, 2)),
        "features": frame.iloc[0].to_dict(),
        "model": "Random Forest Regressor",
        "model_features": MODEL_FEATURES,
        "fallback_used": fallback_used,
        "fallback_notice": f"Society/Builder values were filled from {fallback_source}." if fallback_used else None,
        "fallback_source": fallback_source if fallback_used else None,
        "coverage_warning": coverage_warning,
        "model_input_warning": model_input_warning,
        "training_coverage": coverage,
        "model_input_diagnostics": model_input_diagnostics,
    }


def _model_input_diagnostics(model: Any, frame: pd.DataFrame) -> dict[str, Any]:
    """Report whether categorical inputs are represented by the saved encoder.

    Unknown categories are intentionally not coerced to a known locality. The
    saved pipeline's ``handle_unknown='ignore'`` behavior is preserved, but the
    API makes its effect explicit to the user.
    """
    preprocessor = getattr(model, "named_steps", {}).get("preprocessor")
    categorical_pipeline = getattr(preprocessor, "named_transformers_", {}).get("cat") if preprocessor else None
    encoder = getattr(categorical_pipeline, "named_steps", {}).get("encoder") if categorical_pipeline else None
    categories = getattr(encoder, "categories_", []) if encoder else []
    categorical_features = ["Locality", "Status", "RERA Approval", "Model_Flat_Type", "Society", "Builder Name"]
    unknown_categories: list[str] = []
    category_presence: dict[str, bool] = {}
    for field, values in zip(categorical_features, categories):
        value = str(frame.iloc[0][field])
        present = value in {str(item) for item in values}
        category_presence[field] = present
        if not present:
            unknown_categories.append(field)
    return {
        "unknown_categories": unknown_categories,
        "category_presence": category_presence,
        "feature_order": list(frame.columns),
    }
