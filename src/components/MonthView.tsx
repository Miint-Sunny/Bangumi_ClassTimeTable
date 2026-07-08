import { useMemo, useState } from 'react'
import type { FriendsMap, Settings, Show, Tracking } from '../types'
import { WEEKDAY_CN, dayOrder, displayTz, partsInZone, slotFor } from '../lib/time'
import { epLabel, occurrencesBetween } from '../lib/schedule'

interface Props {
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

interface Entry {
  show: Show
  ep: number
  epEnd: number
  minutes: number
  aired: boolean
}

/** 月视图:整月日历,每天列出更新的番和集数 —— 同类项目没有的视图 */
export default function MonthView({ shows, tracking, settings, now, onOpen }: Props) {
  const tz = displayTz(settings)
  const nowP = partsInZone(now, tz)
  const [cursor, setCursor] = useState({ y: nowP.y, mo: nowP.mo })

  const nav = (delta: number) => {
    setCursor((c) => {
      const idx = c.y * 12 + (c.mo - 1) + delta
      return { y: Math.floor(idx / 12), mo: (idx % 12) + 1 }
    })
  }

  const { weeks, headWds } = useMemo(() => {
    const { y, mo } = cursor
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    const headWds = dayOrder(settings.weekStart)

    // 该月 1 号是周几(取当天正午的 instant 在展示时区下的周几,避开时区日界)
    const firstWd = partsInZone(Date.UTC(y, mo - 1, 1, 12), tz).wd
    const lead = (firstWd - headWds[0] + 7) % 7

    interface Cell {
      y: number
      mo: number
      d: number
      out: boolean
      entries: Entry[]
      isToday: boolean
    }
    const cells: Cell[] = []

    const push = (cy: number, cmo: number, cd: number, out: boolean) => {
      cells.push({
        y: cy,
        mo: cmo,
        d: cd,
        out,
        entries: [],
        isToday: cy === nowP.y && cmo === nowP.mo && cd === nowP.d,
      })
    }

    // 前导:上个月
    const prevIdx = cursor.y * 12 + (cursor.mo - 1) - 1
    const py = Math.floor(prevIdx / 12)
    const pmo = (prevIdx % 12) + 1
    const prevDays = new Date(Date.UTC(py, pmo, 0)).getUTCDate()
    for (let i = lead - 1; i >= 0; i--) push(py, pmo, prevDays - i, true)
    // 本月
    for (let d = 1; d <= daysInMonth; d++) push(y, mo, d, false)
    // 补尾到整周
    const nextIdx = cursor.y * 12 + (cursor.mo - 1) + 1
    const ny = Math.floor(nextIdx / 12)
    const nmo = (nextIdx % 12) + 1
    let nd = 1
    while (cells.length % 7 !== 0) push(ny, nmo, nd++, true)

    // 整月放送一次性取出,按展示时区的日期分桶(±36h 余量吞掉时区日界)
    const first = cells[0]
    const last = cells[cells.length - 1]
    const lo = Date.UTC(first.y, first.mo - 1, first.d, 12) - 36 * 3600_000
    const hi = Date.UTC(last.y, last.mo - 1, last.d, 12) + 36 * 3600_000
    const buckets = new Map<string, Entry[]>()
    for (const s of shows) {
      const minutes = slotFor(s, settings).minutes
      for (const o of occurrencesBetween(s, lo, hi)) {
        const p = partsInZone(o.t, tz)
        const key = `${p.y}-${p.mo}-${p.d}`
        const list = buckets.get(key) ?? []
        list.push({ show: s, ep: o.ep, epEnd: o.epEnd, minutes, aired: o.t <= now })
        buckets.set(key, list)
      }
    }
    for (const c of cells) {
      if (c.out) continue
      c.entries = (buckets.get(`${c.y}-${c.mo}-${c.d}`) ?? []).sort(
        (a, b) => a.minutes - b.minutes || a.show.id - b.show.id,
      )
    }

    const weeks: Cell[][] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    return { weeks, headWds }
  }, [cursor, shows, settings, tz, now, nowP.y, nowP.mo, nowP.d])

  return (
    <div>
      <div className="month-nav">
        <button className="iconbtn" onClick={() => nav(-1)}>
          ‹ 上月
        </button>
        <span className="m-title">
          {cursor.y} 年 {cursor.mo} 月
        </span>
        <button className="iconbtn" onClick={() => nav(1)}>
          下月 ›
        </button>
        {(cursor.y !== nowP.y || cursor.mo !== nowP.mo) && (
          <button className="iconbtn" onClick={() => setCursor({ y: nowP.y, mo: nowP.mo })}>
            回到本月
          </button>
        )}
      </div>

      <div className="month-grid">
        {headWds.map((wd) => (
          <div key={wd} className="mg-head">
            周{WEEKDAY_CN[wd]}
          </div>
        ))}
        {weeks.flat().map((c, i) => (
          <div key={i} className={`mg-cell${c.out ? ' out' : ''}${c.isToday ? ' today' : ''}`}>
            <div className="date">{c.d}</div>
            {!c.out && (
              <div className="mg-entries">
                {c.entries.map((e) => {
                  const st = tracking.status[e.show.id] ?? 'none'
                  const epText = epLabel({ ep: e.ep, epEnd: e.epEnd, t: 0 })
                  return (
                    <button
                      key={`${e.show.id}-${e.ep}`}
                      className={`mg-entry st-${st}${e.aired ? ' aired' : ''}`}
                      title={`${e.show.nameCn} 第${e.epEnd > e.ep ? `${e.ep}-${e.epEnd}` : e.ep}集`}
                      onClick={() => onOpen(e.show.id)}
                    >
                      <span className="ep">{epText}</span>
                      <span className="nm">{e.show.nameCn}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
