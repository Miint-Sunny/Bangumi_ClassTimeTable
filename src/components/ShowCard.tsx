import type { FriendsMap, Show, Tracking } from '../types'
import { airedEps, behindCount } from '../lib/progress'

interface Props {
  show: Show
  tracking: Tracking
  now: number
  friendsMap: FriendsMap
  timeLabel?: string
  airedMark?: boolean // 本周该集已播
  offWeek?: boolean // 本周无更新(完结/延期)
  onOpen: (id: number) => void
}

export default function ShowCard({ show, tracking, now, friendsMap, airedMark, offWeek, onOpen }: Props) {
  const status = tracking.status[show.id] ?? 'none'
  const watched = tracking.watched[show.id] ?? 0
  const aired = airedEps(show, now)
  const behind = behindCount(show, tracking, now)
  const friendCount = friendsMap.get(show.id)?.size ?? 0

  const cls = [
    'show-card',
    `st-${status}`,
    airedMark ? 'aired' : '',
    offWeek ? 'offweek' : '',
  ].join(' ')

  return (
    <button className={cls} onClick={() => onOpen(show.id)} title={show.nameJp}>
      {show.image ? (
        <img className="cover" src={show.image} loading="lazy" alt="" />
      ) : (
        <span className="cover ph">番</span>
      )}
      <span className="body">
        <span className="title">{show.nameCn}</span>
        <span className="meta">
          {show.score ? <span className="score">★{show.score.toFixed(1)}</span> : null}
          {status === 'watching' && aired !== undefined ? (
            <span className="ep-badge">
              {watched}/{aired}
              {show.epsTotal ? `/${show.epsTotal}` : ''}
            </span>
          ) : aired !== undefined && aired > 0 ? (
            <span className="ep-badge">更新至{aired}</span>
          ) : null}
          {behind > 0 ? <span className="behind">落后{behind}</span> : null}
          {friendCount > 0 ? <span className="friends">友{friendCount}</span> : null}
          {!show.fromCalendar ? <span className="streamtag">流媒体</span> : null}
          {offWeek ? <span>本周无</span> : null}
        </span>
      </span>
    </button>
  )
}
