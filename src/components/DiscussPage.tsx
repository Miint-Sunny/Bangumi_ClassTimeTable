/**
 * 新番讨论会:几个人(腾讯会议里主持人共享屏幕)一部一部过下季新番。
 * 左侧议程列表(标题 + 各人态度点,当前行高亮自动滚入),右侧聚焦当前一部:封面、首播、来源、
 * 制作/导演/系列构成/人物设定、声优、标签、完整简介、外链(不内嵌视频);底部是我的标记与大家的态度。
 *
 * 我的"想看"直接落到追番状态(随收藏同步到 bgm);"观望 / 跳过"只是讨论标记,存本机。
 * "大家"目前来自设置里好友的 bgm 公开收藏(想看 = 收藏类型 1,缓存 24 小时);房间投票接口打通后再叠加实时票。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Settings, Show, Tracking, WatchStatus } from '../types'
import { fetchSubject, type SubjectInfo } from '../lib/api'
import { fetchFriendLibrary } from '../lib/friends'
import type { Upcoming } from '../lib/merge'
import { fetchStaff, type StaffInfo } from '../lib/staff'
import { closeRoom, createRoom, joinUrl, loadHostRoom, RoomError, roomState, saveHostRoom, setCurrent, voteRoom, type HostRoom, type RoomState } from '../lib/room'
import { QrSvg } from '../lib/qr'
import { boardText, buildBoard, downloadBlob, renderBoardPng, TIER_LABEL, TIERS, type VoteNames } from '../lib/consensus'
import { fmtSeason } from '../lib/seasons'
import { displayName, subName, t, wdFull } from '../lib/i18n'

interface Props {
  upcoming: Upcoming
  shows: Show[]
  tracking: Tracking
  settings: Settings
  friends: string[]
  hostNick: string // 主持人在房间里的名字(bgm 昵称或"主持人")
  now: number
  onSetStatus: (id: number, s: WatchStatus | null) => void
  onSubjectInfo: (info: SubjectInfo) => void
  onClose: () => void
}

type Mark = 'wish' | 'maybe' | 'skip'
type SortKey = 'date' | 'wish'
const MARKS: Mark[] = ['wish', 'maybe', 'skip']
const MARK_LABEL: Record<Mark, string> = { wish: '想看', maybe: '观望', skip: '跳过' }

const marksKey = (season: string) => `btt:discuss:${season}`
const posKey = (season: string) => `btt:discuss:pos:${season}`
const readJson = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {}
}

const isoWeekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}
const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`
const fmtN = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}w` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export default function DiscussPage({ upcoming, shows, tracking, settings, friends, hostNick, now, onSetStatus, onSubjectInfo, onClose }: Props) {
  const season = upcoming.season
  const [sort, setSort] = useState<SortKey>('date')
  const [marks, setMarks] = useState<Record<number, Mark>>(() => readJson(marksKey(season), {}))
  const [curId, setCurId] = useState<number | null>(() => readJson<number | null>(posKey(season), null))
  const [info, setInfo] = useState<SubjectInfo | null>(null)
  const [staff, setStaff] = useState<Map<number, StaffInfo>>(new Map())
  const [friendWish, setFriendWish] = useState<Map<number, string[]>>(new Map())
  const [friendState, setFriendState] = useState<'idle' | 'loading' | 'done'>('idle')
  const curRef = useRef<HTMLButtonElement>(null)
  // ── 房间(手机投票):主持人本机存房间码 + hostKey;3 秒拉一次票 ──
  const [room, setRoom] = useState<HostRoom | null>(() => loadHostRoom(season))
  const [rs, setRs] = useState<RoomState | null>(null)
  const [roomBusy, setRoomBusy] = useState(false)
  const [roomErr, setRoomErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [textCopied, setTextCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ── 顺序:首播日 / bgm 期待 ──
  const list = useMemo(() => {
    const arr = [...shows]
    const byDate = (a: Show, b: Show) => (a.firstAirDate ?? '9999').localeCompare(b.firstAirDate ?? '9999') || displayName(a).localeCompare(displayName(b))
    if (sort === 'wish') arr.sort((a, b) => (b.wish ?? -1) - (a.wish ?? -1) || byDate(a, b))
    else arr.sort(byDate)
    return arr
  }, [shows, sort])

  const idx = Math.max(0, list.findIndex((s) => s.id === curId))
  const cur = list[idx] ?? null

  const go = useCallback(
    (i: number) => {
      const s = list[Math.min(Math.max(i, 0), list.length - 1)]
      if (!s) return
      setCurId(s.id)
      writeJson(posKey(season), s.id)
    },
    [list, season],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        if (qrOpen) setQrOpen(false)
        else if (boardOpen) setBoardOpen(false)
        else onClose()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(idx + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, go, idx, qrOpen, boardOpen])

  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  // ── 当前一部的详情(简介/热门标签)+ 制作声优;顺带预取后两部 ──
  useEffect(() => {
    if (!cur) return
    let alive = true
    setInfo(null)
    fetchSubject(cur.id)
      .then((i) => {
        if (!alive) return
        setInfo(i)
        onSubjectInfo(i)
      })
      .catch(() => {})
    ;(async () => {
      for (const s of [cur, list[idx + 1], list[idx + 2]].filter(Boolean) as Show[]) {
        if (staff.has(s.id)) continue
        try {
          const st = await fetchStaff(s.id)
          if (!alive) return
          setStaff((m) => new Map(m).set(s.id, st))
        } catch {}
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id])

  // ── 好友的想看(bgm 公开收藏,24h 缓存) ──
  useEffect(() => {
    if (!friends.length) return
    let alive = true
    setFriendState('loading')
    ;(async () => {
      const m = new Map<number, string[]>()
      for (const u of friends) {
        try {
          const lib = await fetchFriendLibrary(u)
          for (const it of lib.items) if (it.type === 1) m.set(it.id, [...(m.get(it.id) ?? []), u])
        } catch {}
        if (!alive) return
        setFriendWish(new Map(m))
      }
      if (alive) setFriendState('done')
    })()
    return () => {
      alive = false
    }
  }, [friends])

  useEffect(() => {
    if (!room) {
      setRs(null)
      return
    }
    let alive = true
    const tick = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const s = await roomState(room.code)
        if (alive) setRs(s)
      } catch (e) {
        if (!alive) return
        if (e instanceof RoomError && e.status === 404) {
          setRoom(null)
          saveHostRoom(season, null)
          setRoomErr(t('房间已过期或已关闭'))
        }
      }
    }
    tick()
    const id = window.setInterval(tick, 3000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [room, season])

  // 主持人翻到哪部,房间里的"当前"就切到哪部(参会者手机跟着走)
  useEffect(() => {
    if (room && cur) setCurrent(room.code, room.hostKey, cur.id).catch(() => {})
  }, [room, cur?.id])

  const openRoom = async () => {
    if (roomBusy) return
    setRoomBusy(true)
    setRoomErr(null)
    try {
      const r = await createRoom(season, list.map((s) => s.id))
      const hr = { ...r, season }
      setRoom(hr)
      saveHostRoom(season, hr)
    } catch (e) {
      setRoomErr(e instanceof RoomError && e.message === 'no room service' ? t('镜像站没有房间服务,请用 bgmtimetable.com 打开') : t('开房间失败:{e}', { e: e instanceof Error ? e.message : String(e) }))
    } finally {
      setRoomBusy(false)
    }
  }
  const endRoom = async () => {
    if (!room || !window.confirm(t('关闭房间?参会者将无法再投票。'))) return
    try {
      await closeRoom(room.code, room.hostKey)
    } catch {}
    setRoom(null)
    saveHostRoom(season, null)
    setRs(null)
  }
  const copyLink = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(joinUrl(room.code))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt(t('复制这个链接发给大家'), joinUrl(room.code))
    }
  }

  // 我的态度:本机讨论标记优先;没标过但追番状态已是想看(比如 bgm 同步来的)也算想看
  const myMark = (id: number): Mark | null => marks[id] ?? (tracking.status[id] === 'wish' ? 'wish' : null)
  const setMark = (id: number, v: Mark) => {
    const next = { ...marks }
    if (marks[id] === v) delete next[id]
    else next[id] = v
    setMarks(next)
    writeJson(marksKey(season), next)
    const nowWish = next[id] === 'wish'
    if (nowWish && tracking.status[id] !== 'wish') onSetStatus(id, 'wish')
    else if (!nowWish && tracking.status[id] === 'wish') onSetStatus(id, null)
    // 主持人自己的票也进房间(取消标记时房间里保留上一票,接口没有撤票)
    if (room && next[id]) voteRoom(room.code, hostNick, id, next[id]).then(setRs).catch(() => {})
  }

  const counts = useMemo(() => {
    const c = { wish: 0, maybe: 0, skip: 0, seen: 0 }
    for (const s of list) {
      const m = myMark(s.id)
      if (m) {
        c[m]++
        c.seen++
      }
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, marks, tracking.status])

  const seasonStartIso = `${season.slice(0, 4)}-${season.slice(4)}-01`
  const daysTo = Math.ceil((Date.UTC(+season.slice(0, 4), +season.slice(4) - 1, 1) - 9 * 3600_000 - now) / 86400_000)

  const staffLines = (id: number) => {
    const st = staff.get(id)
    if (!st) return null
    const rows: [string, string[]][] = [
      [t('制作公司'), st.studio],
      [t('导演'), st.director],
      [t('系列构成'), st.series],
      [t('人物设定'), st.chara],
    ]
    return (
      <>
        {rows.filter(([, v]) => v.length).map(([k, v]) => (
          <div key={k} className="dc-kv">
            <span className="k">{k}</span>
            <span className="v">{v.join(' · ')}</span>
          </div>
        ))}
        {st.actors.length > 0 && (
          <div className="dc-kv">
            <span className="k">{t('声优')}</span>
            <span className="v">{st.actors.slice(0, 8).map((a) => a.name).join(' · ')}</span>
          </div>
        )}
      </>
    )
  }

  const otherFriends = (id: number) => friends.filter((u) => !(friendWish.get(id) ?? []).includes(u))

  /** 一部作品所有人的票:有房间用房间票(主持人的票已在里面),没有就用我的标记;好友 bgm 想看并入想看 */
  const votesFor = (id: number): VoteNames => {
    const tl = rs?.tally[String(id)]
    const v: VoteNames = tl ? { wish: [...tl.wish], maybe: [...tl.maybe], skip: [...tl.skip] } : { wish: [], maybe: [], skip: [] }
    if (!room) {
      const m = myMark(id)
      if (m) v[m].push(hostNick)
    }
    for (const u of friendWish.get(id) ?? []) if (!v.wish.includes(u)) v.wish.push(u)
    return v
  }
  const board = useMemo(() => (boardOpen ? buildBoard(list, votesFor) : null), [boardOpen, list, rs, marks, friendWish, room]) // eslint-disable-line react-hooks/exhaustive-deps
  const boardTitle = t('{s} 新番共识榜', { s: fmtSeason(season) })
  const copyBoard = async () => {
    if (!board) return
    const text = boardText(board, boardTitle, list.length)
    try {
      await navigator.clipboard.writeText(text)
      setTextCopied(true)
      window.setTimeout(() => setTextCopied(false), 1500)
    } catch {
      window.prompt(t('复制下面的文字'), text)
    }
  }
  const exportBoard = async () => {
    if (!board || exporting) return
    setExporting(true)
    try {
      downloadBlob(await renderBoardPng(board, boardTitle, list.length), `bangumi-${season}-consensus.png`)
    } catch {}
    setExporting(false)
  }

  return (
    <div className="stats-page discuss-page">
      <div className="st-head">
        <button className="iconbtn st-back" onClick={onClose}>
          ← {t('返回课表')}
        </button>
        <h2>🗣 {t('{s} 新番讨论会', { s: fmtSeason(season) })}</h2>
        <span className="sub">
          {t('共 {n} 部', { n: list.length })} · {t('已过 {n} 部', { n: counts.seen })} · {t('想看 {a} · 观望 {b} · 跳过 {c}', { a: counts.wish, b: counts.maybe, c: counts.skip })}
          {daysTo > 0 ? ` · ${t('距开播 {n} 天', { n: daysTo })}` : ''}
          {room ? ` · ${t('房间 {code}', { code: room.code })}` : ''}
        </span>
        <button className="iconbtn st-refresh" onClick={() => setBoardOpen(true)} title={t('按大家的票分层:都想看 / 有人想看 / 观望 / 跳过')}>
          📋 {t('共识榜')}
        </button>
      </div>

      {!cur ? (
        <div className="st-empty">{t('暂无下季数据')}</div>
      ) : (
        <div className="dc-frame">
          <aside className="dc-agenda">
            <div className="dc-agenda-head">
              <span className="dc-pos">
                {idx + 1} / {list.length}
              </span>
              <span className="seg">
                {(
                  [
                    ['date', '按首播日'],
                    ['wish', '按期待'],
                  ] as [SortKey, string][]
                ).map(([k, label]) => (
                  <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
                    {t(label)}
                  </button>
                ))}
              </span>
            </div>
            <div className="dc-agenda-list">
              {list.map((s, i) => {
                const m = myMark(s.id)
                const fw = friendWish.get(s.id) ?? []
                return (
                  <button key={s.id} ref={i === idx ? curRef : undefined} className={'dc-row' + (i === idx ? ' cur' : '') + (m ? ` m-${m}` : '')} onClick={() => go(i)} title={s.nameJp}>
                    {s.image ? <img className="th" src={s.image} loading="lazy" alt="" /> : <span className="th ph" />}
                    <span className="t">{displayName(s)}</span>
                    {rs && (rs.tally[String(s.id)]?.wish.length ?? 0) > 0 && <b className="rv">♡{rs.tally[String(s.id)].wish.length}</b>}
                    <span className="dots">
                      <i className={m ? `me ${m}` : 'me'} title={m ? t(MARK_LABEL[m]) : ''} />
                      {friends.map((u) => (
                        <i key={u} className={fw.includes(u) ? 'wish' : ''} title={`${u}${fw.includes(u) ? ` · ${t('想看')}` : ''}`} />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="dc-agenda-foot">{t('点行跳转,← → 翻页;点 = 每个人的态度(我 · 好友)')}</div>
          </aside>

          <section className="dc-focus">
            <div className="dc-top">
              {cur.image ? <img className="dc-cover" src={cur.image} alt="" /> : <span className="dc-cover ph">{displayName(cur).slice(0, 1)}</span>}
              <div className="dc-body">
                <h3 className="dc-title">{displayName(cur)}</h3>
                {subName(cur) && <div className="dc-sub">{subName(cur)}</div>}
                <div className="dc-meta">
                  <span>
                    <span className="k">{t('首播')}</span>
                    <span className="v">
                      {cur.firstAirDate ? `${md(cur.firstAirDate)} ${wdFull(isoWeekday(cur.firstAirDate))}` : t('日期待定')}
                      {cur.airHint?.includes('深夜') ? ` ${t('深夜')}` : ''}
                      {cur.web ? ` · ${t('网络放送')}` : ''}
                    </span>
                  </span>
                  <span>
                    <span className="k">{t('来源')}</span>
                    <span className="v">
                      {cur.sourceType ?? '—'}
                      {cur.epsTotal ? ` · ${t('全 {n} 集', { n: cur.epsTotal })}` : ''}
                    </span>
                  </span>
                  <span>
                    <span className="k">bgm</span>
                    <span className="v pink">{cur.wish !== undefined ? t('期待 {n}', { n: fmtN(cur.wish) }) : '…'}</span>
                    {cur.ratingTotal ? <span className="v soft"> · {t('{n} 人评分', { n: cur.ratingTotal })}</span> : null}
                  </span>
                </div>
                {staffLines(cur.id) ?? <div className="dc-kv soft">{t('制作/声优载入中…')}</div>}
                {(cur.tags?.length || info?.hotTags?.length) ? (
                  <div className="dc-tags">
                    {(cur.tags?.length ? cur.tags : (info?.hotTags ?? []).slice(0, 6)).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="dc-summary">{info ? info.summary || t('暂无简介') : '…'}</div>

            <div className="dc-links">
              {cur.pvUrl && (
                <a href={cur.pvUrl} target="_blank" rel="noopener noreferrer">
                  ▶ PV
                </a>
              )}
              {cur.officialSite && (
                <a href={cur.officialSite} target="_blank" rel="noopener noreferrer">
                  {t('官网')}
                </a>
              )}
              <a href={`https://bgm.tv/subject/${cur.id}`} target="_blank" rel="noopener noreferrer">
                bgm
              </a>
              <a href={`https://search.bilibili.com/bangumi?keyword=${encodeURIComponent(cur.nameCn)}`} target="_blank" rel="noopener noreferrer">
                {t('B站番剧')}
              </a>
              <a href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(cur.nameCn)}`} target="_blank" rel="noopener noreferrer">
                {t('B站搜索')}
              </a>
            </div>

            <div className="dc-bar">
              <span className="dc-me">
                <span className="k">{t('我')}</span>
                {MARKS.map((m) => (
                  <button key={m} className={'dc-mark ' + m + (myMark(cur.id) === m ? ' on' : '')} onClick={() => setMark(cur.id, m)}>
                    {t(MARK_LABEL[m])}
                  </button>
                ))}
              </span>
              <span className="dc-them">
                <span className="k">{t('大家')}</span>
                {room ? (
                  <>
                    <span className="dc-room">
                      <button className="dc-qr-mini" onClick={() => setQrOpen(true)} title={t('扫码进入房间')}>
                        <QrSvg text={joinUrl(room.code)} px={52} />
                      </button>
                      <b title={joinUrl(room.code)}>{room.code}</b>
                      <button className="iconbtn" onClick={copyLink} title={joinUrl(room.code)}>
                        {copied ? t('已复制') : t('复制链接')}
                      </button>
                      <span className="soft">{t('{n} 人在线', { n: rs?.members.length ?? 0 })}</span>
                      <button className="iconbtn" onClick={endRoom}>
                        {t('关闭房间')}
                      </button>
                    </span>
                    {MARKS.map((v) => {
                      const names = rs?.tally[String(cur.id)]?.[v] ?? []
                      return (
                        <span key={v} className={`dc-pill ${v}`}>
                          {t(MARK_LABEL[v])} {names.join(' · ') || '—'}
                        </span>
                      )
                    })}
                  </>
                ) : (
                  <button className="iconbtn" disabled={roomBusy} onClick={openRoom} title={t('开一个房间,大家用手机链接投票')}>
                    {roomBusy ? '…' : t('开房间')}
                  </button>
                )}
                {roomErr && <span className="soft">{roomErr}</span>}
                {friends.length > 0 ? (
                  <>
                    <span className="dc-pill wish">
                      {t('bgm 想看')} {(friendWish.get(cur.id) ?? []).join(' · ') || '—'}
                    </span>
                    {friendState === 'loading' && <span className="soft">…</span>}
                  </>
                ) : (
                  !room && <span className="soft">{t('在「设置 → 好友」里填上 bgm 用户名,这里会显示他们的想看')}</span>
                )}
              </span>
              <span className="dc-nav">
                <button className="iconbtn" disabled={idx === 0} onClick={() => go(idx - 1)}>
                  ‹ {t('上一部')}
                </button>
                <button className="iconbtn accent" disabled={idx >= list.length - 1} onClick={() => go(idx + 1)}>
                  {t('下一部')} ›
                </button>
              </span>
            </div>
          </section>
        </div>
      )}
      {qrOpen && room && (
        <div className="dc-overlay" onClick={() => setQrOpen(false)}>
          <div className="dc-qr-big" onClick={(e) => e.stopPropagation()}>
            <QrSvg text={joinUrl(room.code)} px={320} />
            <div className="code">{room.code}</div>
            <div className="url">{joinUrl(room.code)}</div>
            <div className="soft">{t('扫码或打开链接,填昵称即可投票')}</div>
          </div>
        </div>
      )}
      {boardOpen && board && (
        <div className="dc-overlay" onClick={() => setBoardOpen(false)}>
          <div className="dc-board" onClick={(e) => e.stopPropagation()}>
            <div className="dc-board-head">
              <h3>📋 {boardTitle}</h3>
              <span className="sub">
                {board.people.length ? `${t('{n} 人参与:{names}', { n: board.people.length, names: board.people.join(' · ') })} · ` : ''}
                {t('已过 {n} 部', { n: list.length - board.unvoted })} / {list.length}
              </span>
              <span className="dc-board-actions">
                <button className="iconbtn" onClick={copyBoard}>
                  {textCopied ? t('已复制') : t('复制文本')}
                </button>
                <button className="iconbtn" disabled={exporting} onClick={exportBoard}>
                  {exporting ? t('导出中…') : t('导出图片')}
                </button>
                <button className="iconbtn" onClick={() => setBoardOpen(false)}>
                  {t('关闭')}
                </button>
              </span>
            </div>
            {board.rows.length === 0 && <div className="st-empty">{t('还没有人表态')}</div>}
            {TIERS.map((tier) => {
              const rows = board.rows.filter((r) => r.tier === tier)
              if (!rows.length) return null
              return (
                <div key={tier}>
                  <h4>
                    {t(TIER_LABEL[tier])}
                    <b>{rows.length}</b>
                  </h4>
                  {rows.map((r) => (
                    <div key={r.show.id} className="dc-brow" onClick={() => { setBoardOpen(false); go(list.findIndex((s) => s.id === r.show.id)) }}>
                      <span className="t">{displayName(r.show)}</span>
                      {r.show.firstAirDate && <span className="d">{md(r.show.firstAirDate)}</span>}
                      {(['wish', 'maybe', 'skip'] as const).map((k) =>
                        r.votes[k].length ? (
                          <span key={k} className={`v ${k}`}>
                            {t(MARK_LABEL[k])} {r.votes[k].join(' · ')}
                          </span>
                        ) : null,
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            <div className="foot">{board.unvoted ? t('未过 {n} 部', { n: board.unvoted }) : ''}</div>
          </div>
        </div>
      )}
      <p className="pv-foot">{t('名单来自 yuc.wiki 新番表,封面/期待/简介/制作/声优来自 bgm.tv;好友的想看来自其 bgm 公开收藏,每天更新一次。想看会同步到你的 bgm 收藏,观望/跳过只存本机。')}</p>
    </div>
  )
}
