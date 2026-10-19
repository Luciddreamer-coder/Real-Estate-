from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import (
    SCRAPPA_API_BASE_URL,
    SCRAPPA_API_KEY,
    SCRAPPA_CACHE_COLLECTION,
    SCRAPPA_CACHE_TTL_SECONDS,
    SCRAPPA_CITY,
)


def get_market_comparison(payload: dict[str, Any], property_collection) -> dict[str, Any]:
    locality = str(payload.get("Locality", "")).strip()
    property_type = str(payload.get("Model_Flat_Type", "")).strip()
    area = _positive_number(payload.get("Area"))
    bhk = _positive_number(payload.get("BHK_Model"))
    if not locality or not property_type or area is None or bhk is None:
        raise ValueError("Locality, property type, area and BHK are required for market comparison")
    if not SCRAPPA_API_KEY:
        raise RuntimeError("Scrappa is not configured. Add SCRAPPA_API_KEY to the backend .env file.")

    cache = property_collection.database[SCRAPPA_CACHE_COLLECTION]
    cache_key = _cache_key(locality, property_type, area, bhk)
    cached = cache.find_one({"cache_key": cache_key, "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if cached:
        listings = cached.get("listings", [])
        return _comparison_response(listings, locality, property_type, area, bhk, cached=True, raw_count=cached.get("raw_count", len(listings)))

    listings, raw_count = _fetch_city_listings()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=SCRAPPA_CACHE_TTL_SECONDS)
    cache.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "city": SCRAPPA_CITY, "listings": listings, "raw_count": raw_count, "expires_at": expires_at}},
        upsert=True,
    )
    cache.create_index("expires_at", expireAfterSeconds=0, name="scrappa_cache_ttl")
    return _comparison_response(listings, locality, property_type, area, bhk, cached=False, raw_count=raw_count)


def _fetch_city_listings() -> tuple[list[dict[str, Any]], int]:
    query = urlencode({"city": SCRAPPA_CITY})
    request = Request(
        f"{SCRAPPA_API_BASE_URL}?{query}",
        headers={"Accept": "application/json", "X-API-KEY": SCRAPPA_API_KEY},
        method="GET",
    )
    try:
        with urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        raise RuntimeError("Scrappa market listings are temporarily unavailable.") from error

    data = body.get("data", body) if isinstance(body, dict) else {}
    raw_listings = data.get("properties", data.get("listings", [])) if isinstance(data, dict) else []
    normalized = [item for raw in raw_listings if (item := _normalize_listing(raw)) is not None]
    print_count = len(raw_listings)
    import logging
    logging.getLogger(__name__).info("Scrappa city listings: raw=%d normalized_with_valid_price=%d", print_count, len(normalized))
    return normalized, print_count


