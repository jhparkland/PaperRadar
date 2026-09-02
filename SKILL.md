---
name: paperradar
description: >
  구글 스칼라 알림 이메일에서 논문을 수집하고, 사용자가 config/venues.yaml 에 등록한 관심 학회·저널(탑티어/Q1/Q2)·워크숍·arXiv 에
  해당하는 논문만 선별해 리뷰를 GitHub 이슈로 자동 생성하는 스킬. 어떤 venue 를 볼지, 어떤 등급을 전체 리뷰/요약/pass 할지는
  전부 저장소의 설정 파일이 정한다 (스킬에 하드코딩된 목록 없음). PDF 는 Claude in Chrome 브라우저로만 확보하고 web_fetch 는 쓰지 않는다.
  "알림 처리해줘", "논문 리뷰 만들어줘", "scholar alert", "paper review", "지난 N일치", "venue 설정해줘", "venues setup",
  "학회 목록 조사", "설정 검증", "매칭 확인", "이 DOI 들 PDF 받아줘", "Issue #N 다시 리뷰" 같은 요청에 사용한다.
  논문 PDF 다운로드, 학술 리뷰 작성, GitHub 이슈 생성, 논문 추적 설정과 관련된 모든 요청에 트리거된다.
---

# PaperRadar — 관심 venue 기반 논문 리뷰 자동화

## 0. 설정 (이 블록만 바꾸면 다른 사람·다른 저장소에서 그대로 동작)

```yaml
repo: "{username}/PaperRadar"      # {username} 은 GitHub MCP get_me 로 채운다
branch: main
paths:
  venues:   config/venues.yaml      # 어디를 볼지
  profile:  config/profile.yaml     # 누가, 무엇을 우선하고, 어떻게 처리할지
  template: templates/review.md     # 이슈 본문 템플릿
  research: docs/venue-research.md  # setup 명령 절차
  trouble:  docs/troubleshooting.md # 실패 방지 규칙 (이 문서 §7 과 동일)
```

### 설정 로드 순서 (모든 명령의 첫 단계)

1. **GitHub MCP** `get_file_contents(owner, repo, path)` 로 `venues.yaml`, `profile.yaml` 을 읽는다.
2. 실패하면 **Claude in Chrome** 으로 `https://github.com/{repo}/blob/{branch}/{path}` 를 열어 `get_page_text` 로 읽는다 (private 저장소는 브라우저에 GitHub 로그인 필요).
3. 그래도 실패하면 사용자에게 두 파일을 **대화에 첨부**해 달라고 요청하고 대기한다.
4. **내장 기본 목록으로 대체하지 않는다.** 설정 없이는 실행하지 않는다.

### 설정 검증 (실행 전 필수)

- 셸이 있으면 `python scripts/validate.py` 를 돌린다. 오류가 하나라도 있으면 **실행하지 않고** 오류 목록을 보여준다.
- 셸이 없으면 아래를 직접 확인한다: `version: 1` / 모든 항목에 `id`, `name`, `type`, `grade` / grade 가 type 에 맞음(conference: S·A, journal: top·Q1·Q2, workshop: W, preprint: P) / id 중복 없음 / journal·workshop 에 `source` URL / `profile.policy.review_by_grade` 가 venues 에서 쓰인 모든 grade 를 덮음 / `profile.github.repo` 존재.
- 통과하면 보고에 요약을 남긴다: `venue 72개 (학회 35 · 저널 25 · 워크숍 11 · arXiv 1) — 정책: S/A/top/Q1/W/P full, Q2 brief`.

---

## 1. 명령

| 사용자 표현 | 명령 | 동작 |
|---|---|---|
| "알림 처리해줘", "논문 리뷰 만들어줘", "지난 N일치" | **run** | §3~§6 실행. 기본 기간은 `profile.alerts.default_days`. |
| "venue 설정해줘", "학회 목록 조사", "venues setup [분야]" | **setup** | `docs/venue-research.md` 절차로 조사 → `config/venues.draft.yaml` 초안 + 미확인 목록. 사람이 검토 후 승격. |
| "설정 검증", "매칭 확인 '<출처 문자열>'" | **check** | validate + match 결과 표시. 안 잡히는 출처는 aliases 추가안을 제시. |
| "이 DOI 들 PDF 받아줘 …" | **download** | DOI 목록 → §5 레시피로 브라우저 다운로드. 파일명 `{year}_{venue}_{title-hyphenated}.pdf`. |
| "Issue #N 다시 리뷰" | **rereview** | 이슈에서 링크 추출 → §5 부터 재실행 → 기존 이슈에 코멘트. |
| "carbon 관련만", "저널만", "워크숍 빼고" | run 의 필터 | §4 선별 후 type/grade/키워드로 추가 필터. |

