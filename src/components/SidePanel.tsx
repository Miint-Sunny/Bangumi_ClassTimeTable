import type { MouseEvent } from 'react'
import type { AirFix, FriendsMap, Settings, Show, Tracking, WatchStatus } from '../types'
import type { SubjectInfo } from '../lib/api'
import { airedEps, behindCount } from '../lib/progress'
import { epLabel, nextEpisode } from '../lib/schedule'
import { pad, partsInZone, relTime } from '../lib/time'
import { DetailBody } from './DetailModal'

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
  onOpen: (id: number) => void
  onSetStatus: (id: number, s: WatchStatus | null) => void
  onSetWatched: (id: number, n: number) => void
  onSetOverride: (id: number, fix: AirFix | null) => void
  onSubjectInfo: (info: SubjectInfo) => void
  onClose: () => void
}

/** 宽屏右侧常驻面板:选中番剧时是详情,空闲时是追番速览 */
export default function SidePanel(props: Props) {
  const { openShow } = props
  return (
    <aside className={`side-panel${openShow ? ' has-detail' : ''}`}>
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

function DashBody({ shows, tracking, now, archive, tz, onOpen, onSetWatched }: Props) {
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

  const fmtT = (t: number) => {
    const p = partsInZone(t, tz)
    return `${p.mo}/${p.d} ${pad(p.hh)}:${pad(p.mm)}`
  }

  const openLink = (id: number) => (e: MouseEvent) => {
    e.preventDefault()
    onOpen(id)
  }

  if (tracked.length === 0) {
    const top = [...shows]
      .filter((s) => s.score)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 6)
    return (
      <div className="dash">
        <div className="dash-hint">
          点击课表里的番剧卡片,详情会在这里展开。
          <br />
          标记「在看 / 想看」后,这里会变成你的补番清单和更新日程。
        </div>
        {top.length > 0 && (
          <div className="dm-sec">
            <div className="sec-t">{archive ? '该季' : '本季'}高分</div>
            {top.map((s) => (
              <div key={s.id} className="dash-row">
                <span className="score">★{s.score!.toFixed(1)}</span>
                <a href="#" className="nm" onClick={openLink(s.id)}>
                  {s.nameCn}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dash">
      <div className="dm-sec">
        <div className="sec-t">补番清单{behindList.length > 0 ? `(欠 ${behindList.reduce((a, x) => a + x.behind, 0)} 集)` : ''}</div>
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
    </div>
  )
}