def _normalize_listing(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    raw_price = item.get("price")
    price_label = item.get("price_label") or item.get("priceText") or item.get("price_display") or (raw_price.get("label", "") if isinstance(raw_price, dict) else "")
    price = _money(raw_price, price_label)
    raw_area = item.get("area") or item.get("area_sqft") or item.get("built_up_area")
    area = _area_sqft(raw_area)
    rate = _money(item.get("price_per_sqft") or item.get("pricePerSqft") or item.get("rate_per_sqft"), "")
    if price is None:
        return None
    if rate is None and area:
        rate = price / area
    locality = str(item.get("locality") or item.get("location") or "").strip()
    heading = str(item.get("heading") or item.get("title") or "").strip()
    property_type = str(item.get("property_type") or item.get("propertyType") or "").strip()
    if not property_type or property_type.upper() in {"PROPERTY", "PROJECT"}:
        property_type = heading
    bhk = _positive_number(item.get("bedrooms") or item.get("bhk") or item.get("bhk_count"))
    return {
        "id": str(item.get("id") or item.get("spid") or item.get("url") or hashlib.sha1(heading.encode()).hexdigest()[:16]),
        "locality": locality,
        "property_type": _property_type(property_type),
        "bhk": bhk,
        "area": area,
        "asking_price": price,
        "rate_per_sqft": rate,
        "title": heading,
        "url": str(item.get("url") or ""),
    }


def _comparison_response(listings: list[dict[str, Any]], locality: str, property_type: str, area: float, bhk: float, cached: bool, raw_count: int) -> dict[str, Any]:
    target_locality = _key(locality)
    target_type = _property_type(property_type)
    locality_matches = [item for item in listings if _locality_match(item.get("locality"), target_locality)]
    property_type_matches = [item for item in locality_matches if _key(item.get("property_type")) == _key(target_type)]
    bhk_matches = [item for item in property_type_matches if _close_number(item.get("bhk"), bhk, 0)]
    exact = [item for item in bhk_matches if _close_number(item.get("area"), area, 0.25)]
    broader_typed_bhk = [item for item in listings if _key(item.get("property_type")) == _key(target_type) and _close_number(item.get("bhk"), bhk, 0)]
    broader_area = [item for item in broader_typed_bhk if _close_number(item.get("area"), area, 0.5) or item.get("area") is None]
    diagnostics = {
        "raw_returned": raw_count,
        "normalized_with_valid_price": len(listings),
        "locality_matches": len(locality_matches),
        "property_type_matches": len(property_type_matches),
        "bhk_matches": len(bhk_matches),
        "area_matches": len(exact),
    }
    import logging
    logging.getLogger(__name__).info("Scrappa matching diagnostics: %s", diagnostics)
    if exact:
        matches, scope = exact, "exact locality, property type, BHK and area"
    elif bhk_matches:
        matches, scope = bhk_matches, "same locality, property type and BHK; area broadened"
    elif broader_area:
        matches, scope = broader_area, "broader Gurugram comparisons with the same property type and BHK"
    else:
        matches, scope = [], "No relevant Scrappa comparisons found"
    prices = sorted(float(item["asking_price"]) for item in matches if _finite_positive(item.get("asking_price")))
    rates = sorted(float(item["rate_per_sqft"]) for item in matches if _finite_positive(item.get("rate_per_sqft")))
    return {
        "source": "Scrappa 99acres City Listings",
        "cached": cached,
        "city": SCRAPPA_CITY,
        "match_scope": scope,
        "coverage_note": (
            None if exact
            else "Exact locality matches were insufficient; results are broader market comparisons with the same property type and BHK."
            if matches
            else "No listings with the same property type and BHK were returned by Scrappa; unrelated listings were not used."
        ),
        "match_count": len(matches),
        "diagnostics": diagnostics,
        "listings": matches[:20],
        "asking_price": {"min": min(prices) if prices else None, "max": max(prices) if prices else None, "median": median(prices) if prices else None},
        "rate_per_sqft": {"median": median(rates) if rates else None},
    }


def _cache_key(locality: str, property_type: str, area: float, bhk: float) -> str:
    raw = json.dumps(["scrappa-city-v3", _key(locality), _key(property_type), round(area), round(bhk)], separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def _property_type(value: Any) -> str:
    text = str(value or "").lower()
    if "plot" in text or "land" in text:
        return "Plot"
    if "villa" in text:
        return "Villa"
    if "house" in text:
        return "House"
    if "floor" in text:
        return "Floor"
    if "penthouse" in text:
        return "Penthouse"
    if "studio" in text:
        return "Studio"
    if "apartment" in text or "flat" in text:
        return "Apartment"
    return str(value or "").strip()


def _money(value: Any, label: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    structured_value = isinstance(value, dict)
    if isinstance(value, dict):
        value = value.get("min") or value.get("max") or value.get("value")
    text = str(value).replace(",", "").replace("₹", "").strip().lower()
    label_text = "" if structured_value else str(label or "").lower()
    multiplier = 1
    if "cr" in text or "crore" in text or "cr" in label_text:
        multiplier = 10_000_000
    elif "lakh" in text or " lac" in text or "l" == text[-1:] or "lakh" in label_text:
        multiplier = 100_000
    text = re.sub(r"[^0-9.\-]", "", text)
    try:
        number = float(text) * multiplier
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def _positive_number(value: Any) -> float | None:
    if isinstance(value, dict):
        value = value.get("value") or value.get("min") or value.get("max")
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def _area_sqft(value: Any) -> float | None:
    if isinstance(value, dict):
        unit = str(value.get("unit", "")).lower()
        number = _positive_number(value)
        if number is None:
            return None
        if "yard" in unit or "gaj" in unit:
            return number * 9
        if "acre" in unit:
            return number * 43_560
        return number
    return _positive_number(value)


def _finite_positive(value: Any) -> bool:
    return _positive_number(value) is not None


def _key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _locality_match(value: Any, target: str) -> bool:
    candidate = _key(value)
    if not candidate or not target:
        return False
    return candidate == target or candidate.startswith(f"{target} ") or target.startswith(f"{candidate} ")


def _close_number(value: Any, target: float, tolerance: float) -> bool:
    number = _positive_number(value)
    if number is None:
        return False
    return abs(number - target) <= target * tolerance
