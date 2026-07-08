import { useMemo } from 'react'
import type { FriendsMap, Settings, Show, Tracking } from '../types'
import { displayTz, epNumberAt, hasEnded, nextOccurrence, pad, partsInZone, relTime } from '../lib/time'

interface Props {
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  friendsMap: FriendsMap
  onOpen: (id: number) => void
}

interface Occ {
  show: Show
  t: number
  ep: number
}

/** 日视图:过去 6 小时 + 未来 24 小时的更新时间线 */
export default function DayView({ shows, tracking, settings, now, friendsMap, onOpen }: Props) {
  const tz = displayTz(settings)

  const { past, upcoming, unknownToday } = useMemo(() => {
    const lo = now - 6 * 3600_000
    const hi = now + 24 * 3600_000
    const occs: Occ[] = []
    const unknownToday: Show[] = []
    const todayWdJst = partsInZone(now, 'Asia/Tokyo').wd

    for (const show of shows) {
      if (!show.begin) {
        if (show.airWeekdayJst === todayWdJst) unknownToday.push(show)
        continue
      }
      let t = nextOccurrence(show, lo)
      while (t !== null && t <= hi) {
        const ep = epNumberAt(show, t)
        const overEnd = (show.end && t > show.end) || (show.epsTotal && ep > show.epsTotal)
        if (!overEnd && !(hasEnded(show, now) && t > now)) occs.push({ show, t, ep })
        t += show.periodDays * 86400_000
      }
    }
    occs.sort((a, b) => a.t - b.t || a.show.id - b.show.id)
    return {
      past: occs.filter((o) => o.t <= now),
      upcoming: occs.filter((o) => o.t > now),
      unknownToday,
    }
  }, [shows, now])

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
          第 {o.ep} 集{o.show.epsTotal ? ` / 全 ${o.show.epsTotal} 集` : ''}
        </div>
      </div>
    )
  }

  return (
    <div className="day-view">
      <div className="day-section-title">刚刚播出(6 小时内)</div>
      {past.length === 0 ? <div className="day-empty">—</div> : past.map((o) => row(o, true))}

      <div className="day-section-title">接下来 24 小时</div>
      {upcoming.length === 0 ? <div className="day-empty">没有更新,清净的一天。</div> : upcoming.map((o) => row(o, false))}

      {unknownToday.length > 0 && (
        <>
          <div className="day-section-title">今天更新 · 具体时间未知</div>
          {unknownToday.map((s) => (
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
