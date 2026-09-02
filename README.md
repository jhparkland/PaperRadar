# PaperRadar

구글 스칼라 알림 이메일에서 **내가 등록한 학회·저널·워크숍**에 실린 논문만 골라, Claude 가 읽고 리뷰를 GitHub 이슈로 남기는 도구.
어디를 볼지(`venues.yaml`)와 어떻게 처리할지(`profile.yaml`)는 전부 설정 파일이 정한다. 스킬 본체에는 학회 목록이 없다.

- 학회는 **KIISE 2024 우수학술대회 목록**(최우수 S / 우수 A) 기준
- 저널은 **탑티어 + Scimago SJR Q1/Q2**, 항목마다 근거 URL
- 워크숍·arXiv 포함, 등급별로 전체 리뷰 / 요약 / pass 를 정함
- 분야가 다르면 `venues.yaml` 만 바꾼다. Claude 에게 `venues setup` 을 시키면 조사 초안을 만들어 준다

> 이 저장소는 **정현(carbon-aware cloud computing)** 의 설정이 들어 있는 상태다. 다른 분야라면 [§3 내 분야로 바꾸기](#3-내-분야로-바꾸기) 를 따른다.

---

## 1. 5분 설정

### 준비물
- Claude (Cowork 또는 claude.ai) + 연결된 **Gmail MCP**, **GitHub MCP**, **Claude in Chrome** 확장
- 구글 스칼라 키워드 알림이 Gmail 로 오고 있을 것
- (선택) Python 3.10+ 와 `pip install pyyaml` — 설정 검사용. 없어도 Claude 가 대신 검사한다

### 순서
```bash
# 1. 이 저장소를 내 계정으로 (fork 또는 template)
git clone https://github.com/<나>/PaperRadar && cd PaperRadar

# 2. 설정 두 파일 채우기 — 처음이면 예시에서 복사
cp config/examples/venues.example.yaml  config/venues.yaml    # 이미 있으면 그대로 편집
cp config/examples/profile.example.yaml config/profile.yaml

# 3. 검사 (오류 0 이어야 실행됨)
python scripts/validate.py

# 4. 실제 알림의 출처 문자열이 잡히는지 확인
python scripts/match.py "IEEE Transactions on Cloud Computing, 2026"
python scripts/match.py --test          # 내장 회귀 테스트

# 5. 커밋 · 푸시
git add config && git commit -m "my venues" && git push
```

### 스킬 설치
`SKILL.md` 를 Claude 스킬로 등록한다 (claude.ai → 설정 → 스킬 → 새 스킬 → 내용 붙여넣기, 또는 Cowork 에서 "이 SKILL.md 를 스킬로 저장해줘"). 스킬 §0 의 `repo:` 를 내 저장소로 바꾼다.

### 첫 실행
Claude 에게: **"알림 처리해줘"** (기본 하루치) 또는 **"지난 3일치 처리해줘"**.
Claude 는 저장소에서 설정을 읽고 → 검증 → 이메일 수집 → 매칭·선별 → 브라우저로 본문 확보 → 리뷰 → 이슈 생성 → 보고 순으로 진행하고, 로그인이 필요하면 멈춰서 알려준다.

---

## 2. 파일 구조

```
PaperRadar/
├── SKILL.md                     # Claude 스킬 본체. §0 의 repo 한 줄만 바꾸면 됨
├── config/
│   ├── venues.yaml              # ★ 어디를 볼지 — 학회·저널·워크숍·arXiv
│   ├── profile.yaml             # ★ 나는 누구, 무엇을 우선, 등급별 처리 정책, GitHub 라벨
│   └── examples/                # 빈 템플릿 (주석 포함)
├── catalog/                     # 참조용 전체 카탈로그 (추적 목록 아님). 여기서 복사해 venues.yaml 에 넣는다
│   ├── systems-conferences.yaml # KIISE 2024 OS/Net/Arch/HPC + BK21+ IF / CORE / CSRankings 교차표
│   ├── systems-journals.yaml    # 저널 36종, SJR 2025 카테고리별 분위
│   └── systems-workshops.yaml   # 워크숍 16종, 활성 여부
├── templates/review.md          # 이슈 본문 템플릿
├── scripts/
│   ├── validate.py              # 설정 검사 (오류면 실행 차단)
│   ├── match.py / matcher.py    # 출처 문자열 → venue 매칭 확인
│   └── get_papers.ps1           # DOI/URL 목록 → PDF 일괄 다운로드 (Windows, 학교망)
└── docs/
    ├── venue-research.md        # setup 명령의 조사 절차
    └── troubleshooting.md       # 실제로 겪은 실패와 확정된 대응
```

---

## 3. 내 분야로 바꾸기

1. `config/profile.yaml` 의 `user`, `research.summary`, `research.projects`, `research.keywords_priority` 를 내 것으로.
2. `config/venues.yaml` 을 비우고 내 분야 항목을 채운다. 두 가지 길:
   - **이미 조사된 분야(시스템·클라우드·에너지)** → `catalog/*.yaml` 에서 복사
   - **새 분야** → Claude 에게 **"venues setup"** 이라고 시킨다. `docs/venue-research.md` 절차대로 KIISE 목록·Scimago·워크숍 페이지를 조사해 `config/venues.draft.yaml` 초안과 미확인 목록을 만들어 준다. 검토 후 `venues.yaml` 로 승격.
3. `python scripts/validate.py` 통과 확인.
4. 알림 이메일에서 출처 문자열을 몇 개 복사해 `python scripts/match.py "…"` 로 잡히는지 확인. 안 잡히면 `aliases` 에 추가.
5. `profile.yaml` 의 `github.labels.by_keyword` 를 내 주제로 바꾼다.

같은 스킬을 연구실 전원이 쓰고, **저장소만 각자** 가지면 된다.

---

## 4. venues.yaml 작성법

### 항목 필드
| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ○ | 영문자로 시작, 영숫자·`_`·`-`. 라벨·로그·파일명에 쓰임 |
| `name` | ○ | 정식 명칭. 알림의 출처 문자열과 1차 대조 |
| `aliases` | 권장 | 약칭·변형 표기. 없으면 정식 명칭만 매칭 |
| `type` | ○ | `conference` / `journal` / `workshop` / `preprint` |
| `grade` | ○ | conference `S`/`A` · journal `top`/`Q1`/`Q2` · workshop `W` · preprint `P` |
| `priority` | | `high`/`normal`/`low` (기본 normal). 키워드 그룹당 1편 고를 때 가중치 |
| `source` | journal·workshop 필수 | 등급 근거 URL (Scimago 저널 페이지, 워크숍 공식 페이지) |
| `sjr` | journal 필수 | `{year, quartile, category}`. `grade` 가 Q1/Q2 면 `quartile` 과 같아야 함 |
| `colocated` | workshop | 병설 학회 |
| `match` | | `exact` 로 두면 연도·권호를 뗀 문자열이 정확히 같을 때만 (일반 단어 이름용, 예: 저널 `Energy`) |
| `categories` | preprint | arXiv 카테고리. 비우면 전체 |
| `note` | | 사람용 메모 |

### 매칭 규칙 (`scripts/matcher.py`)
1. `name` 은 대소문자 무시, 단어 경계 기준 부분 일치. `Proceedings of the …`, `, 2026`, `37 (2)` 같은 꼬리는 무시된다.
2. `aliases`
   - **전부 대문자면 대소문자 구분** — `CLUSTER` 는 `IEEE CLUSTER` 에만 걸리고 `Cluster Computing` 저널에는 안 걸린다.
   - **3글자 이하는 연도가 붙은 형태에서만** — `SC` 는 `SC '24`, `SC24`, `SC 2024` 에만. `Scientific Reports` 에는 안 걸린다.
   - 그 외는 대소문자 무시.
3. 여러 항목이 걸리면 **가장 긴 문자열이 일치한 항목**이 이긴다 (`Applied Energy` > `Energy`).
4. 걸리는 항목이 없으면 pass. 보고서의 "미등록 venue" 에 나온다.
5. 구글 스칼라가 출처를 `…` 로 자른 경우(자주 있음) Claude 가 논문 링크를 열어 정식 명칭을 확인한 뒤 다시 판정한다. Gmail 이 넣는 `*강조*` 는 무시된다.

### 등급의 뜻
| grade | 근거 | 기본 정책 |
|---|---|---|
| `S` | KIISE 2024 최우수 | full |
| `A` | KIISE 2024 우수, 또는 KIISE 미등재지만 분야 핵심 (note 필수) | full |
| `top` | 분야에서 최상위로 통용되는 저널 (평판). SJR 과 무관 | full |
| `Q1` / `Q2` | Scimago SJR 최신 연도, 내 분야 카테고리 기준 | full / brief |
| `W` | 워크숍 (활성 여부 확인) | full |
| `P` | arXiv | full |

**BK21 에 대해**: 4단계 BK21 은 NRF 공식 학회 명단이 없다. "BK21 학회" 는 실무상 KIISE 2024 목록을 뜻한다. 근거는 `catalog/README.md`.
**JCR 에 대해**: 유료라 쓰지 않는다. SJR 분위는 카테고리마다 다르므로 `sjr.category` 를 반드시 적는다.

---

## 5. profile.yaml 작성법

| 블록 | 무엇을 정하나 |
|---|---|
| `user` | 이름·소속·언어 |
| `research.summary` | 두세 문장. Claude 가 "이 논문이 내 연구와 어디서 만나는지" 판단하는 근거 |
| `research.projects` | 리뷰의 "내 연구와의 관련성" 표 **행**. name + what |
| `research.keywords_priority` | 동점 시 관련성 순서 |
| `policy.review_by_grade` | grade → `full` / `brief` / `skip` |
| `policy.picks_per_group` | 알림 키워드 그룹당 몇 편 (기본 1) |
| `policy.tie_break`, `grade_order` | 동점 처리 |
| `policy.self_refine_pass` | 5개 체크 중 통과 기준 (기본 4) |
| `alerts.gmail_query` | 스칼라 알림 검색식 |
| `github.repo`, `labels` | 이슈 저장소와 라벨 규칙. `{username}` 은 자동 치환 |
| `pdf` | 파일명 규칙, 기관 인증 메모, (선택) 서버 동기화 |

---

## 6. 명령어

| Claude 에게 | 하는 일 |
|---|---|
| `알림 처리해줘` / `지난 N일치 처리해줘` | 수집 → 선별 → 리뷰 → 이슈 |
| `carbon 관련만` / `저널만` / `워크숍 빼고` | 위에 필터 추가 |
| `venues setup` / `학회 목록 조사해줘` | 내 분야 venue 조사 초안 생성 |
| `설정 검증해줘` / `매칭 확인 "출처"` | validate + match |
| `이 DOI 들 PDF 받아줘` + 목록 | 브라우저로 PC 다운로드 폴더에 저장 (파일명 규칙 적용) |
| `Issue #N 다시 리뷰해줘` | 재리뷰 후 기존 이슈에 코멘트 |

---

## 7. 스크립트

```bash
python scripts/validate.py                        # 설정 검사
python scripts/match.py "출처 문자열"              # 어느 venue 로 잡히는지
python scripts/match.py --all "출처 문자열"        # 걸리는 후보 전부
python scripts/match.py --test                    # 회귀 테스트 33건
```

```powershell
# DOI/URL 목록 → PDF 일괄 다운로드 (Windows, 학교망에서). 목록 형식은 scripts/get_papers.ps1 머리말 참조
powershell -ExecutionPolicy Bypass -File scripts\get_papers.ps1 -List docs\papers-2026-09.txt
powershell -ExecutionPolicy Bypass -File scripts\get_papers.ps1 -List docs\papers-2026-09.txt -Upload -RemoteHost <host> -RemotePort <port> -RemoteUser <user> -RemotePath <dir>/   # + 서버 전송
```

---

## 8. 문제가 생기면

`docs/troubleshooting.md` — 브라우저 다운로드가 조용히 실패하는 이유(페이지당 1건 제한, Content-Disposition, DPR 좌표), 도구 끊김, 로그인, GitHub 실패 등 **실제로 겪고 확정한 대응**만 적혀 있다.

## 9. 라이선스

MIT. 카탈로그의 등급 정보는 각 출처(KIISE, Scimago, 워크숍 공식 페이지)에 귀속된다.
