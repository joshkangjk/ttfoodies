"""
utils/haversine.py
Haversine formula implementation + nearest-MRT resolver.
"""

import math
import json
import os
from functools import lru_cache
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────

EARTH_RADIUS_KM = 6371.0
MAX_DISTANCE_KM = 3.0          # return "Unknown" if farther than this
MRT_DATA_PATH   = os.path.join(os.path.dirname(__file__), "..", "mrt_stations.json")

# ── Haversine formula ──────────────────────────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance (km) between two points on Earth
    using the Haversine formula.

    Args:
        lat1, lon1: Coordinates of point A (degrees).
        lat2, lon2: Coordinates of point B (degrees).

    Returns:
        Distance in kilometres (float).
    """
    # Convert decimal degrees → radians
    lat1_r, lon1_r, lat2_r, lon2_r = map(math.radians, [lat1, lon1, lat2, lon2])

    d_lat = lat2_r - lat1_r
    d_lon = lon2_r - lon1_r

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))

    return EARTH_RADIUS_KM * c


# ── MRT dataset loader (cached) ────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_mrt_stations() -> list[dict]:
    """
    Load the MRT station dataset once and cache it in memory.
    Expected JSON schema: [{"name": str, "lat": float, "lng": float}, ...]
    """
    with open(MRT_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Nearest-station resolver ───────────────────────────────────────────────────

def find_nearest_mrt(lat: float, lng: float) -> str:
    """
    Find the MRT station nearest to the given coordinates.

    Args:
        lat: Restaurant latitude.
        lng: Restaurant longitude.

    Returns:
        Station name string, or "Unknown" if the closest station is
        more than MAX_DISTANCE_KM (2 km) away.
    """
    stations = _load_mrt_stations()

    if not stations:
        return "Unknown"

    best_name: Optional[str] = None
    best_dist: float = float("inf")

    for station in stations:
        dist = haversine(lat, lng, station["lat"], station["lng"])
        if dist < best_dist:
            best_dist = dist
            best_name = station["name"]

    if best_dist > MAX_DISTANCE_KM:
        return "Unknown"

    return best_name or "Unknown"
