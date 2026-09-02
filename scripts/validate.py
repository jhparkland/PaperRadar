#!/usr/bin/env python3
"""
validate.py — venues.yaml / profile.yaml 을 실행 전에 검사한다.

  python scripts/validate.py                       # config/ 기본 경로
  python scripts/validate.py --venues X --profile Y

종료 코드: 0 = 통과(경고 가능), 1 = 오류.
스킬은 run 전에 이 검사를 반드시 통과시켜야 한다 (오류 상태로 실행 금지).
"""
from __future__ import annotations
import argparse
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from matcher import TYPES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

GRADES = {
    "conference": {"S", "A"},
    "journal": {"top", "Q1", "Q2"},
    "workshop": {"W"},
    "preprint": {"P"},
}
PRIORITIES = {"high", "normal", "low"}
POLICIES = {"full", "brief", "skip"}
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
URL_RE = re.compile(r"^https?://")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, m: str) -> None:
        self.errors.append(m)

    def warn(self, m: str) -> None:
        self.warnings.append(m)


def load(path: Path, rep: Report, label: str):
    if not path.exists():
        rep.err(f"{label}: 파일 없음 → {path}")
        return None
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        rep.err(f"{label}: YAML 문법 오류 → {e}")
        return None


def check_venues(v: dict, rep: Report) -> tuple[dict[str, dict], set[str]]:
    entries: dict[str, dict] = {}
    grades_used: set[str] = set()
    if v.get("version") != 1:
        rep.err("venues.yaml: version 은 1 이어야 함")
    for key in ("owner", "domain"):
        if not v.get(key):
            rep.warn(f"venues.yaml: {key} 비어 있음 (보고서 헤더에 쓰임)")

    alias_owner: dict[str, str] = {}
    name_owner: dict[str, str] = {}
    short_aliases: list[str] = []
    for section in TYPES:
        items = v.get(section)
        if items is None:
            rep.warn(f"venues.yaml: 섹션 '{section}' 없음 (빈 리스트라도 두는 것을 권장)")
            continue
        if not isinstance(items, list):
            rep.err(f"venues.yaml: '{section}' 은 리스트여야 함")
            continue
        expect_type = section.rstrip("s")
        for i, e in enumerate(items):
            where = f"{section}[{i}]"
            if not isinstance(e, dict):
                rep.err(f"{where}: 항목이 매핑이 아님")
                continue
            vid = e.get("id")
            if not vid or not ID_RE.match(str(vid)):
                rep.err(f"{where}: id 누락 또는 형식 오류 (영문자로 시작, 영숫자/_/- 만) → {vid!r}")
                continue
            where = f"{section}/{vid}"
            if vid in entries:
                rep.err(f"{where}: id 중복")
            entries[vid] = e

            name = e.get("name")
            if not name or not isinstance(name, str):
                rep.err(f"{where}: name 누락")
            else:
                low = name.lower()
                if low in name_owner and name_owner[low] != vid:
                    rep.err(f"{where}: name 이 {name_owner[low]} 와 동일")
                name_owner[low] = vid

            t = e.get("type", expect_type)
            if t != expect_type:
                rep.err(f"{where}: type={t!r} 인데 '{section}' 섹션에 있음")
            g = str(e.get("grade", ""))
            if g not in GRADES.get(t, set()):
                rep.err(f"{where}: grade={g!r} 은 {t} 에 허용되지 않음 (허용: {sorted(GRADES.get(t, []))})")
            grades_used.add(g)
            pr = e.get("priority", "normal")
            if pr not in PRIORITIES:
                rep.err(f"{where}: priority={pr!r} (허용: high/normal/low)")
            if e.get("match", "substring") not in {"substring", "exact"}:
                rep.err(f"{where}: match 는 substring 또는 exact")

            aliases = e.get("aliases")
            if aliases is None:
                rep.warn(f"{where}: aliases 없음 (약칭 알림을 놓칠 수 있음)")
                aliases = []
            if not isinstance(aliases, list):
                rep.err(f"{where}: aliases 는 리스트여야 함")
                aliases = []
            for a in aliases:
                a = str(a)
                k = a.lower()
                if k in alias_owner and alias_owner[k] != vid:
                    rep.err(f"{where}: alias {a!r} 가 {alias_owner[k]} 와 충돌")
                alias_owner[k] = vid
                if k in name_owner and name_owner[k] != vid:
                    rep.err(f"{where}: alias {a!r} 가 {name_owner[k]} 의 name 과 동일")
                if len(a) <= 3:
                    short_aliases.append(f"{vid}:{a}")

            if t in ("journal", "workshop"):
                src = e.get("source")
                if not src or not URL_RE.match(str(src)):
                    rep.err(f"{where}: source URL 필수 (등급 근거)")
            if t == "journal":
                sjr = e.get("sjr")
                if not isinstance(sjr, dict) or not all(k in sjr for k in ("year", "quartile", "category")):
                    rep.err(f"{where}: sjr {{year, quartile, category}} 필수")
                elif g in ("Q1", "Q2") and str(sjr.get("quartile")) != g:
                    rep.err(f"{where}: grade={g} 인데 sjr.quartile={sjr.get('quartile')} — 근거와 불일치")
                elif g == "top" and str(sjr.get("quartile")) not in ("Q1", "Q2") and not e.get("note"):
                    rep.warn(f"{where}: top 인데 SJR {sjr.get('quartile')} — note 로 사유를 남길 것")
            if t == "workshop" and not e.get("colocated"):
                rep.warn(f"{where}: colocated (병설 학회) 비어 있음")
    if short_aliases:
        rep.warn("3글자 이하 alias 는 연도 인접 시에만 매칭됨 (의도된 규칙): " + ", ".join(short_aliases))
    return entries, grades_used


