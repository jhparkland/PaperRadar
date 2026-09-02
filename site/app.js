/* PaperRadar site — renders dist/data.json. No framework, no build step.
   All venue/deadline strings come from data.json; UI chrome strings live in UI below. */
(() => {
  'use strict';

  const UI = {
    ko: {
      tab_upcoming: '임박 마감', tab_venues: '전체 venue', tab_past: '지난 일정', tab_sources: '갱신·출처', tab_calendars: '캘린더 구독', tab_setup: '설정 가이드',
      tz_site: '사이트 시간대', tz_browser: '내 브라우저',
      search: '검색 (약칭, 이름, 주제)', all_types: '전체 유형', all_tiers: '전체 등급', all_fields: '전체 분야', show_untracked: '미추적 venue 표시',
      upcoming_title: '앞으로 {days}일 안의 마감', upcoming_empty: '이 기간에 확인된 마감이 없습니다.',
      past_title: '최근 {days}일의 지난 마감', past_empty: '지난 일정이 없습니다.',
      col_dday: 'D-day', col_venue: 'Venue', col_edition: '회차', col_what: '항목', col_official: '공식 시각', col_local: '{tz} 기준', col_status: '상태', col_link: '링크',
      col_source: '출처', col_adapter: '방식', col_checked: '마지막 점검', col_lastok: '마지막 성공', col_error: '오류',
      next_label: '다음 마감', no_next: '예정된 마감 없음', prev_ref: '직전 회차', rolling: '상시 투고 — 마감 없음', untracked: '마감 추적 없음 (CFP 어댑터 없음)',
      link_cfp: 'CFP', link_home: '홈페이지', link_ics: '.ics 구독', details: '전체 일정 보기', hosted_by: '주최',
      sources_title: '출처 상태', updates_title: '최근 변경', updates_empty: '기록된 변경이 없습니다.', no_sources: '자동 추적 중인 출처가 없습니다.',
      kind_added: '추가', kind_changed: '변경', kind_removed: '삭제', kind_failed: '확인 실패', kind_recovered: '재확인 성공',
      src_ok: '확인됨', src_failed: '실패', src_manual: '수동 확인', src_pending: '아직 실행 안 됨',
      cal_title: '캘린더 피드', cal_intro: '아래 URL을 캘린더 앱(Google Calendar → 다른 캘린더 추가 → URL로, Apple Calendar → 새 구독 캘린더, Outlook → 인터넷에서 추가)에 붙여넣으세요. 하루 두 번 갱신되며 변경된 일정은 자동으로 반영됩니다.',
      cal_all: '전체 마감', cal_conferences: '학술대회', cal_journals: '저널 특집호', cal_workshops: '워크숍', cal_by_tier: '{ranking} 등급별', cal_by_venue: 'venue별', copy: '복사', copied: '복사됨',
      policy: 'PaperRadar는 일정을 추정하지 않습니다. 확인됨(Verified)은 등록된 공식 CFP에서 시간대까지 확인한 일정이며, 재확인 필요는 마지막으로 확인된 값입니다. 미공개(TBA)는 D-day·캘린더·알림에서 제외됩니다.',
      footer_meta: '데이터 갱신 {updated} · 사이트 생성 {generated}',
      verified_at: '수동 확인 {date}',
      setup_title: '내 분야용으로 설정하기',
      setup_intro: 'PaperRadar는 설정 파일 하나로 어느 연구 분야에든 맞출 수 있는 마감 추적기입니다. 포크해서 아래 순서대로 진행하면 자신만의 사이트·캘린더·알림이 생깁니다.',
      setup_current: '이 사이트의 현재 설정',
      cur_channels: '알림 채널', cur_days: '알림 시점', cur_lang: '알림 언어', cur_tz: '시간대', cur_tracked: '추적 venue', cur_tracked_v: '{n}개 (그중 마감 자동 추적 {m}개)', cur_rankings: '표시 등급',
      s1_t: '저장소 포크', s1_p: 'GitHub에서 이 저장소를 Fork(또는 Use this template)한 뒤 로컬에 클론합니다. Node.js 22 이상이 필요합니다.',
      s2_t: 'config/radar.yaml 편집', s2_p: '유일하게 손대는 파일입니다. 분야(select.fields), 개별 venue(select.venues), 시간대, 언어, 사이트 주소(baseUrl)를 정합니다. 사용할 수 있는 id는 catalog/ 폴더에 있습니다.',
      s3_t: '로컬에서 확인', s3_p: '문제가 있으면 doctor가 어떤 줄을 고쳐야 하는지 알려줍니다.',
      s4_t: 'GitHub Pages 켜기', s4_p: '저장소 Settings → Pages → Build and deployment → Source를 "GitHub Actions"로 설정합니다. main에 push하면 자동 배포됩니다.',
      s5_t: 'Google Chat 알림 연결', s5_p: 'Google Workspace 계정이 필요합니다(개인 @gmail.com은 웹훅을 지원하지 않습니다). 혼자만 있는 스페이스를 만들면 개인 알림처럼 쓸 수 있습니다.',
      s5_steps: ['Google Chat → 새 스페이스 만들기 (이름 예: PaperRadar)', '스페이스 이름 ▾ → 앱 및 통합 → 웹훅 → 웹훅 추가 → 이름 입력 → 저장 → URL 복사', 'GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 GOOGLE_CHAT_WEBHOOK_URL, 값에 URL 붙여넣기', 'config/radar.yaml의 reminders.channels에 google-chat 포함 (기본값)', 'Actions → "Daily refresh" → Run workflow → test_notification 체크 → 실행. 스페이스에 테스트 메시지가 오면 완료'],
      s6_t: '(선택) 이메일 알림', s6_p: 'SMTP 정보를 시크릿으로 넣고 reminders.channels에 email을 추가합니다: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, REMINDER_EMAIL_TO, REMINDER_EMAIL_FROM.',
      s7_t: '매일 자동 갱신', s7_p: '.github/workflows/refresh.yml이 매일 공식 CFP를 다시 읽고, 확인된 마감을 분류해 하루 한 번 알림을 보내며, 변경 데이터를 커밋하고 사이트를 다시 배포합니다. 출처 확인에 실패하면 마지막 값을 유지하고 이슈를 엽니다.',
      s8_t: 'venue 추가하기', s8_p: '카탈로그에 없는 학회는 npm run new-venue로 파일을 만들고, npm run probe로 CFP 페이지의 날짜 위치를 확인해 패턴을 채웁니다. 자동 파싱이 어려우면 manual 어댑터로 날짜와 확인일을 직접 적습니다. 자세한 절차는 docs/adding-a-venue.md에 있습니다.',
    },
    en: {
      tab_upcoming: 'Upcoming', tab_venues: 'All venues', tab_past: 'Past', tab_sources: 'Sources & updates', tab_calendars: 'Calendars', tab_setup: 'Setup guide',
      tz_site: 'Site timezone', tz_browser: 'My browser',
      search: 'Search (acronym, name, topic)', all_types: 'All types', all_tiers: 'All tiers', all_fields: 'All fields', show_untracked: 'Show untracked venues',
      upcoming_title: 'Deadlines in the next {days} days', upcoming_empty: 'No verified deadlines in this window.',
      past_title: 'Past deadlines from the last {days} days', past_empty: 'Nothing here yet.',
      col_dday: 'D-day', col_venue: 'Venue', col_edition: 'Edition', col_what: 'Milestone', col_official: 'Official', col_local: 'In {tz}', col_status: 'Status', col_link: 'Link',
      col_source: 'Source', col_adapter: 'Adapter', col_checked: 'Last checked', col_lastok: 'Last success', col_error: 'Error',
      next_label: 'Next deadline', no_next: 'No upcoming deadline', prev_ref: 'Previous edition', rolling: 'Rolling submission — no deadline', untracked: 'Deadlines not tracked (no CFP adapter)',
      link_cfp: 'CFP', link_home: 'Homepage', link_ics: 'Subscribe .ics', details: 'Show full schedule', hosted_by: 'at',
      sources_title: 'Source status', updates_title: 'Recent changes', updates_empty: 'No changes recorded yet.', no_sources: 'No automatically tracked sources.',
      kind_added: 'added', kind_changed: 'changed', kind_removed: 'removed', kind_failed: 'verification failed', kind_recovered: 'verified again',
      src_ok: 'verified', src_failed: 'failed', src_manual: 'manual', src_pending: 'not run yet',
      cal_title: 'Calendar feeds', cal_intro: 'Paste a URL into your calendar app (Google Calendar → Other calendars → From URL; Apple Calendar → New Calendar Subscription; Outlook → Add from internet). Feeds refresh twice a day and changed deadlines update in place.',
      cal_all: 'All deadlines', cal_conferences: 'Conferences', cal_journals: 'Journal special issues', cal_workshops: 'Workshops', cal_by_tier: 'By {ranking} tier', cal_by_venue: 'Per venue', copy: 'Copy', copied: 'Copied',
      policy: 'PaperRadar never guesses dates. Verified means the date and timezone were confirmed on the registered official CFP; Verification needed is the last confirmed value. TBA is excluded from D-day, calendars and reminders.',
      footer_meta: 'Data refreshed {updated} · site built {generated}',
      verified_at: 'checked manually {date}',
      setup_title: 'Set it up for your own field',
      setup_intro: 'PaperRadar is a deadline tracker you adapt to any research field with one config file. Fork it, follow the steps and you get your own site, calendars and reminders.',
      setup_current: 'Current settings of this site',
      cur_channels: 'Reminder channels', cur_days: 'Reminder thresholds', cur_lang: 'Reminder language', cur_tz: 'Timezone', cur_tracked: 'Tracked venues', cur_tracked_v: '{n} ({m} with deadline tracking)', cur_rankings: 'Rankings shown',
      s1_t: 'Fork the repository', s1_p: 'Fork (or "Use this template") on GitHub and clone it. Node.js 22 or newer is required.',
      s2_t: 'Edit config/radar.yaml', s2_p: 'The only file you touch. Choose fields (select.fields), individual venues (select.venues), timezone, languages and your site address (baseUrl). Valid ids live in the catalog/ folder.',
      s3_t: 'Check locally', s3_p: 'If something is off, doctor tells you which line to fix.',
      s4_t: 'Enable GitHub Pages', s4_p: 'Repository Settings → Pages → Build and deployment → Source: "GitHub Actions". Every push to main deploys.',
      s5_t: 'Connect Google Chat reminders', s5_p: 'Requires a Google Workspace account (personal @gmail.com cannot add webhooks). A space with only you in it works as a personal channel.',
      s5_steps: ['Google Chat → create a space (e.g. "PaperRadar")', 'Space name ▾ → Apps & integrations → Webhooks → Add webhook → name it → Save → copy the URL', 'GitHub repo → Settings → Secrets and variables → Actions → New repository secret → name GOOGLE_CHAT_WEBHOOK_URL, paste the URL', 'Keep google-chat in reminders.channels in config/radar.yaml (default)', 'Actions → "Daily refresh" → Run workflow → tick test_notification → Run. A test message in the space means you are done'],
      s6_t: '(Optional) Email reminders', s6_p: 'Add SMTP secrets and put email in reminders.channels: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, REMINDER_EMAIL_TO, REMINDER_EMAIL_FROM.',
      s7_t: 'Daily automation', s7_p: '.github/workflows/refresh.yml re-reads every official CFP daily, sends one grouped digest a day for verified deadlines, commits changed data and redeploys the site. When a source cannot be verified the last value is kept and an issue is opened.',
      s8_t: 'Add a venue', s8_p: 'For venues missing from the catalog, scaffold a file with npm run new-venue, use npm run probe to see where the CFP page shows its dates, and fill in the patterns. If a page cannot be parsed, use the manual adapter and write the dates with the day you checked them. Full walkthrough in docs/adding-a-venue.md.',
    },
  };

  const state = {
    data: null, lang: 'ko', tzMode: 'site', tab: 'upcoming',
    filters: { q: '', type: '', field: '', tier: '', untracked: true },
    now: new Date(),
  };

  // ---------------------------------------------------------------- helpers
  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const ui = (key, vars = {}) => {
    let s = (UI[state.lang] ?? UI.en)[key] ?? UI.en[key] ?? key;
    if (typeof s === 'string') for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
  const t = (key) => state.data.i18n[state.lang]?.[key] ?? state.data.i18n.en?.[key] ?? key;
  const pick = (v) => (v == null ? '' : typeof v === 'string' ? v : (v[state.lang] ?? v.en ?? Object.values(v)[0] ?? ''));
  const timeZone = () => (state.tzMode === 'browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone : state.data.site.timezone);
  const pad = (n) => String(n).padStart(2, '0');

  function partsIn(iso, tz) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
    const out = {};
    for (const p of fmt.formatToParts(new Date(iso))) if (p.type !== 'literal') out[p.type] = p.value;
    return { y: +out.year, m: +out.month, d: +out.day, hh: +out.hour, mm: +out.minute, wd: out.weekday };
  }
  const fmtLocal = (iso) => { const p = partsIn(iso, timeZone()); return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)} (${p.wd})`; };
  const fmtOfficial = (row) => `${row.at.slice(0, 10)} ${row.at.slice(11, 16)} ${row.tzLabel === 'unspecified' ? t('tz.unspecified') : (row.tzLabel ?? row.at.slice(19))}`;
  function daysUntil(iso) {
    const a = partsIn(iso, timeZone()), b = partsIn(state.now.toISOString(), timeZone());
    return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
  }
  const ddayText = (n) => (n === 0 ? t('dday.today') : n > 0 ? t('dday.future').replace('{n}', n) : t('dday.past').replace('{n}', -n));
  const ddayEl = (n) => h('span', { class: `dday ${n < 0 ? 'past' : n <= 7 ? 'soon' : n <= 30 ? 'near' : ''}` }, ddayText(n));
  const statusClass = { verified: 'ok', 'needs-verification': 'warn', tba: 'outline', 'previous-edition': 'outline', rolling: 'accent', untracked: 'outline', 'not-required': 'outline' };
  const statusBadge = (s) => h('span', { class: `badge ${statusClass[s] ?? ''}` }, t(`status.${s}`));
  const milestoneName = (row) => (row.type === 'other' ? pick(row.label) : t(`milestone.${row.type}`));
  const trackName = (track) => (track === 'full' ? '' : t(`track.${track}`) === `track.${track}` ? track : t(`track.${track}`));
  const whatText = (row) => [row.roundId === 'main' ? '' : pick(row.roundLabel), trackName(row.track), milestoneName(row)].filter(Boolean).join(' · ');
  const fmtStamp = (iso) => (iso ? iso.replace('T', ' ').replace(/:\d{2}Z$/, ' UTC') : '—');
  const absUrl = (path) => new URL(path, state.data.site.baseUrl || document.baseURI).href;
  const venueById = (id) => state.data.venues.find((v) => v.id === id);

  // ---------------------------------------------------------------- render
  function render() {
    const d = state.data;
    document.documentElement.lang = state.lang;
    document.title = d.site.title;
    $('#site-title').textContent = d.site.title;
    $('#site-tagline').textContent = pick(d.site.tagline);

    const lt = $('#lang-toggle');
    lt.replaceChildren(...d.site.languages.map((l) => h('button', { type: 'button', 'aria-pressed': String(l === state.lang), onclick: () => { state.lang = l; localStorage.setItem('pr.lang', l); render(); } }, l.toUpperCase())));
    const tt = $('#tz-toggle');
    tt.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(state.tzMode === 'site'), onclick: () => setTz('site') }, `${ui('tz_site')} · ${d.site.timezone}`),
      h('button', { type: 'button', 'aria-pressed': String(state.tzMode === 'browser'), onclick: () => setTz('browser') }, `${ui('tz_browser')} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`),
    );

    const tabs = [
      ['upcoming', ui('tab_upcoming'), d.upcoming.length],
      ['venues', ui('tab_venues'), d.venues.length],
      ['past', ui('tab_past'), d.archive.length],
      ['sources', ui('tab_sources'), d.sources.filter((s) => s.status === 'failed').length || null],
      ['calendars', ui('tab_calendars'), null],
      ['setup', ui('tab_setup'), null],
    ];
    $('#tabs').replaceChildren(...tabs.map(([id, label, count]) => h('li', { role: 'presentation' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tab === id), onclick: () => { state.tab = id; location.hash = id; render(); } },
        label, count ? h('span', { class: 'count' }, count) : null))));

    const view = $('#view');
    const renderers = { upcoming: renderUpcoming, venues: renderVenues, past: renderPast, sources: renderSources, calendars: renderCalendars, setup: renderSetup };
    view.replaceChildren((renderers[state.tab] ?? renderUpcoming)());

    $('#footer-meta').textContent = ui('footer_meta', { updated: fmtStamp(d.schedulesUpdatedAt) || '—', generated: fmtStamp(d.generatedAt) });
    $('#footer-policy').textContent = ui('policy');
  }

  function setTz(mode) { state.tzMode = mode; localStorage.setItem('pr.tz', mode); render(); }

  function deadlineTable(rows) {
    const tz = timeZone();
    const cols = ['col_edition', 'col_what', 'col_official', 'col_local', 'col_status', 'col_link'];
    const label = (k) => ui(k, { tz });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'stack' },
      h('thead', {}, h('tr', {}, h('th', {}, `${label('col_dday')} · ${label('col_venue')}`), ...cols.map((k) => h('th', {}, label(k))))),
      h('tbody', {}, rows.map((r) => {
        const n = daysUntil(r.at);
        return h('tr', { class: r.status === 'needs-verification' ? 'row-warn' : null },
          h('td', { class: 'lead', 'data-label': label('col_dday') }, ddayEl(n), h('strong', { class: 'lead-venue' }, r.acronym), h('div', { class: 'small muted' }, r.venueName)),
          h('td', { 'data-label': label('col_edition') }, r.editionLabel),
          h('td', { 'data-label': label('col_what') }, whatText(r)),
          h('td', { class: 'small', 'data-label': label('col_official') }, fmtOfficial(r)),
          h('td', { class: 'small', 'data-label': label('col_local') }, fmtLocal(r.at)),
          h('td', { 'data-label': label('col_status') }, statusBadge(r.status)),
          h('td', { 'data-label': label('col_link') }, r.sourceUrl ? h('a', { href: r.sourceUrl, target: '_blank', rel: 'noopener' }, ui('link_cfp')) : '—'),
        );
      })),
    ));
  }

  function renderUpcoming() {
    const d = state.data;
    const rows = d.upcoming.filter((r) => daysUntil(r.at) >= 0);
    return h('section', {},
      h('h2', {}, ui('upcoming_title', { days: d.site.upcomingDays })),
      rows.length ? deadlineTable(rows) : h('p', { class: 'empty' }, ui('upcoming_empty')),
    );
  }

  function renderPast() {
    const d = state.data;
    return h('section', {},
      h('h2', {}, ui('past_title', { days: d.site.archiveDays })),
      d.archive.length ? deadlineTable(d.archive) : h('p', { class: 'empty' }, ui('past_empty')),
    );
  }

  function renderVenues() {
    const d = state.data;
    const f = state.filters;
    const primary = d.rankings.find((r) => r.id === d.primaryRanking) ?? null;
    const q = f.q.trim().toLowerCase();
    const matches = (v) => {
      if (f.type && v.type !== f.type) return false;
      if (f.field && !v.fields.includes(f.field)) return false;
      if (f.tier && primary && v.rankings[primary.id] !== f.tier) return false;
      if (!f.untracked && v.status === 'untracked') return false;
      if (q && !`${v.acronym} ${v.name} ${v.topics.join(' ')} ${v.parent ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    };
    const tierRank = (v) => (primary ? (primary.tiers.indexOf(v.rankings[primary.id]) + 1 || 99) : 99);
    const sorted = d.venues.filter(matches).sort((a, b) => tierRank(a) - tierRank(b) || a.acronym.localeCompare(b.acronym));

    const filters = h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: ui('search'), value: f.q, 'aria-label': ui('search'), oninput: (e) => { f.q = e.target.value; rerenderVenueList(); } }),
      h('select', { 'aria-label': ui('all_types'), onchange: (e) => { f.type = e.target.value; rerenderVenueList(); } },
        h('option', { value: '' }, ui('all_types')),
        ...['conference', 'journal', 'workshop'].map((ty) => h('option', { value: ty, selected: f.type === ty }, t(`type.${ty}`)))),
      h('select', { 'aria-label': ui('all_fields'), onchange: (e) => { f.field = e.target.value; rerenderVenueList(); } },
        h('option', { value: '' }, ui('all_fields')),
        ...d.fields.map((fl) => h('option', { value: fl.id, selected: f.field === fl.id }, pick(fl.name)))),
      primary ? h('select', { 'aria-label': ui('all_tiers'), onchange: (e) => { f.tier = e.target.value; rerenderVenueList(); } },
        h('option', { value: '' }, `${ui('all_tiers')} (${pick(primary.label)})`),
        ...primary.tiers.map((tier) => h('option', { value: tier, selected: f.tier === tier }, tier))) : null,
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: f.untracked, onchange: (e) => { f.untracked = e.target.checked; rerenderVenueList(); } }), ui('show_untracked')),
    );
    const list = h('div', { id: 'venue-list' });
    fillVenueList(list, sorted);
    return h('section', {}, filters, list);
  }

  function rerenderVenueList() {
    const section = $('#venue-list');
    if (!section) return render();
    const d = state.data;
    const f = state.filters;
    const primary = d.rankings.find((r) => r.id === d.primaryRanking) ?? null;
    const q = f.q.trim().toLowerCase();
    const sorted = d.venues.filter((v) => {
      if (f.type && v.type !== f.type) return false;
      if (f.field && !v.fields.includes(f.field)) return false;
      if (f.tier && primary && v.rankings[primary.id] !== f.tier) return false;
      if (!f.untracked && v.status === 'untracked') return false;
      if (q && !`${v.acronym} ${v.name} ${v.topics.join(' ')} ${v.parent ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => ((primary ? (primary.tiers.indexOf(a.rankings[primary.id]) + 1 || 99) : 99) - (primary ? (primary.tiers.indexOf(b.rankings[primary.id]) + 1 || 99) : 99)) || a.acronym.localeCompare(b.acronym));
    fillVenueList(section, sorted);
  }

  function fillVenueList(container, sorted) {
    const groups = [['conference', []], ['journal', []], ['workshop', []]];
    for (const v of sorted) groups.find((g) => g[0] === v.type)?.[1].push(v);
    container.replaceChildren(...groups.filter((g) => g[1].length).map(([type, list]) => h('div', {},
      h('h2', {}, `${t(`type.${type}`)} `, h('span', { class: 'badge outline' }, list.length)),
      h('div', { class: 'grid' }, list.map(venueCard)),
    )));
    if (!sorted.length) container.replaceChildren(h('p', { class: 'empty' }, '—'));
  }

  function venueCard(v) {
    const d = state.data;
    const badges = d.rankings.filter((r) => v.rankings[r.id]).map((r) => h('span', { class: 'badge accent', title: pick(r.label) }, `${r.id === d.primaryRanking ? '' : `${r.id.split('-')[0].toUpperCase()} `}${v.rankings[r.id]}`));
    let next;
    if (v.next) {
      const n = daysUntil(v.next.at);
      next = h('div', { class: 'next' }, ddayEl(n), h('span', { class: 'what' }, `${v.next.editionLabel} · ${whatText(v.next)}`),
        h('span', { class: 'when' }, `${fmtOfficial(v.next)} → ${fmtLocal(v.next.at)}`));
    } else if (v.status === 'rolling') next = h('div', { class: 'next' }, h('span', { class: 'muted' }, ui('rolling')));
    else if (v.status === 'untracked') next = h('div', { class: 'next' }, h('span', { class: 'muted' }, ui('untracked')));
    else if (v.previous) next = h('div', { class: 'next' }, h('span', { class: 'muted' }, `${ui('prev_ref')}: ${v.previous.editionLabel} · ${whatText(v.previous)} · ${fmtOfficial(v.previous)}`));
    else next = h('div', { class: 'next' }, h('span', { class: 'muted' }, ui('no_next')));

    const links = h('div', { class: 'card-links' },
      v.cfpUrl ? h('a', { href: v.cfpUrl, target: '_blank', rel: 'noopener' }, ui('link_cfp')) : null,
      v.homepage ? h('a', { href: v.homepage, target: '_blank', rel: 'noopener' }, ui('link_home')) : null,
      v.adapter !== 'none' ? h('a', { href: v.icsPath }, ui('link_ics')) : null,
    );
    const details = v.editions.length ? h('details', { class: 'editions' }, h('summary', {}, ui('details')), editionsTable(v)) : null;
    return h('article', { class: 'card', id: `venue-${v.id}` },
      h('div', { class: 'card-head' },
        h('div', {},
          h('h3', { class: 'card-title' }, v.acronym, h('span', { class: 'badge outline' }, t(`type.${v.type}`)), ...badges),
          h('p', { class: 'card-name' }, v.name, v.parent ? ` · ${ui('hosted_by')} ${v.parent}` : ''),
        ),
        statusBadge(v.status),
      ),
      v.note ? h('p', { class: 'small muted' }, pick(v.note)) : null,
      next, links, details,
    );
  }

  function editionsTable(v) {
    const rows = [];
    for (const e of v.editions) {
      rows.push(h('tr', { class: 'round-head' }, h('td', { colspan: 4 }, `${e.label}${e.event?.start ? ` · ${e.event.start}${e.event.end ? ` ~ ${e.event.end}` : ''}` : ''}${e.event?.location ? ` · ${e.event.location}` : ''}`)));
      for (const r of e.rounds) {
        for (const m of r.milestones) {
          if (m.state === 'not-required') continue;
          const row = { ...m, roundId: r.id, roundLabel: r.label, track: r.track };
          rows.push(h('tr', {},
            h('td', {}, whatText(row)),
            h('td', { class: 'small' }, m.at ? fmtOfficial({ at: m.at, tzLabel: m.tzLabel }) : '—'),
            h('td', { class: 'small' }, m.at ? `${fmtLocal(m.at)} · ${ddayText(daysUntil(m.at))}` : '—'),
            h('td', {}, statusBadge(m.status), m.verifiedAt ? h('div', { class: 'small muted' }, ui('verified_at', { date: m.verifiedAt })) : null),
          ));
        }
      }
    }
    return h('table', {}, h('tbody', {}, rows));
  }

  function renderSources() {
    const d = state.data;
    const updates = d.updates.length
      ? h('ul', { class: 'updates' }, d.updates.map((u) => {
        const v = venueById(u.venueId);
        const what = u.kind === 'changed' ? `${u.before ?? '—'} → ${u.after ?? '—'}` : (u.after ?? u.before ?? u.message ?? '');
        const target = u.uid ? u.uid.split('/').slice(2).join(' / ') : (u.editionId ?? '');
        return h('li', {}, h('time', { datetime: u.at }, u.at.slice(0, 10)), h('span', { class: `badge ${u.kind === 'failed' ? 'bad' : u.kind === 'recovered' ? 'ok' : ''}` }, ui(`kind_${u.kind}`)), ' ',
          h('strong', {}, v?.acronym ?? u.venueId), ` ${target} `, h('span', { class: 'muted small' }, what));
      }))
      : h('p', { class: 'empty' }, ui('updates_empty'));
    const srcBadge = (s) => h('span', { class: `badge ${s === 'ok' ? 'ok' : s === 'failed' ? 'bad' : s === 'manual' ? 'accent' : 'outline'}` }, ui(`src_${s}`));
    const sources = d.sources.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'stack' },
      h('thead', {}, h('tr', {}, ['col_venue', 'col_edition', 'col_adapter', 'col_status', 'col_checked', 'col_lastok', 'col_error', 'col_source'].map((k) => h('th', {}, ui(k))))),
      h('tbody', {}, d.sources.map((s) => h('tr', { class: s.status === 'failed' ? 'row-warn' : null },
        h('td', { class: 'lead' }, h('strong', {}, s.acronym)), h('td', { 'data-label': ui('col_edition') }, s.editionLabel ?? '—'), h('td', { 'data-label': ui('col_adapter') }, s.adapter), h('td', { 'data-label': ui('col_status') }, srcBadge(s.status)),
        h('td', { class: 'small', 'data-label': ui('col_checked') }, fmtStamp(s.checkedAt)), h('td', { class: 'small', 'data-label': ui('col_lastok') }, fmtStamp(s.lastOkAt)), h('td', { class: 'small', 'data-label': ui('col_error') }, s.error ?? ''),
        h('td', { 'data-label': ui('col_source') }, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, ui('link_cfp')) : '—'),
      ))),
    )) : h('p', { class: 'empty' }, ui('no_sources'));
    return h('section', {}, h('h2', {}, ui('sources_title')), sources, h('h2', {}, ui('updates_title')), updates);
  }

  function copyButton(url) {
    return h('button', { type: 'button', class: 'btn', onclick: async (e) => {
      try { await navigator.clipboard.writeText(url); e.target.textContent = ui('copied'); setTimeout(() => { e.target.textContent = ui('copy'); }, 1500); } catch { window.prompt('URL', url); }
    } }, ui('copy'));
  }
  const feedItem = (label, path) => { const url = absUrl(path); return h('li', {}, h('strong', {}, label), h('code', {}, url), copyButton(url), h('a', { href: path }, '.ics')); };

  function renderCalendars() {
    const d = state.data;
    const tracked = d.venues.filter((v) => v.adapter !== 'none');
    return h('section', {},
      h('h2', {}, ui('cal_title')), h('p', { class: 'muted' }, ui('cal_intro')),
      h('ul', { class: 'feed-list' },
        feedItem(ui('cal_all'), d.feeds.all), feedItem(ui('cal_conferences'), d.feeds.conferences), feedItem(ui('cal_workshops'), d.feeds.workshops), feedItem(ui('cal_journals'), d.feeds.journals)),
      ...d.rankings.map((r) => [h('h3', {}, ui('cal_by_tier', { ranking: pick(r.label) })), h('ul', { class: 'feed-list' }, r.feeds.map((f) => feedItem(f.tier, f.path)))]),
      h('h3', {}, ui('cal_by_venue')),
      h('ul', { class: 'feed-list' }, tracked.map((v) => feedItem(v.acronym, v.icsPath))),
    );
  }

  function renderSetup() {
    const d = state.data;
    const code = (s) => h('pre', {}, h('code', {}, s));
    const step = (title, para, ...extra) => h('li', {}, h('h3', {}, title), h('p', {}, para), ...extra);
    return h('section', {},
      h('h2', {}, ui('setup_title')), h('p', {}, ui('setup_intro')),
      h('h3', {}, ui('setup_current')),
      h('dl', { class: 'kv' },
        h('dt', {}, ui('cur_tracked')), h('dd', {}, ui('cur_tracked_v', { n: d.venues.length, m: d.venues.filter((v) => v.adapter !== 'none').length })),
        h('dt', {}, ui('cur_tz')), h('dd', {}, d.site.timezone),
        h('dt', {}, ui('cur_rankings')), h('dd', {}, d.rankings.map((r) => pick(r.label)).join(', ') || '—'),
        h('dt', {}, ui('cur_channels')), h('dd', {}, d.reminders.channels.join(', ') || '—'),
        h('dt', {}, ui('cur_days')), h('dd', {}, d.reminders.daysBefore.map((n) => `D-${n}`).join(', ')),
        h('dt', {}, ui('cur_lang')), h('dd', {}, d.reminders.language),
      ),
      h('ol', { class: 'steps' },
        step(ui('s1_t'), ui('s1_p'), code('git clone https://github.com/<you>/PaperRadar.git\ncd PaperRadar\nnpm ci')),
        step(ui('s2_t'), ui('s2_p'), code('select:\n  fields: [systems, cloud]        # catalog/fields.json\n  venues: [neurips, tpds]         # catalog/venues/*.json\n  types: [conference, journal, workshop]\nsite:\n  timezone: Asia/Seoul\n  languages: [ko, en]\n  baseUrl: https://<you>.github.io/PaperRadar/')),
        step(ui('s3_t'), ui('s3_p'), code('npm run doctor      # checks config, catalog, secrets\nnpm run refresh     # reads every official CFP\nnpm run build && npm run dev   # http://127.0.0.1:4173')),
        step(ui('s4_t'), ui('s4_p')),
        step(ui('s5_t'), ui('s5_p'), h('ul', {}, ui('s5_steps').map((s) => h('li', {}, s))), code('# local test with .env\nnpm run remind -- --test')),
        step(ui('s6_t'), ui('s6_p')),
        step(ui('s7_t'), ui('s7_p')),
        step(ui('s8_t'), ui('s8_p'), code('npm run new-venue -- --id myconf --acronym MyConf --name "My Conference" \\\n  --type conference --fields systems --url https://myconf.org/cfp --year 2027\nnpm run probe -- https://myconf.org/cfp\nnpm run probe -- --venue myconf')),
      ),
    );
  }

  // ---------------------------------------------------------------- init
  async function init() {
    const res = await fetch('data.json', { cache: 'no-store' });
    state.data = await res.json();
    const saved = localStorage.getItem('pr.lang');
    state.lang = state.data.site.languages.includes(saved) ? saved : state.data.site.languages[0];
    state.tzMode = localStorage.getItem('pr.tz') === 'browser' ? 'browser' : 'site';
    const hash = location.hash.replace('#', '');
    if (['upcoming', 'venues', 'past', 'sources', 'calendars', 'setup'].includes(hash)) state.tab = hash;
    window.addEventListener('hashchange', () => { const hh = location.hash.replace('#', ''); if (hh && hh !== state.tab) { state.tab = hh; render(); } });
    render();
  }
  init().catch((err) => { $('#view').replaceChildren(h('p', { class: 'notice' }, `Failed to load data.json: ${err.message}`)); });
})();
