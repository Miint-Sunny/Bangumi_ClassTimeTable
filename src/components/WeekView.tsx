import { Fragment, useMemo } from 'react'
import type { FriendsMap, Settings, Show, Tracking } from '../types'
import {
  DAY_MS,
  WEEKDAY_CN,
  dayOrder,
  displayTz,
  pad,
  partsInZone,
  slotFor,
  startOfWeekInstant,
} from '../lib/time'
import { hasEnded, occurrencesBetween } from '../lib/schedule'
import ShowCard from './ShowCard'

interface Props {
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  seasonStart: number
  archive?: boolean // 历史季度:纯课表,不标已播/本周无/时刻线
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

export default function WeekView({ shows, tracking, settings, now, seasonStart, archive, friendsMap, onOpen }: Props) {
  const tz = displayTz(settings)
  const days = dayOrder(settings.weekStart)

  const { rows, cells, unknownByDay, dayHeads, todayWd, nowEff } = useMemo(() => {
    const weekStart = startOfWeekInstant(now, tz, settings.weekStart)
    const nowP = partsInZone(now, tz)
    const todayWd = nowP.wd
    // 当前时刻在时间轴上的位置(深夜表记下 0-6 点折算为 24+)
    let nowEff = nowP.hh * 60 + nowP.mm
    if (settings.lateNight && nowP.hh < 6) nowEff += 1440

    const slots = shows.map((s) => slotFor(s, settings))
    const rowSet = new Set<number>()
    // cell key `${day}:${minutes}` → slots
    const cells = new Map<string, ReturnType<typeof mkCell>[]>()
    const unknownByDay = new Map<number, Show[]>()

    function mkCell(show: Show) {
      if (archive) return { show, airedMark: false, offWeek: false }
      const thisWeek = occurrencesBetween(show, weekStart, weekStart + 7 * DAY_MS - 1)[0] ?? null
      const ended = hasEnded(show, now)
      const offWeek = ended || thisWeek === null
      const airedMark = !offWeek && thisWeek !== null && thisWeek.t <= now
      return { show, airedMark, offWeek }
    }

    for (const slot of slots) {
      if (!slot.known) {
        if (slot.day >= 1 && slot.day <= 7) {
          const list = unknownByDay.get(slot.day) ?? []
          list.push(slot.show)
          unknownByDay.set(slot.day, list)
        }
        continue
      }
      rowSet.add(slot.minutes)
      const key = `${slot.day}:${slot.minutes}`
      const list = cells.get(key) ?? []
      list.push(mkCell(slot.show))
      cells.set(key, list)
    }

    const rows = [...rowSet].sort((a, b) => a - b)

    const dayHeads = days.map((wd, i) => {
      const t = weekStart + i * DAY_MS
      const p = partsInZone(t + 12 * 3600_000, tz) // 当天正午,避开 DST 边界
      return { wd, label: `${p.mo}/${p.d}` }
    })

    return { rows, cells, unknownByDay, dayHeads, todayWd, nowEff }
  }, [shows, settings, now, tz, days, archive])

  const fmtRow = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  const hasUnknown = unknownByDay.size > 0
  // 当前时刻线插在第一个晚于现在的时间行之前
  const nowIdx = (() => {
    const i = rows.findIndex((m) => m > nowEff)
    return i === -1 ? rows.length : i
  })()
  const nowLabel = `${pad(Math.floor(nowEff / 60))}:${pad(nowEff % 60)}`

  const nowRow = (
    <>
      <div className="wg-now-time" title="当前时刻">
        {nowLabel}
      </div>
      {days.map((wd) => (
        <div key={wd} className="wg-now" />
      ))}
    </>
  )

  return (
    <div className="week-grid">
      <div className="wg-corner" />
      {dayHeads.map((h) => (
        <div key={h.wd} className={`wg-dayhead${!archive && h.wd === todayWd ? ' today' : ''}`}>
          <div className="d1">周{WEEKDAY_CN[h.wd]}</div>
          {!archive && <div className="d2">{h.label}</div>}
        </div>
      ))}

      {rows.map((m, i) => {
        const night = m >= 1440 || m < 360
        return (
          <Fragment key={m}>
            {!archive && i === nowIdx && nowRow}
            <RowFrag
              minutes={m}
              night={night}
              label={fmtRow(m)}
              days={days}
              todayWd={archive ? 0 : todayWd}
              cells={cells}
              tracking={tracking}
              now={now}
              seasonStart={seasonStart}
              archive={archive}
              friendsMap={friendsMap}
              onOpen={onOpen}
            />
          </Fragment>
        )
      })}
      {!archive && rows.length > 0 && nowIdx === rows.length && nowRow}

      {hasUnknown && (
        <>
          <div className="wg-time" title="未提供精确时间">
            未定
          </div>
          {days.map((wd) => (
            <div key={wd} className={`wg-cell${!archive && wd === todayWd ? ' today' : ''}`}>
              {(unknownByDay.get(wd) ?? []).map((s) => (
                <ShowCard
                  key={s.id}
                  show={s}
                  tracking={tracking}
                  now={now}
                  seasonStart={seasonStart}
                  archive={archive}
                  friendsMap={friendsMap}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

interface RowProps {
  minutes: number
  night: boolean
  label: string
  days: number[]
  todayWd: number
  cells: Map<string, { show: Show; airedMark: boolean; offWeek: boolean }[]>
  tracking: Tracking
  now: number
  seasonStart: number
  archive?: boolean
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

function RowFrag({
  minutes,
  night,
  label,
  days,
  todayWd,
  cells,
  tracking,
  now,
  seasonStart,
  archive,
  friendsMap,
  onOpen,
}: RowProps) {
  return (
    <>
      <div className={`wg-time${night ? ' night' : ''}`}>{label}</div>
      {days.map((wd) => {
        const list = cells.get(`${wd}:${minutes}`) ?? []
        const trackedHere = list.filter(
          (c) => tracking.status[c.show.id] === 'watching' || tracking.status[c.show.id] === 'wish',
        ).length
        return (
          <div key={wd} className={`wg-cell${night ? ' night' : ''}${wd === todayWd ? ' today' : ''}`}>
            {trackedHere >= 2 && <span className="conflict">⚡撞档</span>}
            {list.map((c) => (
              <ShowCard
                key={c.show.id}
                show={c.show}
                tracking={tracking}
                now={now}
                seasonStart={seasonStart}
                archive={archive}
                friendsMap={friendsMap}
                airedMark={c.airedMark}
                offWeek={c.offWeek}
                onOpen={onOpen}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}
