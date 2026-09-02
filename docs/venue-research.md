# venue 사전 조사 절차 (`setup` 명령이 따르는 프로토콜)

새 분야의 추적 목록을 만들 때 Claude가 수행하는 조사 순서다. 결과는 `config/venues.draft.yaml` 로 나오고, 사람이 검토·가지치기한 뒤 `config/venues.yaml` 로 옮긴다. **조사 없이 등급을 채우지 않는다** — 근거 URL이 없는 항목은 초안에 넣지 않고 "미확인" 목록에 따로 적는다.

## 입력

- `config/profile.yaml` → `research.summary`, `research.keywords_priority`
- (선택) 사용자가 지정한 KIISE 소분야 (예: `CV, ML`), Scimago 카테고리 (예: `Artificial Intelligence`)

## 1단계 — 학회 (S / A)

1. KIISE 2024 목록 PDF를 연다: `https://www.kiise.or.kr/TopConferences/data/SW분야우수학술대회목록_2024.pdf`
   (또는 `https://csworldrank.kiise.or.kr/` 에서 소분야 필터)
2. 사용자 분야에 해당하는 소분야(ML, NLP, CV, SE, OS, Net, Arch, HPC, DB, Sec, PL, DM, CGI, Bio, Alg, Robot)의 최우수→S, 우수→A 로 옮긴다.
3. 각 학회의 정식 명칭은 dblp(`https://dblp.org/db/conf/<key>/index.html`)에서 확인한다. 약칭만 있고 정식 명칭이 불확실하면 "미확인".
4. KIISE에 없지만 분야 핵심인 학회(예: e-Energy, IGSC)는 `note`에 "KIISE 미등재" 를 남기고 A로 넣는다. S는 KIISE 최우수에만 준다.
5. 교차 확인(선택): CORE(`https://portal.core.edu.au/conf-ranks/`)는 시스템 분야 오분류가 많으니 참고만. CSRankings는 매우 좁은 목록.

## 2단계 — 저널 (top / Q1 / Q2)

JCR(Clarivate)은 유료다. **Scimago SJR**을 근거로 쓰고 `sjr: {year, quartile, category}` 를 기록한다.

1. Scimago 카테고리 페이지에서 최신 연도 Q1·Q2 저널을 훑는다:
   `https://www.scimagojr.com/journalrank.php?category=<code>&year=<YYYY>`
   (카테고리 코드는 페이지의 드롭다운에서. 예: 1705 Computer Networks and Communications, 1708 Hardware and Architecture, 1712 Software, 1702 Artificial Intelligence)
2. 후보 저널마다 저널 페이지(`journalsearch.php?q=<id>&tip=sid`)를 열어 **카테고리별 분위**를 확인한다. 카테고리마다 분위가 다르므로 사용자 분야에 맞는 카테고리의 분위를 `grade`로 쓴다.
3. `top`은 분위와 별개로 "분야에서 최상위로 통용되는 저널"이다. 사용자에게 확인받거나, 해당 분야 대학원 졸업요건·탑저널 목록에서 근거를 찾는다. 근거 없으면 Q1로 둔다.
4. 잡음이 큰 대형 저널(IEEE Access, Scientific Reports 등)은 기본 제외하고 `catalog`에만 사유와 함께 남긴다.
5. 개명·통합된 저널(예: IEEE/ACM ToN → IEEE TNET)은 구·신 명칭을 모두 `aliases`에 넣는다.

## 3단계 — 워크숍 (W)

1. 검색: `"<분야 키워드>" workshop co-located <탑티어 학회명>` 및 `site:dblp.org <워크숍명>`
2. 각 워크숍의 공식 페이지에서 **최근 개최 연도**를 확인한다. 2년 이상 개최 근거가 없으면 `status: inactive` 로 카탈로그에만 두고, 추적 목록에는 `priority: low` + note 로 넣거나 제외한다.
3. `colocated` 에 병설 학회를 적는다. 단독 개최면 "단독".
4. 워크숍 논문은 보통 4~6쪽이라 "전체 리뷰"가 과할 수 있다. 정책은 profile.yaml 의 `review_by_grade.W` 로 조정.

## 4단계 — 프리프린트

arXiv 카테고리를 `categories` 에 적는다. 알림 이메일에 카테고리가 없는 경우가 많으므로, 실제 필터는 제목·초록 키워드로 이뤄진다는 점을 사용자에게 알린다.

## 5단계 — 초안 출력과 검증

1. `config/venues.draft.yaml` 로 저장. 각 항목에 `source` URL 필수. 확신이 낮은 항목은 `note: "확인 필요: ..."`.
2. 별도 절 `## 미확인` 에 근거를 못 찾은 후보를 나열한다.
3. `python scripts/validate.py --venues config/venues.draft.yaml` 통과 확인.
4. 사용자가 실제 알림 이메일의 출처 문자열 3~5개를 주면 `python scripts/match.py` 로 매칭 여부를 보여준다.
5. 사용자 검토 후 `venues.yaml` 로 승격.

## 결과 보고 형식

```
🔎 venue 조사 결과 — <분야>
- 학회: S n개, A n개  (KIISE 2024 <소분야> 기준)
- 저널: top n, Q1 n, Q2 n  (Scimago SJR <연도>)
- 워크숍: n개 (활성 n, 휴면 n)
- 미확인: n개 → 아래 목록
- 초안: config/venues.draft.yaml  (validate 통과 / 실패 사유)
```
