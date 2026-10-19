
from pymongo.errors import OperationFailure
from backend.db import get_collection

collection = get_collection()

try:
    print(list(collection.aggregate([{"$limit": 3}])))
except OperationFailure as error:
    print("Error code:", error.code)
    print("Error details:", repr(error.details))
    print("Error message:", repr(str(error)))
