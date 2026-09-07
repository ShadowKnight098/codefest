import time
from typing import Any, Optional, Dict, Tuple
import asyncio

class TTLCache:
    """
    Lightweight, ultra-fast async-safe in-memory cache with Time-To-Live (TTL).
    Eliminates redundant database queries during high-concurrency exam bursts.
    """
    def __init__(self):
        self._cache: Dict[str, Tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            value, expiry = self._cache[key]
            if time.time() < expiry:
                return value
            else:
                self._cache.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl_seconds: float = 5.0):
        self._cache[key] = (value, time.time() + ttl_seconds)

    def delete(self, key: str):
        self._cache.pop(key, None)

    def clear_prefix(self, prefix: str):
        keys_to_delete = [k for k in list(self._cache.keys()) if k.startswith(prefix)]
        for k in keys_to_delete:
            self._cache.pop(k, None)

    def clear(self):
        self._cache.clear()

memory_cache = TTLCache()
