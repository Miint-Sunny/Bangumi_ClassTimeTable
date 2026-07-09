import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { AirFix, FriendsMap, Settings, Show, Tracking, WatchStatus } from '../types'
import type { SubjectInfo } from '../lib/api'
import { airedEps, behindCount } from '../lib/progress'
import { epLabel, nextEpisode, occurrencesBetween } from '../lib/schedule'
import { DAY_MS, WEEKDAY_CN, dayOrder, pad, partsInZone, relTime, startOfDayInstant } from '../lib/time'
import { DetailBody } from './DetailModal'

const MIN_WIDTH = 240 // 拖到这以下松手 = 收起
const MAX_WIDTH = 720

interface Props {
  openShow: Show | null
  shows: Show[]
  tracking: Tracking
  settings: Settings
  now: number
  seasonStart: number
  archive: boolean
  friendsMap: FriendsMap
  hasLocalOverride: boolean
  tz: string
  width: number
  view: 'day' | 'week' | 'month'
  dayCursor: number
  onResizeEnd: (w: number | null) => void // null = 收起
  onJumpDay: (offset: number) => void
  onOpen: (id: number) => void
  onSetStatus: (id: number, s: WatchStatus | null) => void
  onSetWatched: (id: number, n: number) => void
  onSetOverride: (id: number, fix: AirFix | null) => void
  onSubjectInfo: (info: SubjectInfo) => void
  onClose: () => void
}

/** 宽屏右侧常驻面板:选中番剧时是详情,空闲时是追番速览;左缘手柄可拖宽,拖到最小即收起 */
export default function SidePanel(props: Props) {
  const { openShow, width, onResizeEnd } = props
  const ref = useRef<HTMLElement>(null)
  const [dragW, setDragW] = useState<number | null>(null)

  const onGripDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    const right = ref.current?.getBoundingClientRect().right ?? e.clientX + width
    const move = (ev: PointerEvent) => setDragW(Math.min(MAX_WIDTH, Math.max(140, right - ev.clientX)))
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragW(null)
      const w = right - ev.clientX
      onResizeEnd(w < MIN_WIDTH ? null : Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w))))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const willCollapse = dragW !== null && dragW < MIN_WIDTH

  return (
    <aside
      ref={ref}
      className={`side-panel${openShow ? ' has-detail' : ''}${willCollapse ? ' will-collapse' : ''}`}
      style={{ width: dragW ?? width }}
    >
      <div className="panel-grip" onPointerDown={onGripDown} title="拖动调宽,拖到最窄即收起" />
      {openShow ? (
        <DetailBody
          key={openShow.id}
          show={openShow}
          tracking={props.tracking}
          settings={props.settings}
          now={props.now}
          seasonStart={props.seasonStart}
          friendsMap={props.friendsMap}
          hasLocalOverride={props.hasLocalOverride}
          onSetStatus={props.onSetStatus}
          onSetWatched={props.onSetWatched}
          onSetOverride={props.onSetOverride}
          onSubjectInfo={props.onSubjectInfo}
          onClose={props.onClose}
        />
      ) : (
        <DashBody {...props} />
      )}
    </aside>
  )
}

// ── 追番速览(无选中时的默认内容) ────────────────────────────────

