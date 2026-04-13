"""
utils/deduplication.py
Normalises candidate place names and removes near-duplicates.
"""

import re
from difflib import SequenceMatcher


# ── Text normalisation ─────────────────────────────────────────────────────────

def _normalise(name: str) -> str:
    """
    Lowercase, strip punctuation / extra whitespace, and remove very
    common restaurant suffixes so that "Keisuke" and "Keisuke Tonkotsu
    King" share a common root for comparison.
    """
    # Lowercase
    text = name.lower().strip()

    # Remove punctuation except hyphens (keep compound names)
    text = re.sub(r"[^\w\s-]", "", text)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Strip trailing generic tokens
    stopwords = {
        "restaurant", "cafe", "bar", "grill", "kitchen", "house",
        "eatery", "bistro", "ramen", "sushi", "curry", "bbq", "hotpot",
    }
    tokens = text.split()
    tokens = [t for t in tokens if t not in stopwords]

    return " ".join(tokens)


# ── Similarity check ───────────────────────────────────────────────────────────

def _are_similar(a: str, b: str, threshold: float = 0.80) -> bool:
    """
    Return True when the normalised edit-distance ratio exceeds
    `threshold`, OR when one normalised string is a prefix of the other
    (catches "Keisuke" ⊂ "Keisuke Tonkotsu King").
    """
    na, nb = _normalise(a), _normalise(b)

    # Prefix / suffix containment check
    if na in nb or nb in na:
        return True

    # Sequence similarity ratio
    ratio = SequenceMatcher(None, na, nb).ratio()
    return ratio >= threshold


# ── Public API ─────────────────────────────────────────────────────────────────

def deduplicate_candidates(candidates: list[str]) -> list[str]:
    """
    Given a raw list of extracted place names, return a deduplicated
    list.  When two names are considered similar the longer / more
    specific name is kept (e.g. "Keisuke Tonkotsu King" wins over
    "Keisuke").

    Args:
        candidates: Raw list of strings from the LLM extractor.

    Returns:
        Filtered list with duplicates removed.
    """
    if not candidates:
        return []

    # Sort by length descending so longer (more specific) names come first
    sorted_names = sorted(candidates, key=len, reverse=True)
    kept: list[str] = []

    for candidate in sorted_names:
        # Check if any already-kept name is similar
        if not any(_are_similar(candidate, existing) for existing in kept):
            kept.append(candidate)

    # Restore original relative order for UX consistency
    original_order = {name: i for i, name in enumerate(candidates)}
    kept.sort(key=lambda n: original_order.get(n, 9999))

    return kept
