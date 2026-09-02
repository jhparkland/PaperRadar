#!/usr/bin/env python3
"""
match.py — 출처 문자열이 어느 venue 로 인식되는지 확인한다.

  python scripts/match.py "Proceedings of the 2024 ACM Symposium on Cloud Computing"
  python scripts/match.py --all "IEEE Transactions on Cloud Computing, 2026"   # 후보 전부
  python scripts/match.py --test                                               # 내장 픽스처 회귀 테스트
  python scripts/match.py --venues path/to/venues.yaml "..."
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from matcher import load_venues, match_one, match_all, is_truncated  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# (출처 문자열, 기대 venue id 또는 None)
FIXTURES = [
    ("Proceedings of the 2024 ACM Symposium on Cloud Computing", "SoCC"),
    ("SoCC '24: Proceedings of the 2024 ACM Symposium on Cloud Computing", "SoCC"),
    ("IEEE Transactions on Cloud Computing, 2026", "TCC"),
    ("IEEE Transactions on Parallel and Distributed Systems 37 (2), 2026", "TPDS"),
    ("Future Generation Computer Systems, 2025", "FGCS"),
    ("Cluster Computing, 2026", "ClusterComputing"),
    ("2026 IEEE International Conference on Cluster Computing (CLUSTER)", "CLUSTER"),
    ("SC24: International Conference for High Performance Computing, Networking, Storage and Analysis", "SC"),
    ("Proceedings of SC '24", "SC"),
    ("Proceedings of the International Conference for High Performance Computing, Networking, Storage and Analysis", "SC"),
    ("Scientific Reports, 2026", None),                       # SC 오탐 금지
    ("Applied Energy 380, 2026", "AppliedEnergy"),
    ("Energy, 2026", "Energy"),
    ("Energy and Buildings, 2025", None),                     # 추적 안 함
    ("Renewable and Sustainable Energy Reviews, 2026", "RSER"),
    ("2026 IEEE International Parallel and Distributed Processing Symposium (IPDPS)", "IPDPS"),
    ("Proceedings of the 2026 ACM International Conference on Future and Sustainable Energy Systems", "eEnergy"),
    ("e-Energy '25", "eEnergy"),
    ("arXiv preprint arXiv:2501.01234, 2025", "arXiv"),
    ("Workshop on Sustainable Computer Systems (HotCarbon), 2025", "HotCarbon"),
    ("Proceedings of the 20th European Conference on Computer Systems", "EuroSys"),
    ("EuroSys '26", "EuroSys"),
    ("IEEE/ACM Transactions on Networking, 2024", "TNET"),
    ("IEEE Transactions on Networking, 2026", "TNET"),
    ("ACM Computing Surveys, 2026", "CSUR"),
    ("Microservices Journal, 2026", None),                    # MICRO 오탐 금지
    ("IEEE Access, 2026", None),                              # 의도적 제외
    ("Journal of Supercomputing, 2026", "TJSC"),
    ("The Journal of Supercomputing 82 (1), 2026", "TJSC"),
    ("International Conference on Machine Learning, 2026", "ICML"),
    ("ICS '25: Proceedings of the 39th ACM International Conference on Supercomputing", "ICS"),
    ("Proceedings of the 2026 IEEE International Conference on Cloud Computing (CLOUD)", "CLOUD"),
    ("Cloud Computing Magazine", None),
    # --- 실제 구글 스칼라 알림에서 가져온 출처 문자열 (2026-09) ---
    ("International Journal of Artificial …, 2026", None),
    ("arXiv preprint arXiv …, 2026", "arXiv"),
    ("… Conference on Joint *Cloud Computing *(JCC), 2026", None),   # IEEE JCC — 미추적, * 는 Gmail 강조
    ("IEEE Internet of Things Journal, 2026", "IoTJ"),
    ("… -14th IEEE International Conference on Cloud …, 2026", None), # 잘림 → 링크로 확인 대상
    ("SN Computer Science, 2026", None),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", help="출처 문자열")
    ap.add_argument("--venues", default=str(ROOT / "config" / "venues.yaml"))
    ap.add_argument("--all", action="store_true", help="걸리는 후보 전부 표시")
    ap.add_argument("--test", action="store_true", help="내장 픽스처 회귀 테스트")
    a = ap.parse_args()

    venues = load_venues(a.venues)

    if a.test:
        fails = 0
        for src, want in FIXTURES:
            got = match_one(src, venues)
            got_id = got.venue.id if got else None
            ok = got_id == want
            fails += 0 if ok else 1
            print(f"{'PASS' if ok else 'FAIL'}  {src!r:100} → {got_id!s:16} (기대: {want})")
        print(f"\n{len(FIXTURES) - fails}/{len(FIXTURES)} 통과")
        return 1 if fails else 0

    if not a.source:
        ap.print_help()
        return 2

    if a.all:
        res = match_all(a.source, venues)
        if not res:
            print("매칭 없음 → pass")
            return 1
        for m in res:
            print(m)
        return 0

    m = match_one(a.source, venues)
    if not m:
        if is_truncated(a.source):
            print("매칭 없음 — 출처가 '…' 로 잘려 있음 → 링크를 열어 정식 명칭 확인 후 재판정")
        else:
            print("매칭 없음 → pass")
        return 1
    print(m)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
