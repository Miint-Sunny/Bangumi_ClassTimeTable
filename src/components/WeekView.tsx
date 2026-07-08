import { useMemo } from 'react'
import type { FriendsMap, Settings, Show, Tracking } from '../types'
import {
  DAY_MS,
  WEEKDAY_CN,
  dayOrder,
  displayTz,
  hasEnded,
  nextOccurrence,
  partsInZone,
  slotFor,
  startOfWeekInstant,
} from '../lib/time'
import ShowCard from './ShowCard'

interface Props {
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

export default function WeekView({ shows, tracking, settings, now, friendsMap, onOpen }: Props) {
  const tz = displayTz(settings)
  const days = dayOrder(settings.weekStart)

  const { rows, cells, unknownByDay, dayHeads, todayWd } = useMemo(() => {
    const weekStart = startOfWeekInstant(now, tz, settings.weekStart)
    const todayWd = partsInZone(now, tz).wd

    const slots = shows.map((s) => slotFor(s, settings))
    const rowSet = new Set<number>()
    // cell key `${day}:${minutes}` → slots
    const cells = new Map<string, ReturnType<typeof mkCell>[]>()
    const unknownByDay = new Map<number, Show[]>()

    function mkCell(show: Show) {
      const occ = nextOccurrence(show, weekStart)
      const ended = hasEnded(show, now)
      const airedMark = occ !== null && occ <= now
      const offWeek = ended || (occ !== null && occ >= weekStart + 7 * DAY_MS)
      return { show, airedMark: airedMark && !offWeek, offWeek }
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

    return { rows, cells, unknownByDay, dayHeads, todayWd }
  }, [shows, settings, now, tz, days])

  const fmtRow = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  const hasUnknown = unknownByDay.size > 0

  return (
    <div className="week-scroll">
      <div className="week-grid">
        <div className="wg-corner" />
        {dayHeads.map((h) => (
          <div key={h.wd} className={`wg-dayhead${h.wd === todayWd ? ' today' : ''}`}>
            <div className="d1">周{WEEKDAY_CN[h.wd]}</div>
            <div className="d2">{h.label}</div>
          </div>
        ))}

        {rows.map((m) => {
          const night = m >= 1440 || m < 360
          return (
            <RowFrag
              key={m}
              minutes={m}
              night={night}
              label={fmtRow(m)}
              days={days}
              todayWd={todayWd}
              cells={cells}
              tracking={tracking}
              now={now}
              friendsMap={friendsMap}
              onOpen={onOpen}
            />
          )
        })}

        {hasUnknown && (
          <>
            <div className="wg-time" title="calendar API 未提供精确时间">
              未定
            </div>
            {days.map((wd) => (
              <div key={wd} className={`wg-cell${wd === todayWd ? ' today' : ''}`}>
                {(unknownByDay.get(wd) ?? []).map((s) => (
                  <ShowCard
                    key={s.id}
                    show={s}
                    tracking={tracking}
                    now={now}
                    friendsMap={friendsMap}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
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
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

function RowFrag({ minutes, night, label, days, todayWd, cells, tracking, now, friendsMap, onOpen }: RowProps) {
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
