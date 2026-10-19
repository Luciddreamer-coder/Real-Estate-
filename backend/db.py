from __future__ import annotations

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, MongoClient

from .config import MONGODB_COLLECTION, MONGODB_DATABASE, MONGODB_URI


_client: MongoClient | None = None
_indexes_ready = False
_index_names: dict[str, str] = {}


def get_collection():
    global _client
    if not MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not configured. Add it to the local .env file.")
    if _client is None:
        _client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
        )
    return _client[MONGODB_DATABASE][MONGODB_COLLECTION]


def ensure_indexes(collection) -> None:
    global _indexes_ready, _index_names
    if _indexes_ready:
        return

    existing = collection.index_information()

    def ensure(keys: list[tuple[str, int]], preferred_name: str) -> str:
        wanted = tuple(keys)
        for name, info in existing.items():
            if tuple(info.get("key", [])) == wanted:
                return name
        name = collection.create_index(keys, name=preferred_name)
        existing[name] = {"key": keys}
        return name

    _index_names["locality"] = ensure([("Locality", ASCENDING)], "idx_locality")
    _index_names["locality_price"] = ensure(
        [("Locality", ASCENDING), ("Price", DESCENDING)], "idx_locality_price"
    )
    _index_names["flat_type"] = ensure([("Flat Type", ASCENDING)], "idx_flat_type")
    _indexes_ready = True


def get_index_name(index_key: str) -> str:
    return _index_names.get(index_key, index_key)


def serialize_id(value: Any) -> str:
    return str(value)


def parse_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise ValueError("Invalid property id") from None


def serialize_document(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if document is None:
        return None
    result = dict(document)
    result["id"] = serialize_id(result.pop("_id"))
    return result
