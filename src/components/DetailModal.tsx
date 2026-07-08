import { useEffect, useState } from 'react'
import type { FriendsMap, Settings, Show, Tracking, WatchStatus } from '../types'
import { fetchSubject, type SubjectInfo } from '../lib/api'
import { airedEps, behindCount } from '../lib/progress'
import {
  WEEKDAY_CN,
  displayTz,
  epNumberAt,
  isCarryOver,
  nextOccurrence,
  pad,
  partsInZone,
  relTime,
  slotFor,
} from '../lib/time'

interface Props {
  show: Show
  tracking: Tracking
  settings: Settings
  now: number
  friendsMap: FriendsMap
  onSetStatus: (id: number, s: WatchStatus | null) => void
  onSetWatched: (id: number, n: number) => void
  onSubjectInfo: (info: SubjectInfo) => void
  onClose: () => void
}

const STATUS_BTNS: { k: WatchStatus; label: string }[] = [
  { k: 'wish', label: '想看' },
  { k: 'watching', label: '在看' },
  { k: 'done', label: '看过' },
  { k: 'dropped', label: '抛弃' },
]

export default function DetailModal(props: Props) {
  const { show, tracking, settings, now, friendsMap, onSetStatus, onSetWatched, onSubjectInfo, onClose } = props
  const [info, setInfo] = useState<SubjectInfo | null>(null)

  useEffect(() => {
    let alive = true
    fetchSubject(show.id)
      .then((i) => {
        if (!alive) return
        setInfo(i)
        onSubjectInfo(i)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const status = tracking.status[show.id] ?? 'none'
  const watched = tracking.watched[show.id] ?? 0
  const aired = airedEps(show, now)
  const behind = behindCount(show, tracking, now)
  const epsTotal = show.epsTotal ?? info?.eps
  const image = show.image ?? info?.image
  const score = show.score ?? info?.score

  const slot = slotFor(show, settings)
  const tz = displayTz(settings)
  const next = nextOccurrence(show, now)
  const nextEp = next !== null ? epNumberAt(show, next) : null
  const nextValid =
    next !== null && nextEp !== null && !(epsTotal && nextEp > epsTotal) && !(show.end && next > show.end)

  const friends = friendsMap.get(show.id)

  const fmtNext = (t: number) => {
    const p = partsInZone(t, tz)
    return `${p.mo}月${p.d}日(周${WEEKDAY_CN[p.wd]}) ${pad(p.hh)}:${pad(p.mm)}`
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        <div className="dm-head">
          {image ? <img className="cover" src={image} alt="" /> : null}
          <div>
            <h2>
              <a href={`https://bgm.tv/subject/${show.id}`} target="_blank" rel="noreferrer">
                {show.nameCn}
              </a>
            </h2>
            {show.nameJp !== show.nameCn && <div className="jp">{show.nameJp}</div>}
            <div className="facts">
              {score ? (
                <>
                  <span className="score">★ {score.toFixed(1)}</span>
                  {show.rank ? <span> · 排名 #{show.rank}</span> : null}
                  <br />
                </>
              ) : null}
              {show.watchers ? <>{show.watchers} 人在看 · </> : null}
              {show.sourceType ?? ''}
              {isCarryOver(show, now) ? <> · 上季续播</> : null}
            </div>
            {show.tags && show.tags.length > 0 && (
              <div className="dm-tags">
                {show.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dm-sec">
          <div className="sec-t">放送</div>
          <div className="dm-airinfo">
            {slot.known ? (
              <>
                每周{WEEKDAY_CN[slot.day]} <b>{slot.label}</b>({settings.tzMode === 'jst' ? '日本时间' : '本地时间'})
              </>
            ) : show.airWeekdayJst ? (
              <>每周{WEEKDAY_CN[show.airWeekdayJst]}(日本时间,具体时刻未知)</>
            ) : (
              <>放送时间未知</>
            )}
            {nextValid && (
              <>
                <br />
                下一集 第 {nextEp} 集 · <b>{fmtNext(next!)}</b>({relTime(next!, now)})
              </>
            )}
            {aired !== undefined && (
              <>
                <br />
                已播出 <b>{aired}</b> 集{epsTotal ? ` / 全 ${epsTotal} 集` : ''}
              </>
            )}
          </div>
        </div>

        <div className="dm-sec">
          <div className="sec-t">追番状态(本地保存)</div>
          <div className="status-row">
            {STATUS_BTNS.map((b) => (
              <button
                key={b.k}
                className={status === b.k ? `on-${b.k}` : ''}
                onClick={() => onSetStatus(show.id, status === b.k ? null : b.k)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {(status === 'watching' || watched > 0) && (
          <div className="dm-sec">
            <div className="sec-t">进度</div>
            <div className="ep-stepper">
              <button onClick={() => onSetWatched(show.id, Math.max(0, watched - 1))}>−</button>
              <span className="val">
                {watched}
                <small>{epsTotal ? ` / ${epsTotal}` : ''} 集</small>
              </span>
              <button onClick={() => onSetWatched(show.id, epsTotal ? Math.min(epsTotal, watched + 1) : watched + 1)}>
                +
              </button>
              {behind > 0 && (
                <>
                  <span className="behind">落后 {behind} 集</span>
                  <button className="catchup" onClick={() => onSetWatched(show.id, aired ?? watched)}>
                    补到已播
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {friends && friends.size > 0 && (
          <div className="dm-sec">
            <div className="sec-t">好友进度</div>
            <div className="friend-line">
              {[...friends.entries()].map(([user, st]) => (
                <span key={user}>
                  <b>{user}</b> 看到第 {st.ep} 集
                </span>
              ))}
            </div>
          </div>
        )}

        {(show.sites.length > 0 || show.officialSite || show.pvUrl) && (
          <div className="dm-sec">
            <div className="sec-t">链接</div>
            <div className="links-row">
              {show.pvUrl && (
                <a href={show.pvUrl} target="_blank" rel="noreferrer">
                  ▶ PV
                </a>
              )}
              {show.officialSite && (
                <a href={show.officialSite} target="_blank" rel="noreferrer">
                  官网
                </a>
              )}
              {show.sites.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                  {s.site}
                </a>
              ))}
            </div>
          </div>
        )}

        {info?.summary && (
          <div className="dm-sec">
            <div className="sec-t">简介</div>
            <div className="dm-summary">{info.summary}</div>
          </div>
        )}
      </div>
    </div>
  )
}
