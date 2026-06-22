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


def _source_file_label(path: Path, source_root: Path | None) -> str:
    if source_root is None:
        return path.as_posix()
    try:
        return path.resolve().relative_to(source_root.resolve()).as_posix()
    except ValueError:
        raise ValueError(f"source path is outside source_root: {path}") from None


def load_canonical_rows(
    paths: list[Path],
    *,
    source_root: Path | None = None,
) -> list[dict[str, Any]]:
    canonical_rows: list[dict[str, Any]] = []
    for path in paths:
        source_file = _source_file_label(path, source_root)
        for row in iter_csv_rows(path):
            canonical_rows.append(normalize_record(row, source_file=source_file))
    return canonical_rows
