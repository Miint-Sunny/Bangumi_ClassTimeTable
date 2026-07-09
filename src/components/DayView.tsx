import { Fragment, useMemo } from 'react'
import type { FriendsMap, Settings, Show, Tracking } from '../types'
import { DAY_MS, WEEKDAY_CN, displayTz, pad, partsInZone, relTime, startOfDayInstant } from '../lib/time'
import { epTime, hasEnded, occurrencesBetween } from '../lib/schedule'
import ShowCard from './ShowCard'

interface Props {
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  seasonStart: number
  archive?: boolean // 归档季不提供日视图,App 层已拦截
  friendsMap: FriendsMap
  dayOffset: number // 由 App 持有,迷你月历可跳转
  onDayOffset: (o: number) => void
  onOpen: (id: number) => void
}

interface Cell {
  show: Show
  ep: number
  epEnd: number
  t: number
  aired: boolean
}

const REL_DAY: Record<number, string> = { [-2]: '前天', [-1]: '昨天', 0: '今天', 1: '明天', 2: '后天' }

/** 日视图:与周视图同构的单日时间轴(时间列 + 加宽卡片列) */
export default function DayView({
  shows,
  tracking,
  settings,
  now,
  seasonStart,
  friendsMap,
  dayOffset,
  onDayOffset,
  onOpen,
}: Props) {
  const tz = displayTz(settings)
  const isToday = dayOffset === 0
  const relLabel = REL_DAY[dayOffset]

  const { rows, cells, unknown, dateLabel, md, wd, nowEff, nowInDay } = useMemo(() => {
    const dayBase = startOfDayInstant(now, tz) + dayOffset * DAY_MS
    // 深夜表记下,一"天"是 cutoff 点 ~ 次日 cutoff 前(凌晨归前一天)
    const lo = dayBase + settings.lateNightCutoff * 3600_000
    const hi = lo + DAY_MS - 1

    const cells = new Map<number, Cell[]>()
    const unknown: Show[] = []
    const dayMid = dayBase + 12 * 3600_000
    const targetWdJst = partsInZone(dayMid, 'Asia/Tokyo').wd

    for (const show of shows) {
      if (epTime(show, 1) === null) {
        if (show.airWeekdayJst === targetWdJst) unknown.push(show)
        continue
      }
      for (const o of occurrencesBetween(show, lo, hi)) {
        if (hasEnded(show, now) && o.t > now) continue
        const p = partsInZone(o.t, tz)
        let m = p.hh * 60 + p.mm
        if (p.hh < settings.lateNightCutoff) m += 1440
        const list = cells.get(m) ?? []
        list.push({ show, ep: o.ep, epEnd: o.epEnd, t: o.t, aired: o.t <= now })
        cells.set(m, list)
      }
    }
    const rows = [...cells.keys()].sort((a, b) => a - b)

    const p = partsInZone(dayMid, tz)
    const np = partsInZone(now, tz)
    let nowEff = np.hh * 60 + np.mm
    if (np.hh < settings.lateNightCutoff) nowEff += 1440

    return {
      rows,
      cells,
      unknown,
      dateLabel: `${p.mo}月${p.d}日(周${WEEKDAY_CN[p.wd]})`,
      md: `${p.mo}/${p.d}`,
      wd: p.wd,
      nowEff,
      nowInDay: now >= lo && now <= hi,
    }
  }, [shows, now, tz, dayOffset, settings])

  const fmtRow = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  const nowIdx = (() => {
    const i = rows.findIndex((m) => m > nowEff)
    return i === -1 ? rows.length : i
  })()

  const nowRow = (
    <>
      <div className="wg-now-time" title="当前时刻">
        {fmtRow(nowEff)}
      </div>
      <div className="wg-now" />
    </>
  )

  const occText = (c: Cell) =>
    `${c.epEnd > c.ep ? `第 ${c.ep}-${c.epEnd} 集` : `第 ${c.ep} 集`} · ${relTime(c.t, now)}`

  return (
    <div className="day-axis">
      <div className="month-nav">
        <button className="iconbtn" onClick={() => onDayOffset(dayOffset - 1)}>
          ‹ 前一天
        </button>
        <span className="m-title">{relLabel ? `${relLabel} · ${dateLabel}` : dateLabel}</span>
        <button className="iconbtn" onClick={() => onDayOffset(dayOffset + 1)}>
          后一天 ›
        </button>
        <span className="reset-slot">
          {!isToday && (
            <button className="iconbtn" onClick={() => onDayOffset(0)}>
              回到今天
            </button>
          )}
        </span>
      </div>

      <div className="week-grid day-grid">
        <div className="wg-corner" />
        <div className={`wg-dayhead${nowInDay ? ' today' : ''}`}>
          <div className="d1">{relLabel ?? `周${WEEKDAY_CN[wd]}`}</div>
          <div className="d2">{md}</div>
        </div>

        {rows.length === 0 && unknown.length === 0 && (
          <>
            <div className="wg-time">—</div>
            <div className="wg-cell">
              <div className="day-empty">这一天没有更新。</div>
            </div>
          </>
        )}

        {rows.map((m, i) => {
          const night = m >= 1440 || m < 360
          const list = cells.get(m) ?? []
          return (
            <Fragment key={m}>
              {nowInDay && i === nowIdx && nowRow}
              <div className={`wg-time${night ? ' night' : ''}`}>{fmtRow(m)}</div>
              <div className={`wg-cell${night ? ' night' : ''}`}>
                {list.map((c) => (
                  <ShowCard
                    key={`${c.show.id}-${c.ep}`}
                    show={c.show}
                    tracking={tracking}
                    now={now}
                    seasonStart={seasonStart}
                    friendsMap={friendsMap}
                    wide
                    occText={occText(c)}
                    airedMark={c.aired}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </Fragment>
          )
        })}
        {nowInDay && rows.length > 0 && nowIdx === rows.length && nowRow}

        {unknown.length > 0 && (
          <>
            <div className="wg-time" title="未提供精确时间">
              未定
            </div>
            <div className="wg-cell">
              {unknown.map((s) => (
                <ShowCard
                  key={s.id}
                  show={s}
                  tracking={tracking}
                  now={now}
                  seasonStart={seasonStart}
                  friendsMap={friendsMap}
                  wide
                  onOpen={onOpen}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
