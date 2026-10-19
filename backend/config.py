import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")


MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "gurugram_real_estate")
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION", "properties")
MODEL_PATH = Path(os.getenv("MODEL_PATH", str(ROOT_DIR / "models" / "gurugram_price_model.joblib")))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
PAGE_SIZE_MAX = 20000
SCRAPPA_API_KEY = os.getenv("SCRAPPA_API_KEY") or os.getenv("SCRAPPA_API_TOKEN", "")
SCRAPPA_API_BASE_URL = os.getenv("SCRAPPA_API_BASE_URL", "https://scrappa.co/api/99acres/v1/city-listings")
SCRAPPA_CITY = os.getenv("SCRAPPA_CITY", "Gurgaon")
SCRAPPA_CACHE_COLLECTION = os.getenv("SCRAPPA_CACHE_COLLECTION", "scrappa_market_cache")
SCRAPPA_CACHE_TTL_SECONDS = max(300, int(os.getenv("SCRAPPA_CACHE_TTL_SECONDS", "21600")))
PREDICTION_GOOD_COVERAGE_MIN_RECORDS = max(1, int(os.getenv("PREDICTION_GOOD_COVERAGE_MIN_RECORDS", "20")))
