// Shared message catalog (ko/en). Used by ICS descriptions, reminder messages
// and embedded into the site so the UI and notifications say the same thing.
export const MESSAGES = {
  ko: {
    'type.conference': '학술대회', 'type.journal': '저널', 'type.workshop': '워크숍',
    'milestone.abstract': '초록 마감', 'milestone.paper': '논문 마감', 'milestone.notification': '결과 통보',
    'milestone.camera-ready': '최종본 마감', 'milestone.event': '행사', 'milestone.other': '기타',
    'status.verified': '확인됨', 'status.needs-verification': '재확인 필요', 'status.tba': '미공개',
    'status.previous-edition': '직전 회차 참고', 'status.rolling': '상시 투고', 'status.untracked': '미추적',
    'status.not-required': '해당 없음',
    'track.full': '정규', 'track.short': '단편', 'track.poster': '포스터', 'track.special-issue': '특집호',
    'track.doctoral': '박사과정', 'track.industry': '산업',
    'dday.today': 'D-Day', 'dday.future': 'D-{n}', 'dday.past': 'D+{n}',
    'ics.official': '공식 시각', 'ics.local': '현지 시각', 'ics.status': '상태', 'ics.cfp': 'CFP',
    'ics.warning': '⚠ 이 일정은 마지막으로 확인된 값이며 재확인이 필요합니다.',
    'ics.tzUnspecified': '⚠ 공식 페이지에 시간대가 없어 AoE로 가정했습니다. 알림은 보내지 않습니다.',
    'tz.unspecified': '시간대 미표기 (AoE 가정)',
    'ics.calendarName': '{title} 마감 일정',
    'remind.title': '📡 {title} · 마감 알림',
    'remind.subtitle': '{count}건의 마감이 다가옵니다',
    'remind.line': '{dday} · {venue} {edition} · {round}{track} {milestone}',
    'remind.official': '공식: {when} {tz}',
    'remind.local': '현지({tz}): {when}',
    'remind.footer': '확인된(Verified) 일정만 알립니다. 전체 일정: {url}',
    'remind.open': 'CFP 열기',
    'remind.test': '✅ PaperRadar 알림 채널 테스트 메시지입니다. 이 메시지가 보이면 설정이 완료된 것입니다.',
    'email.subject': '[{title}] 마감 알림 · {count}건',
    'email.changesSubject': '[{title}] 일정 변경 · {count}건',
    'digest.new': '🆕 새로 등장', 'digest.today': '🔴 오늘 마감', 'digest.imminent': '🟠 마감 임박',
    'digest.window': '🟡 {n}일 남음', 'digest.changed': '🔁 일정 변경', 'digest.removed': '❌ 삭제',
    'digest.recovered': '✅ 재확인 성공', 'digest.failed': '⚠ 확인 실패',
    'changes.removedNote': '공식 페이지에서 사라짐',
    'changes.more': '외 {n}건 — 전체: {url}#sources',
    'changes.footer': '매일 공식 CFP를 다시 읽어 감지한 변경입니다. 전체 기록: {url}#sources',
  },
  en: {
    'type.conference': 'Conference', 'type.journal': 'Journal', 'type.workshop': 'Workshop',
    'milestone.abstract': 'Abstract deadline', 'milestone.paper': 'Paper deadline', 'milestone.notification': 'Notification',
    'milestone.camera-ready': 'Camera-ready', 'milestone.event': 'Event', 'milestone.other': 'Other',
    'status.verified': 'Verified', 'status.needs-verification': 'Verification needed', 'status.tba': 'TBA',
    'status.previous-edition': 'Previous edition reference', 'status.rolling': 'Rolling submission', 'status.untracked': 'Not tracked',
    'status.not-required': 'Not required',
    'track.full': 'Full', 'track.short': 'Short', 'track.poster': 'Poster', 'track.special-issue': 'Special issue',
    'track.doctoral': 'Doctoral', 'track.industry': 'Industry',
    'dday.today': 'D-Day', 'dday.future': 'D-{n}', 'dday.past': 'D+{n}',
    'ics.official': 'Official time', 'ics.local': 'Local time', 'ics.status': 'Status', 'ics.cfp': 'CFP',
    'ics.warning': '⚠ Last known value; the official page could not be re-verified.',
    'ics.tzUnspecified': '⚠ The official page states no timezone; AoE assumed. No reminder is sent.',
    'tz.unspecified': 'timezone not stated (AoE assumed)',
    'ics.calendarName': '{title} deadlines',
    'remind.title': '📡 {title} · Deadline reminder',
    'remind.subtitle': '{count} deadline(s) approaching',
    'remind.line': '{dday} · {venue} {edition} · {round}{track} {milestone}',
    'remind.official': 'Official: {when} {tz}',
    'remind.local': 'Local ({tz}): {when}',
    'remind.footer': 'Only verified deadlines are sent. Full schedule: {url}',
    'remind.open': 'Open CFP',
    'remind.test': '✅ PaperRadar notification channel test. If you can read this, the channel is configured.',
    'email.subject': '[{title}] Deadline reminder · {count}',
    'email.changesSubject': '[{title}] Schedule changes · {count}',
    'digest.new': '🆕 Newly announced', 'digest.today': '🔴 Due today', 'digest.imminent': '🟠 Closing soon',
    'digest.window': '🟡 {n} days left', 'digest.changed': '🔁 Date changed', 'digest.removed': '❌ Removed',
    'digest.recovered': '✅ Verified again', 'digest.failed': '⚠ Verification failed',
    'changes.removedNote': 'no longer on the official page',
    'changes.more': '+{n} more — full list: {url}#sources',
    'changes.footer': 'Detected by the daily re-read of official CFPs. Full log: {url}#sources',
  },
};

export function t(lang, key, vars = {}) {
  const table = MESSAGES[lang] ?? MESSAGES.en;
  let s = table[key] ?? MESSAGES.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function dday(lang, days) {
  if (days === 0) return t(lang, 'dday.today');
  if (days > 0) return t(lang, 'dday.future', { n: days });
  return t(lang, 'dday.past', { n: -days });
}

/** Track label: known keys are translated, unknown ones shown as-is. */
export function trackLabel(lang, track) {
  const key = `track.${track}`;
  const table = MESSAGES[lang] ?? MESSAGES.en;
  return table[key] ?? MESSAGES.en[key] ?? track;
}
