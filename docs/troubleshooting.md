# 실패 방지 — 실제로 겪은 함정과 확정된 대응

이 문서의 규칙은 SKILL.md 에 그대로 반영되어 있다. 새 함정을 만나면 여기와 SKILL.md 양쪽에 추가한다.

## A. 브라우저(Claude in Chrome) PDF 다운로드

| # | 증상 | 원인 | 대응 (확정) |
|---|---|---|---|
| A1 | 한 번에 여러 파일을 내려받으면 첫 파일만 저장되고 나머지는 조용히 사라짐 | Chrome이 페이지당 자동 다운로드를 1건으로 제한 | **파일 1개마다 페이지를 새로 navigate** 한다. 한 JS 호출에서 루프로 여러 개 받지 않는다. |
| A2 | 저장은 되는데 파일명이 `stamp.pdf`, `3698038.3698542.pdf` 처럼 서버 이름으로 나옴 | `<a href="서버URL" download="이름">` 은 서버의 `Content-Disposition` 이 우선 | **fetch → blob → `URL.createObjectURL` → `download` 속성** 으로 저장한다. blob 에는 Content-Disposition 이 없어 지정한 파일명이 보장된다. |
| A3 | 클릭 명령은 성공했다는데 다운로드가 안 됨 | `computer` 도구의 좌표는 devicePixelRatio(예: 1.5)가 반영된 프레임이라 CSS 좌표로 찍으면 빗나감 | **좌표 클릭 금지.** 앵커에 고유 텍스트를 넣고 `find` 로 ref 를 얻은 뒤 **`left_click` + `ref`** 로 클릭한다. |
| A4 | JS 로 `a.click()` 을 호출했는데 다운로드가 막힘 | 프로그램적 클릭은 user activation 이 없어 자동 다운로드로 취급 | A3 방식(실제 클릭 이벤트) 사용. |
| A5 | `chrome://downloads` 로 확인하려 했더니 접근 불가 | 확장은 chrome:// 페이지를 읽을 수 없음 | 저장 여부는 **사용자에게 확인**을 요청한다. 스크린샷·목록을 받으면 대조한다. 확인 없이 "완료"라고 쓰지 않는다. |
| A6 | IEEE Xplore 에서 "Access provided by" 없이 초록만 보임 | 기관 인증 세션 없음 | 즉시 사용자에게 로그인 요청 후 대기. 초록 기반으로 전환하려면 사용자 동의를 받는다. |
| A7 | IEEE DOI 에서 arnumber 를 모름 | DOI 는 문서 번호를 직접 담지 않음 | `https://doi.org/<DOI>` 로 navigate → 도착 URL `ieeexplore.ieee.org/document/<arnumber>` 에서 추출. PDF URL: `https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=<arnumber>&ref=` |
| A8 | ACM DL PDF 경로 | — | `https://dl.acm.org/doi/pdf/<DOI>` (Open Access 면 로그인 불필요, 아니면 기관 세션 필요) |

### 확정 레시피 (파일 1개)

```
1. navigate  → 논문 랜딩 페이지 (같은 origin 이어야 fetch 가 세션 쿠키를 씀)
2. javascript_exec:
     const r = await fetch(PDF_URL, {credentials:'include'});
     const b = await r.blob();                       // type 이 application/pdf 이고 size > 20KB 인지 확인
     const a = document.createElement('a');
     a.id='pr-dl'; a.href=URL.createObjectURL(b); a.download=FILENAME;
     a.textContent='PRDLBTN';                        // find 용 고유 텍스트
     a.style.cssText='position:fixed;top:300px;left:300px;width:500px;height:150px;z-index:2147483647;background:#c00;color:#fff';
     document.body.appendChild(a);
3. find "PRDLBTN link"  → ref
4. computer left_click ref=<ref>
5. javascript_exec: document.getElementById('pr-dl')?.remove()
```

## B. 브라우저 도구 자체가 사라짐

| 증상 | 대응 |
|---|---|
| `No such tool available: mcp__claude-in-chrome__...` | Claude in Chrome 이 세션에서 끊긴 것. 스킬 쪽에서 복구 불가. **즉시 사용자에게 알리고**, 사이드 패널 재시작 → 확장 재로드 → 새 세션 순으로 안내. 같은 세션에서 도구가 되살아나는 경우는 드물다. |
| web_fetch/WebFetch 로 우회하고 싶음 | ACM(dl.acm.org)은 403, IEEE 는 인증 필요 → 우회 불가. **PDF 확보는 브라우저 전용**이다. 초록은 WebFetch 로 가져올 수 있으나 본문은 아니다. |

## C. Gmail / GitHub

| 증상 | 대응 |
|---|---|
| Gmail 검색 결과가 0건 | `alerts.gmail_query` 와 기간을 보고에 그대로 적고 종료. 다른 발신자로 확장하지 않는다. |
| 같은 논문 이슈가 이미 있음 | 제목 핵심어 2~3개로 `search_issues` → 있으면 새 이슈 대신 코멘트. 중복 생성은 실패로 간주. |
| 라벨 생성 실패 | 무시하고 진행 (권한 문제일 뿐). 보고에 한 줄 남긴다. |
| 이슈 생성 실패 (403/404) | PAT `repo` 스코프 안내. 리뷰 본문은 **채팅에 그대로 출력**해서 유실을 막는다. |
| `{username}` 치환 안 됨 | `get_me` 호출 실패. 사용자에게 GitHub MCP 재연결 요청. |

## D. 설정

| 증상 | 대응 |
|---|---|
| `validate.py` 오류 | **실행하지 않는다.** 오류 목록을 보여주고 수정 요청. |
| 출처 문자열이 매칭 안 됨 | `match.py --all "문자열"` 로 후보 확인 → aliases 에 추가. 3글자 이하 약칭은 연도 인접 규칙을 상기시킨다. |
| 저널 grade 와 sjr.quartile 불일치 | validate 가 잡는다. 근거 URL 을 다시 열어 확인. |

## D-2. 알림 파싱

| 증상 | 대응 |
|---|---|
| 출처가 `… Conference on Cloud …, 2026` 처럼 잘림 | 구글 스칼라의 표시 제한. 논문 링크(출판사 페이지)를 열어 정식 명칭을 확인한 뒤 매칭. |
| 출처에 `*Cloud Computing*` 처럼 `*` 가 섞임 | Gmail 평문 변환의 강조 기호. matcher 가 제거한다. |
| 같은 논문이 여러 키워드 그룹에 중복 등장 | 제목으로 dedup. 첫 그룹에만 귀속시키고 나머지 그룹에는 "중복" 표시. |

## E. 일반 원칙

1. 한 논문의 실패가 전체를 멈추지 않는다 (`policy.continue_on_error`).
2. 확인하지 못한 것을 "완료"라고 쓰지 않는다. 브라우저 다운로드는 사용자 확인이 곧 완료 판정이다.
3. 우회를 시도하기 전에 사용자에게 상황을 먼저 알린다 (로그인, 도구 끊김, 페이월).