---

## 2. 원칙

1. **venues.yaml 에 없는 출처는 pass.** 인식은 하되 보고에 "미등록 venue: n건 (목록)" 으로만 남긴다. 미등록 venue 가 반복되면 등록을 제안한다.
2. **처리 방식은 grade → profile.policy.review_by_grade** 로만 정한다. full = 전문 시도 → 전체 리뷰 → self-refine → 이슈, brief = 초록 요약 이슈, skip = 보고에만.
3. **키워드 그룹당 `picks_per_group` 편.** 동점은 `tie_break` 순서: grade(`grade_order`) → venue priority → `keywords_priority` 매칭 수.
4. **브라우저 전용.** PDF·본문은 Claude in Chrome 으로만. web_fetch/WebFetch 는 초록 확인용으로도 쓰지 않는다 (ACM 403, IEEE 인증 필요).
5. **로그인·도구 끊김·페이월은 우회 전에 사용자에게 먼저 알린다.**
6. **확인 못 한 것을 완료라 쓰지 않는다.** 브라우저 다운로드는 사용자 확인이 완료 판정이다.
7. **한 논문의 실패가 전체를 멈추지 않는다** (`continue_on_error`). 실패는 최종 보고에 원인과 함께 남긴다.
8. **중복 이슈 금지.** 생성 전 검색.
9. **피상적 리뷰 금지.** 수치·방법·baseline 을 인용한다.
10. **매 단계 간결히 보고한다.** 무엇을 했고 결과가 어땠는지.

---

## 3. STEP 1 — 이메일 수집

Gmail MCP: `{profile.alerts.gmail_query} after:{N}d` (기본 N = `default_days`).

```
📬 이메일 수집
- 쿼리: from:scholaralerts-noreply@google.com after:1d
- 알림 이메일: X개 (키워드 그룹: "carbon-aware computing", "green cloud", …)
- 논문 후보: Y개
```
0건이면 "최근 N일간 알림 없음" 으로 종료.

---

## 4. STEP 2 — 추출 · 매칭 · 선별

### 4-1. 추출 (이메일당 여러 논문)
제목(링크 텍스트) / 저자 / **출처 문자열**(학회·저널명이 적힌 줄, 연도 포함) / DOI(`10.\d{4,}/\S+` 패턴, 없으면 `미확인`) / 링크(arXiv > 직접 PDF > 출판사 > Scholar) / 키워드 그룹(이메일 제목).

### 4-2. venue 매칭 — `scripts/matcher.py` 와 동일한 규칙
1. `name` 은 대소문자 무시, 단어 경계 부분 일치.
2. `aliases`: 전부 대문자면 대소문자 구분(`CLUSTER` ≠ `Cluster Computing`); **3글자 이하는 연도가 붙은 형태에서만**(`SC '24`, `SC24`, `ICS 2025`); 그 외 대소문자 무시.
3. `match: exact` 항목은 연도·권호를 뗀 문자열이 정확히 같을 때만 (예: 저널 `Energy`).
4. 복수 매칭 시 **가장 긴 문자열이 일치한 항목**이 이긴다.
5. arXiv 는 `preprints` 의 aliases(`arxiv.org`, `arXiv:`)로 잡고, `categories` 가 있으면 제목·초록 키워드로 해당 분야인지 판단한다.
6. **출처가 `…` 로 잘려 있으면** (예: `… -14th IEEE International Conference on Cloud …, 2026`) 매칭 실패로 끝내지 말고 **논문 링크를 열어 정식 학회·저널명을 확인한 뒤** 다시 판정한다. Gmail 평문의 `*강조*` 기호는 무시한다.
셸이 있으면 `python scripts/match.py "<출처>"` 로 확인한다.

### 4-3. 선별
```
📊 선별
- 후보 Y개 → 등록 venue 매칭 A개 / 미등록 pass B개
- 정책: full a개 · brief b개 · skip c개

🎯 키워드별 선택
["carbon-aware computing"]
  ✅ "제목" — SoCC(A, full) · 이유: CAFTM 의 시간 이동과 직접 관련
  ❌ "제목" — arXiv(P) · 이유: 동점에서 grade_order 상 SoCC 우선
["green cloud"]
  ✅ "제목" — TCC(top, full)
미등록 venue (pass): "Journal of Foo" ×2, "BarConf 2026" ×1  ← 반복되면 등록 제안
```