function DashBody(props: Props) {
  const { shows, tracking, now, archive, tz, onOpen, onSetWatched, friendsMap } = props
  const tracked = shows.filter((s) => {
    const st = tracking.status[s.id]
    return st === 'watching' || st === 'wish'
  })

  const behindList = shows
    .map((s) => ({ s, behind: behindCount(s, tracking, now) }))
    .filter((x) => x.behind > 0)
    .sort((a, b) => b.behind - a.behind)
    .slice(0, 10)

  const upcoming = tracked
    .map((s) => ({ s, nx: nextEpisode(s, now) }))
    .filter((x): x is { s: Show; nx: NonNullable<ReturnType<typeof nextEpisode>> } => x.nx !== null)
    .sort((a, b) => a.nx.t - b.nx.t)
    .slice(0, 6)

  // 好友动态:公开收藏里最近有进度变化的本季番
  const friendFeed = (() => {
    const items: { user: string; show: Show; ep: number; at: number }[] = []
    for (const show of shows) {
      const m = friendsMap.get(show.id)
      if (!m) continue
      for (const [user, st] of m) {
        const at = st.updatedAt ? Date.parse(st.updatedAt) : NaN
        if (!Number.isNaN(at)) items.push({ user, show, ep: st.ep, at })
      }
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 8)
  })()

  const fmtT = (t: number) => {
    const p = partsInZone(t, tz)
    return `${p.mo}/${p.d} ${pad(p.hh)}:${pad(p.mm)}`
  }

  const openLink = (id: number) => (e: MouseEvent) => {
    e.preventDefault()
    onOpen(id)
  }

  return (
    <div className="dash">
      {tracked.length === 0 ? (
        <>
          <div className="dash-hint">
            点击课表里的番剧卡片,详情会在这里展开。
            <br />
            标记「在看 / 想看」后,这里会变成你的补番清单和更新日程。
          </div>
          <TopRated {...props} openLink={openLink} />
        </>
      ) : (
        <>
          <div className="dm-sec">
            <div className="sec-t">
              补番清单
              {behindList.length > 0 ? `(欠 ${behindList.reduce((a, x) => a + x.behind, 0)} 集)` : ''}
            </div>
            {behindList.length === 0 ? (
              <div className="dash-hint">没有落后的番,轻松。</div>
            ) : (
              behindList.map(({ s, behind }) => {
                const watched = tracking.watched[s.id] ?? 0
                const aired = airedEps(s, now)
                return (
                  <div key={s.id} className="dash-row">
                    <a href="#" className="nm" onClick={openLink(s.id)} title={s.nameCn}>
                      {s.nameCn}
                    </a>
                    <span className="prog">
                      {watched}/{aired}
                    </span>
                    <span className="behind">-{behind}</span>
                    <button className="mini" title="看了一集" onClick={() => onSetWatched(s.id, watched + 1)}>
                      +1
                    </button>
                    <button className="mini" title="补到已播" onClick={() => onSetWatched(s.id, aired ?? watched)}>
                      补齐
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {!archive && upcoming.length > 0 && (
            <div className="dm-sec">
              <div className="sec-t">我的更新日程</div>
              {upcoming.map(({ s, nx }) => (
                <div key={s.id} className="dash-row">
                  <span className="when" title={fmtT(nx.t)}>
                    {relTime(nx.t, now)}
                  </span>
                  <a href="#" className="nm" onClick={openLink(s.id)} title={s.nameCn}>
                    {s.nameCn}
                  </a>
                  <span className="ep">{epLabel(nx)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {friendFeed.length > 0 && (
        <div className="dm-sec">
          <div className="sec-t">好友动态</div>
          {friendFeed.map((f) => (
            <div key={`${f.user}-${f.show.id}`} className="dash-row">
              <span className="user">{f.user}</span>
              <a href="#" className="nm" onClick={openLink(f.show.id)} title={f.show.nameCn}>
                {f.show.nameCn}
              </a>
              <span className="ep">看到{f.ep}</span>
              <span className="ago">{relTime(f.at, now)}</span>
            </div>
          ))}
        </div>
      )}

      {!archive && <MiniCal {...props} />}
    </div>
  )
}

function TopRated(props: Props & { openLink: (id: number) => (e: MouseEvent) => void }) {
  const top = [...props.shows]
    .filter((s) => s.score)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 6)
  if (top.length === 0) return null
  return (
    <div className="dm-sec">
      <div className="sec-t">{props.archive ? '该季' : '本季'}高分</div>
      {top.map((s) => (
        <div key={s.id} className="dash-row">
          <span className="score">★{s.score!.toFixed(1)}</span>
          <a href="#" className="nm" onClick={props.openLink(s.id)}>
            {s.nameCn}
          </a>
        </div>
      ))}
    </div>
  )
}

/** 迷你月历:追番的更新日打点,点日期跳到日视图 */
function MiniCal({ shows, tracking, settings, now, tz, view, dayCursor, onJumpDay }: Props) {
  const todayStart = startOfDayInstant(now, tz)
  const p = partsInZone(now, tz)
  const daysInMonth = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate()
  const firstOffset = -(p.d - 1) // 本月 1 号相对今天的偏移
  const headWds = dayOrder(settings.weekStart)
  const firstWd = partsInZone(todayStart + firstOffset * DAY_MS + 12 * 3600_000, tz).wd
  const lead = (firstWd - headWds[0] + 7) % 7

  // 追番更新日打点
  const tracked = shows.filter((s) => {
    const st = tracking.status[s.id]
    return st === 'watching' || st === 'wish'
  })
  const dots = new Set<number>()
  if (tracked.length > 0) {
    const lo = todayStart + firstOffset * DAY_MS
    const hi = lo + daysInMonth * DAY_MS
    for (const s of tracked) {
      for (const o of occurrencesBetween(s, lo, hi)) {
        const op = partsInZone(o.t, tz)
        if (op.mo === p.mo) dots.add(op.d)
      }
    }
  }

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="dm-sec">
      <div className="sec-t">
        {p.y} 年 {p.mo} 月 · 点日期看当天
      </div>
      <div className="minical">
        {headWds.map((wd) => (
          <span key={`h${wd}`} className="mc-head">
            {WEEKDAY_CN[wd]}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} className="mc-cell empty" />
          const offset = firstOffset + (d - 1)
          const selected = view === 'day' && offset === dayCursor
          return (
            <button
              key={d}
              className={`mc-cell${offset === 0 ? ' today' : ''}${selected ? ' sel' : ''}`}
              onClick={() => onJumpDay(offset)}
            >
              {d}
              {dots.has(d) ? <i className="dot" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