def check_profile(p: dict, grades_used: set[str], rep: Report) -> None:
    if p.get("version") != 1:
        rep.err("profile.yaml: version 은 1 이어야 함")
    u = p.get("user") or {}
    if not u.get("name"):
        rep.err("profile.yaml: user.name 필수")
    r = p.get("research") or {}
    if not r.get("summary"):
        rep.err("profile.yaml: research.summary 필수 (선별 기준)")
    projects = r.get("projects") or []
    if not projects:
        rep.err("profile.yaml: research.projects 최소 1개 (리뷰 표의 행)")
    for i, pj in enumerate(projects):
        if not isinstance(pj, dict) or not pj.get("name") or not pj.get("what"):
            rep.err(f"profile.yaml: research.projects[{i}] 는 name, what 필요")
    if not r.get("keywords_priority"):
        rep.warn("profile.yaml: research.keywords_priority 비어 있음 → 동점 시 임의 선택")

    pol = p.get("policy") or {}
    rbg = pol.get("review_by_grade") or {}
    for g in sorted(grades_used):
        if g not in rbg:
            rep.err(f"profile.yaml: policy.review_by_grade 에 grade {g!r} 없음 (venues 에서 사용 중)")
        elif rbg[g] not in POLICIES:
            rep.err(f"profile.yaml: review_by_grade[{g}]={rbg[g]!r} (허용: full/brief/skip)")
    if not isinstance(pol.get("picks_per_group", 1), int) or pol.get("picks_per_group", 1) < 1:
        rep.err("profile.yaml: policy.picks_per_group 은 1 이상 정수")
    sp = pol.get("self_refine_pass", 4)
    if not isinstance(sp, int) or not (1 <= sp <= 5):
        rep.err("profile.yaml: policy.self_refine_pass 는 1~5")

    gh = p.get("github") or {}
    if not gh.get("repo"):
        rep.err("profile.yaml: github.repo 필수 (예: '{username}/PaperRadar')")
    labels = gh.get("labels") or {}
    colors = labels.get("colors") or {}
    referenced = set(labels.get("always") or [])
    for k in ("by_type", "by_grade", "by_source"):
        referenced |= set((labels.get(k) or {}).values())
    referenced |= set((labels.get("by_keyword") or {}).keys())
    for lab in sorted(referenced):
        if lab not in colors:
            rep.warn(f"profile.yaml: 라벨 {lab!r} 의 color 미지정 → 기본색으로 생성됨")
    al = p.get("alerts") or {}
    if not al.get("gmail_query"):
        rep.err("profile.yaml: alerts.gmail_query 필수")


def summarize(entries: dict[str, dict], p: dict) -> str:
    by = defaultdict(Counter)
    for e in entries.values():
        by[e.get("type")][e.get("grade")] += 1
    rbg = (p.get("policy") or {}).get("review_by_grade") or {}
    lines = ["", "요약"]
    for t in ("conference", "journal", "workshop", "preprint"):
        if t in by:
            parts = ", ".join(f"{g}×{n} ({rbg.get(g, '?')})" for g, n in sorted(by[t].items()))
            lines.append(f"  {t:10} {sum(by[t].values()):3}  → {parts}")
    lines.append(f"  총 {len(entries)} venue")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--venues", default=str(ROOT / "config" / "venues.yaml"))
    ap.add_argument("--profile", default=str(ROOT / "config" / "profile.yaml"))
    a = ap.parse_args()

    rep = Report()
    v = load(Path(a.venues), rep, "venues.yaml")
    p = load(Path(a.profile), rep, "profile.yaml")
    entries: dict[str, dict] = {}
    if isinstance(v, dict):
        entries, grades = check_venues(v, rep)
        if isinstance(p, dict):
            check_profile(p, grades, rep)
    elif v is not None:
        rep.err("venues.yaml: 최상위가 매핑이 아님")

    for w in rep.warnings:
        print(f"WARN  {w}")
    for e in rep.errors:
        print(f"ERROR {e}")
    if isinstance(p, dict):
        print(summarize(entries, p))
    print(f"\n{'실패' if rep.errors else '통과'}: 오류 {len(rep.errors)}, 경고 {len(rep.warnings)}")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