---

## 5. STEP 3 — 본문 확보 (Claude in Chrome 전용)

### 5-1. 접근
- **arXiv**: `https://arxiv.org/abs/{ID}` → `https://arxiv.org/pdf/{ID}` → `get_page_text`.
- **IEEE Xplore**: DOI navigate → 도착 URL `…/document/{arnumber}` 에서 번호 추출 → 페이지에 "Access provided by: …" 없으면 🔐 로그인 요청 → PDF: `https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber={arnumber}&ref=`
- **ACM DL**: DOI navigate → "OPEN ACCESS" 표시 확인 → PDF: `https://dl.acm.org/doi/pdf/{DOI}` (OA 아니고 기관 세션 없으면 🔐).
- **Springer / Elsevier / Wiley / USENIX**: 랜딩 페이지에서 PDF 링크 `find`. USENIX 는 `https://www.usenix.org/system/files/{conf}{yy}-{lastname}.pdf` 형식.
- 본문 읽기는 `get_page_text`. 응답이 잘리면 Abstract~Method 까지만 분석하고 리뷰에 "부분 분석" 명시.

### 5-2. 다운로드 레시피 (파일을 사용자 PC 에 저장할 때 — download 명령, 또는 요청 시)
반드시 이 순서. 이유는 `docs/troubleshooting.md` §A.
```
1. navigate → 논문 랜딩 페이지 (PDF URL 과 같은 origin)          ← 파일 1개당 1회. 루프 금지
2. javascript_exec:
     const r=await fetch(PDF_URL,{credentials:'include'}); const b=await r.blob();
     // b.type 이 'application/pdf' 이고 b.size > 20000 인지 확인. 아니면 실패 처리
     const a=document.createElement('a'); a.id='pr-dl';
     a.href=URL.createObjectURL(b); a.download=FILENAME; a.textContent='PRDLBTN';
     a.style.cssText='position:fixed;top:300px;left:300px;width:500px;height:150px;z-index:2147483647;background:#c00;color:#fff';
     document.body.appendChild(a); ({size:b.size,type:b.type})
3. find "PRDLBTN link" → ref
4. computer left_click ref=<ref>                                    ← 좌표 클릭 금지 (DPR 오차)
5. javascript_exec: document.getElementById('pr-dl')?.remove()
```
- `<a href=서버URL download>` 직접 링크 금지 — 서버 Content-Disposition 이 파일명을 덮어쓴다.
- 파일명: `{year}_{venue.id}_{제목 공백→하이픈, 콜론·쉼표 등 제거}.pdf`.
- 끝나면 파일 목록을 보여주고 **사용자에게 저장 확인을 요청**한다. 확인 전에는 "완료"라 쓰지 않는다.

### 5-3. 로그인 대기
```
🔐 로그인 필요
- 사이트: IEEE Xplore
- 논문: "…"
- 브라우저에서 기관 인증 후 "계속" 이라고 말씀해 주세요.
```
"계속" 후 같은 URL 에서 재시도. 두 번 실패하면 초록 기반으로 전환할지 묻는다.

### 5-4. 도구 끊김
`No such tool available: mcp__claude-in-chrome__…` 이면 즉시 중단하고 알린다: 사이드 패널 재시작 → 확장 재로드 → 새 세션. web_fetch 로 우회하지 않는다.

### 상태 리포트 (논문마다)
```
📄 [2/5] "제목…" — TCC (top · full)
├─ 소스: IEEE Xplore (arnumber 10793176)
├─ 브라우저: ✅ 전문 확보 (Access provided by: DONG A UNIVERSITY)
└─ 리뷰 모드: 전체
```

---

## 6. STEP 4 — 리뷰 작성 + Self-Refine

- 본문 템플릿은 `templates/review.md`. "내 연구와의 관련성" 표는 `profile.research.projects` 를 행으로 펼친다.
- brief 정책이면 "논문 정보 · 논문 요약 · 읽어볼 가치" 세 절만.
- 품질 기준: 수치 인용("15% carbon reduction" ○ / "성능 향상" ×), 차별점 명시, 프로젝트별 **구체적 통합 방안**, 비판적 한계, 초록 기반이면 "~로 추정됨".

