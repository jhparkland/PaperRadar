"""
matcher.py — 출처 문자열(구글 스칼라 알림의 학회/저널명)을 venues.yaml 항목에 대응시키는 공통 모듈.

규칙 (README "매칭 규칙" 절과 동일):
  1. 정식 명칭(name)은 대소문자 무시, 단어 경계 기준 부분 일치.
  2. 별칭(aliases):
       - 전부 대문자인 별칭은 대소문자 구분 (CLUSTER ≠ Cluster Computing).
       - 3글자 이하 별칭은 연도가 인접할 때만 인정 ("SC '24", "SC24", "SC 2024", "ICS 2025").
       - 그 외는 대소문자 무시, 단어 경계 기준.
  3. match: exact 가 붙은 항목은 연도·권호를 뗀 문자열이 정확히 같을 때만.
  4. 여러 항목이 걸리면 가장 긴 문자열이 일치한 항목이 이긴다.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import yaml

TYPES = ("conferences", "journals", "workshops", "preprints")

_YEAR_TAIL = re.compile(r"[,;(]?\s*(19|20)\d{2}\s*\)?\s*$")
_VOL = re.compile(r",?\s*(vol(ume)?\.?|no\.?|issue|pp\.?)\s*[\d\-–]+.*$", re.I)
_PROC = re.compile(r"^\s*(proceedings|proc\.)\s+of\s+(the\s+)?", re.I)
_ORD = re.compile(r"^\s*(19|20)\d{2}\s+")  # "2024 IEEE ..." 선행 연도


@dataclass
class Venue:
    id: str
    name: str
    type: str
    grade: str
    priority: str = "normal"
    aliases: list[str] = field(default_factory=list)
    match: str = "substring"  # or "exact"
    raw: dict = field(default_factory=dict)


@dataclass
class Match:
    venue: Venue
    matched_text: str
    score: int

    def __str__(self) -> str:
        v = self.venue
        return f"{v.id} [{v.type}/{v.grade}/{v.priority}] via {self.matched_text!r}"


def load_venues(path: str | Path) -> list[Venue]:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    out: list[Venue] = []
    for t in TYPES:
        for e in data.get(t) or []:
            out.append(
                Venue(
                    id=str(e["id"]),
                    name=str(e["name"]),
                    type=str(e.get("type", t.rstrip("s"))),
                    grade=str(e["grade"]),
                    priority=str(e.get("priority", "normal")),
                    aliases=[str(a) for a in (e.get("aliases") or [])],
                    match=str(e.get("match", "substring")),
                    raw=e,
                )
            )
    return out


TRUNCATED_MARK = "…"


def is_truncated(source: str) -> bool:
    """구글 스칼라 알림은 긴 출처를 '…' 로 자른다. 잘린 출처는 링크를 열어 정식 명칭을 확인해야 한다."""
    return TRUNCATED_MARK in source or "..." in source


def clean(source: str) -> str:
    """Gmail 평문 변환이 넣는 *강조* 기호와 중복 공백을 제거한다."""
    return re.sub(r"\s+", " ", source.replace("*", "")).strip()


def normalize(source: str) -> str:
    s = clean(source)
    s = _PROC.sub("", s)
    s = _VOL.sub("", s)
    s = _YEAR_TAIL.sub("", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;.")
    return s


def _boundary(pattern_text: str, flags: int) -> re.Pattern:
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(pattern_text) + r"(?![A-Za-z0-9])", flags)


def _short_alias_pattern(alias: str) -> re.Pattern:
    # "SC '24" / "SC24" / "SC 2024" / "SC'24"
    return re.compile(
        r"(?<![A-Za-z0-9])" + re.escape(alias) + r"\s*'?\s*((19|20)?\d{2})(?![A-Za-z0-9])"
    )


def match_one(source: str, venues: Iterable[Venue]) -> Match | None:
    best: Match | None = None
    source = clean(source)
    norm = normalize(source)
    for v in venues:
        cand: list[tuple[str, int]] = []
        if v.match == "exact":
            if norm.lower() == v.name.lower():
                cand.append((v.name, len(v.name) * 2))
        else:
            if _boundary(v.name, re.I).search(source):
                cand.append((v.name, len(v.name) * 2))
            for a in v.aliases:
                if len(a) <= 3:
                    m = _short_alias_pattern(a).search(source)
                    if m:
                        cand.append((m.group(0), len(a)))
                    continue
                flags = 0 if a.isupper() else re.I
                if _boundary(a, flags).search(source):
                    cand.append((a, len(a)))
        if not cand:
            continue
        text, score = max(cand, key=lambda c: c[1])
        if best is None or score > best.score:
            best = Match(v, text, score)
    return best


def match_all(source: str, venues: Iterable[Venue]) -> list[Match]:
    """디버깅용: 걸리는 모든 항목을 점수순으로."""
    res: list[Match] = []
    for v in venues:
        m = match_one(source, [v])
        if m:
            res.append(m)
    return sorted(res, key=lambda m: -m.score)
