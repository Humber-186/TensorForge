"""CSV ingestion for the area/power explorer."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Iterable

from .normalize import normalize_record


def _clean_key(key: str | None) -> str:
    if key is None:
        return ""
    return key.lstrip("\ufeff").strip()


def iter_csv_rows(path: Path) -> Iterable[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            cleaned: dict[str, str] = {}
            for key, value in row.items():
                clean_key = _clean_key(key)
                if not clean_key:
                    continue
                cleaned[clean_key] = (value or "").strip()
            yield cleaned


def load_canonical_rows(paths: list[Path]) -> list[dict[str, Any]]:
    canonical_rows: list[dict[str, Any]] = []
    for path in paths:
        for row in iter_csv_rows(path):
            canonical_rows.append(normalize_record(row, source_file=str(path)))
    return canonical_rows
