from __future__ import annotations

import math
import json
import os
from pathlib import Path
from statistics import median
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from .config import FRONTEND_ORIGIN, PAGE_SIZE_MAX
from .db import (
    ensure_indexes,
    get_collection,
    get_index_name,
    parse_object_id,
    serialize_document,
)
from .model_service import predict_price
from .scrappa_service import get_market_comparison
from .group_evaluation import REPORT_PATH as GROUP_EVALUATION_PATH, evaluate_groups


MODEL_METRICS_PATH = Path(__file__).resolve().parent.parent / "models" / "model_evaluation.json"
DASHBOARD_MIN_LOCALITY_SAMPLE_SIZE = max(1, int(os.getenv("DASHBOARD_MIN_LOCALITY_SAMPLE_SIZE", "3")))
DASHBOARD_MIN_RATE_SAMPLE_SIZE = max(1, int(os.getenv("DASHBOARD_MIN_RATE_SAMPLE_SIZE", "3")))
DASHBOARD_RATE_SMALL_SAMPLE_SIZE = max(1, int(os.getenv("DASHBOARD_RATE_SMALL_SAMPLE_SIZE", "10")))
ML_VERY_LIMITED_MAX_RECORDS = max(1, int(os.getenv("ML_VERY_LIMITED_MAX_RECORDS", "3")))
ML_LIMITED_MAX_RECORDS = max(ML_VERY_LIMITED_MAX_RECORDS, int(os.getenv("ML_LIMITED_MAX_RECORDS", "10")))


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": [FRONTEND_ORIGIN]}})

    @app.errorhandler(ValueError)
    def handle_value_error(error: ValueError):
        return jsonify({"error": str(error)}), 400

    @app.errorhandler(RuntimeError)
    def handle_runtime_error(error: RuntimeError):
        return jsonify({"error": str(error)}), 503

    @app.errorhandler(PyMongoError)
    def handle_mongo_error(error: PyMongoError):
        app.logger.exception("MongoDB operation failed", exc_info=error)
        return jsonify({"error": "MongoDB is temporarily unavailable. Please try again."}), 503

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.post("/api/predict")
    def predict():
        payload = request.get_json(silent=True) or {}
        return jsonify(predict_price(payload))

    @app.post("/api/market-comparison")
    def market_comparison():
        payload = request.get_json(silent=True) or {}
        return jsonify(get_market_comparison(payload, get_collection()))

    @app.get("/api/model-metrics")
    def model_metrics():
        if not MODEL_METRICS_PATH.exists():
            raise RuntimeError("Model evaluation has not been generated yet. Run: python -m backend.model_evaluation")
        return jsonify(json.loads(MODEL_METRICS_PATH.read_text(encoding="utf-8")))

    @app.get("/api/group-evaluation")
    def group_evaluation():
        if not GROUP_EVALUATION_PATH.exists():
            report = evaluate_groups()
            GROUP_EVALUATION_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        return jsonify(json.loads(GROUP_EVALUATION_PATH.read_text(encoding="utf-8")))

    @app.get("/api/property-filters")
    def property_filters():
        collection = get_collection()
        return jsonify({
            "localities": sorted(value for value in collection.distinct("Locality") if value),
            "builders": sorted(value for value in collection.distinct("Builder Name") if value),
            "societies": sorted(value for value in collection.distinct("Society") if value),
            "bhks": sorted({float(value) for value in collection.distinct("BHK_Count") if isinstance(value, (int, float)) and value > 0}),
        })

    @app.get("/api/prediction-options")
    def prediction_options():
        collection = get_collection()
        locality = request.args.get("locality", "").strip()
        query = {"Locality": locality} if locality else {}
        return jsonify({
            "locality": locality,
            "societies": sorted(str(value).strip() for value in collection.distinct("Society", query) if str(value).strip()),
            "builders": sorted(str(value).strip() for value in collection.distinct("Builder Name", query) if str(value).strip()),
            "all_societies": sorted(str(value).strip() for value in collection.distinct("Society") if str(value).strip()),
            "all_builders": sorted(str(value).strip() for value in collection.distinct("Builder Name") if str(value).strip()),
        })

    @app.get("/api/properties")
    def list_properties():
        collection = get_collection()
        ensure_indexes(collection)
        query: dict[str, Any] = {}
        search = request.args.get("search", "").strip()
        if search:
            query["$or"] = [
                {field: {"$regex": search, "$options": "i"}}
                for field in ["Locality", "Property Type", "Builder Name", "Society", "Company Name", "Flat Type"]
            ]
        for arg, field in [
            ("status", "Status"),
            ("locality", "Locality"),
            ("type", "Flat Type"),
            ("builder", "Builder Name"),
            ("society", "Society"),
        ]:
            value = request.args.get(arg, "").strip()
            if value and value != "All":
                query[field] = value
        rera = request.args.get("rera", "").strip()
        if rera == "approved":
            query["RERA Approval"] = {"$regex": "^approved", "$options": "i"}
        elif rera == "not_approved":
            query["RERA Approval"] = {"$not": {"$regex": "^approved", "$options": "i"}}

        bhk = request.args.get("bhk", "").strip()
        if bhk:
            try:
                bhk_number = float(bhk.rstrip("+"))
            except ValueError:
                raise ValueError("bhk must be a number") from None
            query["BHK_Count"] = {"$gte": bhk_number} if bhk.endswith("+") else bhk_number

        for arg, field in [("min_price", "Price"), ("max_price", "Price"), ("min_area", "Area"), ("max_area", "Area")]:
            value = request.args.get(arg)
            if value:
                try:
                    number = float(value)
                except ValueError:
                    raise ValueError(f"{arg} must be a number") from None
                operator = "$gte" if arg.startswith("min_") else "$lte"
                query.setdefault(field, {})[operator] = number

        try:
            page = max(0, int(request.args.get("page", 0)))
            limit = min(PAGE_SIZE_MAX, max(1, int(request.args.get("limit", 24))))
        except ValueError:
            raise ValueError("page and limit must be integers") from None
        sort_map = {
            "price_asc": [("Price", 1)],
            "price_desc": [("Price", -1)],
            "area_desc": [("Area", -1)],
            "rate_desc": [("Rate per sqft", -1)],
            "bhk_desc": [("BHK_Count", -1)],
        }
        # Add _id as a deterministic tie-breaker. Without it, MongoDB may
        # return equal-priced documents in a different order between pages,
        # causing duplicates or missing records while paginating.
        sort = sort_map.get(request.args.get("sort", "price_desc"), sort_map["price_desc"])
        sort = [*sort, ("_id", 1)]
        total = collection.count_documents(query)
        rows = collection.find(query).sort(sort).skip(page * limit).limit(limit)
        return jsonify({"rows": [serialize_document(row) for row in rows], "total": total})

    @app.get("/api/properties/<property_id>")
    def get_property(property_id: str):
        document = get_collection().find_one({"_id": parse_object_id(property_id)})
        if document is None:
            return jsonify({"error": "Property not found"}), 404
        return jsonify(serialize_document(document))

    @app.post("/api/properties")
    def create_property():
        payload = request.get_json(silent=True) or {}
        document = _frontend_to_document(payload)
        _validate_price_consistency(document)
        result = get_collection().insert_one(document)
        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the property insert")
        document["_id"] = result.inserted_id
        app.logger.info("Created property in gurugram_real_estate.properties with id=%s", result.inserted_id)
        return jsonify(serialize_document(document)), 201

    @app.put("/api/properties/<property_id>")
    def update_property(property_id: str):
        payload = request.get_json(silent=True) or {}
        collection = get_collection()
        existing = collection.find_one({"_id": parse_object_id(property_id)})
        if existing is None:
            return jsonify({"error": "Property not found"}), 404
        document = _frontend_to_document(payload)
        _validate_price_consistency(document, existing)
        result = collection.find_one_and_update(
            {"_id": parse_object_id(property_id)}, {"$set": document}, return_document=ReturnDocument.AFTER
        )
        if result is None:
            return jsonify({"error": "Property not found"}), 404
        app.logger.info("Updated property in gurugram_real_estate.properties with id=%s", property_id)
        return jsonify(serialize_document(result))

    @app.delete("/api/properties/<property_id>")
    def delete_property(property_id: str):
        result = get_collection().delete_one({"_id": parse_object_id(property_id)})
        if result.deleted_count == 0:
            return jsonify({"error": "Property not found"}), 404
        return jsonify({"deleted": True})

    @app.get("/api/dashboard")
    def dashboard():
        collection = get_collection()
        overall = list(collection.aggregate([
            {"$group": {"_id": None, "count": {"$sum": 1}, "average_price": {"$avg": "$Price"}, "min_price": {"$min": "$Price"}, "max_price": {"$max": "$Price"}}}
        ]))
        locality = list(collection.aggregate([
            {"$group": {"_id": "$Locality", "prices": {"$push": "$Price"}}},
        ]))
        for row in locality:
            prices = sorted(price for price in (_coerce_positive_price(value) for value in row.pop("prices", [])) if price is not None)
            row["count"] = len(prices)
            row["average_price"] = sum(prices) / len(prices) if prices else None
            row["median_price"] = median(prices) if prices else None
        locality.sort(key=lambda row: row.get("median_price") if row.get("median_price") is not None else float("-inf"), reverse=True)
        locality_count = list(collection.aggregate([
            {"$group": {"_id": "$Locality", "count": {"$sum": 1}, "average_price": {"$avg": "$Price"}, "average_rate": {"$avg": "$Rate per sqft"}}},
            {"$sort": {"count": -1}}, {"$limit": 10},
        ]))
        property_type = list(collection.aggregate([
            {"$group": {"_id": "$Flat Type", "count": {"$sum": 1}, "average_price": {"$avg": "$Price"}}},
            {"$sort": {"count": -1}},
        ]))
        return jsonify({
            "overall": _clean_aggregation(overall),
            "by_locality": _clean_aggregation(locality),
            "by_locality_count": _clean_aggregation(locality_count),
            "by_property_type": _clean_aggregation(property_type),
            "locality_min_sample_size": DASHBOARD_MIN_LOCALITY_SAMPLE_SIZE,
        })

    @app.get("/api/insights")
    def insights():
        collection = get_collection()
        ensure_indexes(collection)
        total_documents = collection.count_documents({})
        index_information = collection.index_information()
        indexed_fields = sorted({
            field
            for info in index_information.values()
            for field, _direction in info.get("key", [])
        })
        indexed_plan = _explain_locality_query(collection, get_index_name("locality"))
        unindexed_plan = _explain_locality_query(collection, {"$natural": 1})
        indexed_ms = indexed_plan.get("executionStats", {}).get("executionTimeMillis", 0)
        unindexed_ms = unindexed_plan.get("executionStats", {}).get("executionTimeMillis", 0)
        locality_rows = list(collection.aggregate([
            {"$group": {"_id": "$Locality", "prices": {"$push": "$Price"}, "rates": {"$push": "$Rate per sqft"}}},
        ]))
        top_localities = []
        for row in locality_rows:
            prices = sorted(price for price in (_coerce_positive_price(value) for value in row.pop("prices", [])) if price is not None)
            rates = sorted(rate for rate in (_coerce_positive_price(value) for value in row.pop("rates", [])) if rate is not None)
            if not prices:
                continue
            top_localities.append({
                "_id": row.get("_id"),
                "count": len(prices),
                "average_price": sum(prices) / len(prices),
                "median_price": median(prices),
                "average_rate": sum(rates) / len(rates) if rates else None,
                "median_rate": median(rates) if rates else None,
            })
        top_localities.sort(key=lambda row: row["average_price"], reverse=True)
        rate_localities = [
            {
                **row,
                "small_sample": row["count"] < DASHBOARD_RATE_SMALL_SAMPLE_SIZE,
                "review_high_rate": row["_id"] == "Sector 42",
            }
            for row in top_localities
            if row["count"] >= DASHBOARD_MIN_RATE_SAMPLE_SIZE and row["average_rate"] is not None
        ]
        rate_localities.sort(key=lambda row: row["average_rate"], reverse=True)

        # Read-only coverage reports. The source documents are never changed;
        # these aggregates only describe how much training evidence exists.
        core_types = ["Apartment", "Plot", "Floor", "Villa"]
        locality_type_rows = list(collection.aggregate([
            {"$group": {"_id": {"locality": "$Locality", "property_type": "$Flat Type"}, "count": {"$sum": 1}}},
        ]))
        locality_report_map: dict[str, dict[str, Any]] = {}
        for row in locality_type_rows:
            key = row.get("_id") or {}
            locality = str(key.get("locality") or "Unknown").strip() or "Unknown"
            property_type = str(key.get("property_type") or "Unknown").strip() or "Unknown"
            entry = locality_report_map.setdefault(locality, {"locality": locality, "total_listings": 0, "by_property_type": {}})
            count = int(row.get("count", 0))
            entry["total_listings"] += count
            entry["by_property_type"][property_type] = count
        locality_report = []
        for entry in locality_report_map.values():
            total = entry["total_listings"]
            locality_report.append({
                "locality": entry["locality"],
                "total_listings": total,
                "percentage_of_dataset": (total / total_documents * 100) if total_documents else 0,
                "apartments": entry["by_property_type"].get("Apartment", 0),
                "plots": entry["by_property_type"].get("Plot", 0),
                "floors": entry["by_property_type"].get("Floor", 0),
                "villas": entry["by_property_type"].get("Villa", 0),
            })
        locality_report.sort(key=lambda row: (row["total_listings"], row["locality"].lower()))

        coverage_rows = list(collection.aggregate([
            {"$group": {"_id": {"locality": "$Locality", "property_type": "$Flat Type", "bhk": "$BHK_Count"}, "count": {"$sum": 1}}},
        ]))
        coverage_map: dict[str, dict[str, Any]] = {}
        for row in coverage_rows:
            key = row.get("_id") or {}
            locality = str(key.get("locality") or "Unknown").strip() or "Unknown"
            property_type = str(key.get("property_type") or "Unknown").strip() or "Unknown"
            try:
                bhk = int(float(key.get("bhk")))
            except (TypeError, ValueError):
                bhk = 0
            coverage_map.setdefault(locality, {}).setdefault(property_type, {})[str(bhk)] = int(row.get("count", 0))
        coverage_report = []
        for locality, type_groups in coverage_map.items():
            by_type = []
            missing_types = [property_type for property_type in core_types if property_type not in type_groups]
            sparse_groups = []
            for property_type, bhk_counts in sorted(type_groups.items()):
                one_to_five = {str(bhk): int(bhk_counts.get(str(bhk), 0)) for bhk in range(1, 6)}
                by_type.append({"property_type": property_type, "bhk_1_to_5": one_to_five, "total_records": sum(bhk_counts.values())})
                for bhk, count in sorted(bhk_counts.items(), key=lambda item: int(item[0])):
                    if 1 <= int(bhk) <= 5 and count <= ML_LIMITED_MAX_RECORDS:
                        sparse_groups.append({"property_type": property_type, "bhk": int(bhk), "records": count})
            coverage_report.append({"locality": locality, "by_property_type": by_type, "missing_property_types": missing_types, "sparse_groups": sparse_groups})
        coverage_report.sort(key=lambda row: row["locality"].lower())

        classification = []
        for row in locality_report:
            count = row["total_listings"]
            label = "Very limited data" if count <= ML_VERY_LIMITED_MAX_RECORDS else ("Limited data" if count <= ML_LIMITED_MAX_RECORDS else "Better represented")
            classification.append({"locality": row["locality"], "total_listings": count, "classification": label})
        classification.sort(key=lambda row: (row["total_listings"], row["locality"].lower()))
        return jsonify({
            "total_docs": total_documents,
            "collection_count": len(collection.database.list_collection_names()),
            "indexed_fields": indexed_fields,
            "indexes": [
                {"name": name, "field": ", ".join(field for field, _direction in info.get("key", [])), "description": "MongoDB index"}
                for name, info in index_information.items()
            ],
            "query": {"field": "Locality", "value": "Sector 79", "index": get_index_name("locality")},
            "rate_locality_min_sample_size": DASHBOARD_MIN_RATE_SAMPLE_SIZE,
            "rate_locality_small_sample_size": DASHBOARD_RATE_SMALL_SAMPLE_SIZE,
            "query_performance": {"with_index": indexed_ms, "without_index": unindexed_ms, "speedup": unindexed_ms / max(indexed_ms, 0.001)},
            "top_localities": _clean_aggregation(top_localities[:15]),
            "rate_localities": _clean_aggregation(rate_localities[:15]),
            "property_types": _clean_aggregation(list(collection.aggregate([
                {"$group": {"_id": "$Flat Type", "count": {"$sum": 1}, "average_price": {"$avg": "$Price"}}},
                {"$sort": {"count": -1}},
            ]))),
            "coverage_reports": {
                "all_localities": locality_report,
                "ml_coverage": coverage_report,
                "classification": classification,
                "thresholds": {"very_limited_max_records": ML_VERY_LIMITED_MAX_RECORDS, "limited_max_records": ML_LIMITED_MAX_RECORDS},
            },
        })

    return app