Self-Refine (full 만): 5개 항목(수치 구체성 / 프로젝트 연결점 / 한계 분석 / 가치 근거 / 추정 명시) 중 `profile.policy.self_refine_pass` 개 이상 ✅ 면 등록. 미달 시 1회 재작성 → 그래도 미달이면 채팅에 출력하고 사용자 판단 요청.
```
🔄 Self-Refine "제목"
- 수치 구체성: ⚠️ → "32.9% 절감, 100-node k8s" 추가
- CAFTM 연결점: ✅   - 한계: ✅   - 가치 근거: ✅   - 추정 명시: ✅
→ 4/5 통과, 등록 진행
```

---

## 7. STEP 5 — GitHub 이슈

1. `get_me` 로 `{username}` 치환 → `profile.github.repo`.
2. **중복 검색**: 제목 핵심어 2~3개로 `search_issues`. 있으면 새 이슈 대신 코멘트로 갱신.
3. 라벨: `labels.always` + `by_type[type]` + `by_grade[grade]` + `by_source[…]` + `by_keyword` 매칭(제목+초록 소문자 부분 일치). 없는 라벨은 `colors` 로 생성 시도, 실패는 무시.
4. 제목: `{issue_title_prefix} {제목 앞 issue_title_max 자}`.
5. 생성 실패 → PAT `repo` 스코프 안내 + 리뷰 본문을 채팅에 그대로 출력(유실 방지).

---

## 8. STEP 6 — 최종 보고

```
📊 PaperRadar 결과
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 기간: after:1d · 이메일 X · 후보 Y
🔍 매칭: 등록 venue A (S n · A n · top n · Q1 n · Q2 n · W n · P n) · 미등록 pass B
🎯 선택: 키워드 그룹 k개 → k편
✅ 리뷰: 전문 n · 초록 n · brief n
🔗 이슈: #12 [TCC·top] 제목 (full-text) / #13 [SoCC·A] 제목 (abstract-only)
⚠️ 주의: 로그인 필요 사이트 / DOI 미확인 / 미등록 venue 반복 (등록 제안: "Journal of Foo")
❌ 실패: 제목 — 원인
```

---

## 9. 예외 처리

| 상황 | 대응 |
|---|---|
| 설정 파일 로드 실패 | §0 순서대로 시도 → 첨부 요청. 기본 목록 대체 금지. |
| validate 오류 | 실행 중단, 오류 목록 표시. |
| Gmail MCP 인증 실패 | "Gmail MCP 를 다시 연결해 주세요" 후 중단. |
| 브라우저 미실행·끊김 | §5-4. web_fetch 폴백 금지. |
| 로그인 필요 | §5-3. |
| 페이월 (로그인 후에도) | 초록 기반 전환 (사용자 동의), `abstract-only` 라벨. |
| 응답 잘림 | Abstract~Method 만 분석, "부분 분석" 명시. |
| GitHub API 실패 | PAT 안내, 리뷰는 채팅 출력. |
| 이메일 없음 | "최근 N일간 알림 없음". |
| 단일 논문 실패 | 기록 후 다음 논문. |
| 10편 이상 | 5편 배치, 배치마다 중간 보고. |
| 미등록 venue 가 3회 이상 반복 | 보고 끝에 "등록 제안" — aliases 초안까지 제시. |
| 다운로드 확인 불가 | §5-2 마지막 항목. 사용자 확인을 완료 판정으로 삼는다. |

---

## 10. setup 명령 요약 (상세는 docs/venue-research.md)

1. `profile.research.summary` · `keywords_priority` 를 읽는다. 분야가 비어 있으면 사용자에게 두 줄로 묻는다.
2. 학회: KIISE 2024 목록 PDF(`https://www.kiise.or.kr/TopConferences/data/SW분야우수학술대회목록_2024.pdf`) 의 해당 소분야 → 최우수 S / 우수 A. 정식 명칭은 dblp 로 확인. KIISE 미등재 핵심 학회는 note 와 함께 A.
3. 저널: Scimago 카테고리 페이지 → 후보 저널 페이지에서 **카테고리별 분위** 확인 → `sjr:{year,quartile,category}` + `source` 기록. JCR 은 유료라 쓰지 않는다. top 은 근거(분야 탑저널 목록) 있을 때만.
4. 워크숍: 공식 페이지에서 최근 개최 연도 확인. 2년 이상 근거 없으면 inactive.
5. `config/venues.draft.yaml` 저장 + `## 미확인` 목록. validate 통과 확인 → 사용자 검토 → `venues.yaml` 승격.
6. **근거 URL 없는 항목은 초안에 넣지 않는다.**
