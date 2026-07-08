import type { Show, Tracking } from '../types'
import { epNumberAt, nextOccurrence, pad } from './time'

/** 只导出自己在追(想看+在看)的番的更新日历 —— 同类 ICS 项目都是全量导出 */
export function buildIcs(shows: Show[], tracking: Tracking, now: number): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//bangumi-timetable//CN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:我的番组课表',
  ]

  for (const show of shows) {
    const st = tracking.status[show.id]
    if (st !== 'wish' && st !== 'watching') continue
    const next = nextOccurrence(show, now)
    if (next === null) continue
    if (show.end && next > show.end) continue

    const nextEp = epNumberAt(show, next)
    if (show.epsTotal && nextEp > show.epsTotal) continue
    const remaining = show.epsTotal ? show.epsTotal - nextEp + 1 : 13

    const d = new Date(next)
    const dtstart =
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
    const summary = show.nameCn.replace(/([,;\\])/g, '\\$1')

    lines.push(
      'BEGIN:VEVENT',
      `UID:btt-${show.id}@bangumi-timetable`,
      `DTSTART:${dtstart}`,
      'DURATION:PT30M',
      `RRULE:FREQ=WEEKLY;INTERVAL=${Math.max(1, Math.round(show.periodDays / 7)) || 1};COUNT=${remaining}`,
      `SUMMARY:${summary} 更新`,
      `DESCRIPTION:https://bgm.tv/subject/${show.id}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bangumi-timetable.ics'
  a.click()
  URL.revokeObjectURL(url)
}