def _frontend_to_document(payload: dict[str, Any]) -> dict[str, Any]:
    def number(name: str, default: float = 0) -> float:
        value = payload.get(name, default)
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a number") from None
        if not math.isfinite(parsed):
            raise ValueError(f"{name} must be a finite number")
        return parsed

    def text(name: str, default: str = "", maximum: int = 300) -> str:
        value = str(payload.get(name, default) or "").strip()
        if len(value) > maximum:
            raise ValueError(f"{name} must be {maximum} characters or fewer")
        return value

    price = number("price")
    area = int(number("square_feet"))
    rate_per_sqft = number("rate_per_sqft")
    bedrooms = number("bedrooms")
    if price <= 0:
        raise ValueError("price must be greater than zero")
    if area <= 0:
        raise ValueError("square_feet must be greater than zero")
    if rate_per_sqft <= 0:
        raise ValueError("rate_per_sqft must be greater than zero")
    if bedrooms < 0:
        raise ValueError("bedrooms cannot be negative")
    address = text("address")
    locality = text("city")
    if not address:
        raise ValueError("address is required")
    if not locality:
        raise ValueError("city is required")

    return {
        "Price": price,
        "Status": text("status"),
        "Area": area,
        "Rate per sqft": float(rate_per_sqft),
        "Property Type": address,
        "Locality": locality,
        "Builder Name": text("state"),
        "RERA Approval": "Approved by RERA" if payload.get("rera_approved") else "Not Approved",
        "BHK_Count": bedrooms,
        "Society": text("society"),
        "Company Name": text("zip"),
        "Flat Type": text("property_type", maximum=80),
    }


