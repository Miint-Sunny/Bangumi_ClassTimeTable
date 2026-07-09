import { useMemo, useState } from 'react'
import type { FriendsMap, Settings, Show, Tracking } from '../types'
import { DAY_MS, WEEKDAY_CN, displayTz, pad, partsInZone, relTime, startOfDayInstant } from '../lib/time'
import { epTime, hasEnded, occurrencesBetween, totalEps } from '../lib/schedule'

interface Props {
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  seasonStart: number
  archive?: boolean // 归档季不提供日视图,App 层已拦截
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

interface Occ {
  show: Show
  t: number
  ep: number
  epEnd: number
}

const REL_DAY: Record<number, string> = { [-2]: '前天', [-1]: '昨天', 0: '今天', 1: '明天', 2: '后天' }

/** 日视图:今天是"过去 6 小时 + 未来 24 小时"时间线,翻页后是指定日期的完整更新表 */
export default function DayView({ shows, tracking, settings, now, friendsMap, onOpen }: Props) {
  const tz = displayTz(settings)
  const [dayOffset, setDayOffset] = useState(0) // 0 = 今天(相对视角)
  const isToday = dayOffset === 0
  const relLabel = REL_DAY[dayOffset] // 前天/昨天/今天/明天/后天,超出为 undefined

  const { past, upcoming, unknownDay, dateLabel } = useMemo(() => {
    const dayStart = startOfDayInstant(now, tz) + dayOffset * DAY_MS
    const dayMid = dayStart + 12 * 3600_000
    const [lo, hi] = isToday ? [now - 6 * 3600_000, now + 24 * 3600_000] : [dayStart, dayStart + DAY_MS - 1]

    const occs: Occ[] = []
    const unknownDay: Show[] = []
    const targetWdJst = partsInZone(dayMid, 'Asia/Tokyo').wd

    for (const show of shows) {
      if (epTime(show, 1) === null) {
        // 无法推导日程:退回 calendar 的周几归类
        if (show.airWeekdayJst === targetWdJst) unknownDay.push(show)
        continue
      }
      for (const o of occurrencesBetween(show, lo, hi)) {
        if (hasEnded(show, now) && o.t > now) continue
        occs.push({ show, t: o.t, ep: o.ep, epEnd: o.epEnd })
      }
    }
    occs.sort((a, b) => a.t - b.t || a.show.id - b.show.id)

    const p = partsInZone(dayMid, tz)
    const dateLabel = `${p.mo}月${p.d}日(周${WEEKDAY_CN[p.wd]})`
    return {
      past: occs.filter((o) => o.t <= now),
      upcoming: occs.filter((o) => o.t > now),
      unknownDay,
      dateLabel,
    }
  }, [shows, now, tz, dayOffset, isToday])

  const fmt = (t: number) => {
    const p = partsInZone(t, tz)
    return `${pad(p.hh)}:${pad(p.mm)}`
  }

  const row = (o: Occ, isPast: boolean) => {
    const status = tracking.status[o.show.id] ?? 'none'
    const friendCount = friendsMap.get(o.show.id)?.size ?? 0
    return (
      <div key={`${o.show.id}-${o.t}`} className={`day-row${isPast ? ' past' : ''}`}>
        <div className="when">
          <div className="t">{fmt(o.t)}</div>
          <div className="rel">{relTime(o.t, now)}</div>
        </div>
        {o.show.image ? <img className="cover" src={o.show.image} loading="lazy" alt="" /> : null}
        <div className="body">
          <div className="title">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                onOpen(o.show.id)
              }}
            >
              {o.show.nameCn}
            </a>
          </div>
          <div className="sub">
            {o.show.nameJp !== o.show.nameCn ? `${o.show.nameJp} · ` : ''}
            {status === 'watching' ? '在看' : status === 'wish' ? '想看' : ''}
            {friendCount > 0 ? ` · ${friendCount} 位好友在看` : ''}
          </div>
        </div>
        <div className="epnum">
          {o.epEnd > o.ep ? `第 ${o.ep}-${o.epEnd} 集` : `第 ${o.ep} 集`}
          {totalEps(o.show) ? ` / 全 ${totalEps(o.show)} 集` : ''}
        </div>
      </div>
    )
  }

  return (
    <div className="day-view">
      <div className="month-nav">
        <button className="iconbtn" onClick={() => setDayOffset((o) => o - 1)}>
          ‹ 前一天
        </button>
        <span className="m-title">{relLabel ? `${relLabel} · ${dateLabel}` : dateLabel}</span>
        <button className="iconbtn" onClick={() => setDayOffset((o) => o + 1)}>
          后一天 ›
        </button>
        <span className="reset-slot">
          {!isToday && (
            <button className="iconbtn" onClick={() => setDayOffset(0)}>
              回到今天
            </button>
          )}
        </span>
      </div>

      {isToday ? (
        <>
          <div className="day-section-title">刚刚播出(6 小时内)</div>
          {past.length === 0 ? <div className="day-empty">—</div> : past.map((o) => row(o, true))}

          <div className="day-section-title">接下来 24 小时</div>
          {upcoming.length === 0 ? (
            <div className="day-empty">没有更新,清净的一天。</div>
          ) : (
            upcoming.map((o) => row(o, false))
          )}
        </>
      ) : (
        <>
          <div className="day-section-title">
            {relLabel ? `${relLabel} ` : ''}
            {dateLabel} 的更新({past.length + upcoming.length} 次)
          </div>
          {past.length + upcoming.length === 0 ? (
            <div className="day-empty">这一天没有更新。</div>
          ) : (
            <>
              {past.map((o) => row(o, true))}
              {upcoming.map((o) => row(o, false))}
            </>
          )}
        </>
      )}

      {unknownDay.length > 0 && (
        <>
          <div className="day-section-title">{relLabel ?? '当天'}更新 · 具体时间未知</div>
          {unknownDay.map((s) => (
            <div key={s.id} className="day-row">
              <div className="when">
                <div className="t">--:--</div>
              </div>
              {s.image ? <img className="cover" src={s.image} loading="lazy" alt="" /> : null}
              <div className="body">
                <div className="title">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onOpen(s.id)
                    }}
                  >
                    {s.nameCn}
                  </a>
                </div>
                <div className="sub">{s.nameJp !== s.nameCn ? s.nameJp : ''}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