def _validate_price_consistency(document: dict[str, Any], existing: dict[str, Any] | None = None) -> None:
    """Validate manual pricing without rewriting historical dataset values."""
    expected = float(document["Area"]) * float(document["Rate per sqft"])
    actual = float(document["Price"])
    if existing is not None:
        unchanged_pricing = all(
            float(existing.get(field, 0)) == float(document[field])
            for field in ("Price", "Area", "Rate per sqft")
        )
        if unchanged_pricing:
            return
    if abs(actual - expected) > 0.01:
        raise ValueError(
            f"Price must equal Area × Rate per sqft. Expected {expected:.2f}, received {actual:.2f}."
        )


def _clean_aggregation(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned = []
    for row in rows:
        item = dict(row)
        item["_id"] = str(item.get("_id", ""))
        for key, value in list(item.items()):
            if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                item[key] = None
        cleaned.append(item)
    return cleaned


def _coerce_positive_price(value: Any) -> float | None:
    """Convert a stored price to a usable positive finite number without mutating it."""
    if value is None or isinstance(value, bool):
        return None
    try:
        normalized = str(value).replace("₹", "").replace(",", "").strip()
        price = float(normalized)
    except (TypeError, ValueError):
        return None
    return price if math.isfinite(price) and price > 0 else None


def _explain_locality_query(collection, hint: str | dict[str, int]) -> dict[str, Any]:
    """Return real execution statistics for the indexed/unindexed locality query."""
    return collection.database.command(
        "explain",
        {
            "find": collection.name,
            "filter": {"Locality": "Sector 79"},
            "hint": hint,
        },
        verbosity="executionStats",
    )


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=os.getenv("FLASK_DEBUG", "0") == "1")
