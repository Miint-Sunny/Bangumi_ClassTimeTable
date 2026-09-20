/**
 * 参会者的手机投票页(#join/房间码):填昵称进房,页面跟着主持人当前讲到的那部走,
 * 一屏只有封面、标题、首播信息和 想看 / 观望 / 跳过 三个大按钮,能看到大家的票。
 * 不要账号:昵称存本机;票记在房间里(24 小时无活动自动销毁)。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Show } from '../types'
import { fetchSubject, type SubjectInfo } from '../lib/api'
import { joinRoom, loadNick, RoomError, roomState, saveNick, voteRoom, type RoomState, type Vote } from '../lib/room'
import { displayName, subName, t, wdFull } from '../lib/i18n'

interface Props {
  code: string
  shows: Show[] // 下季新番(App 的 previewShows),按 id 查作品
  onSubjectInfo: (info: SubjectInfo) => void
  onClose: () => void
}

const VOTES: Vote[] = ['wish', 'maybe', 'skip']
const VOTE_LABEL: Record<Vote, string> = { wish: '想看', maybe: '观望', skip: '跳过' }
const isoWeekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}
const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`

export default function JoinPage({ code, shows, onSubjectInfo, onClose }: Props) {
  const [nick, setNick] = useState(loadNick)
  const [joined, setJoined] = useState(false)
  const [rs, setRs] = useState<RoomState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const enriched = useRef(new Set<number>())

  const byId = useMemo(() => new Map(shows.map((s) => [s.id, s])), [shows])
  const cur = rs?.current ? (byId.get(rs.current) ?? null) : null

  const explain = (e: unknown): string => {
    if (e instanceof RoomError) {
      if (e.message === 'no room service') return t('镜像站没有房间服务,请用 bgmtimetable.com 打开')
      if (e.status === 404) return t('房间不存在或已过期')
      if (e.status === 429) return t('房间人数已满')
      return `${t('出错了')}: ${e.message}`
    }
    return String(e instanceof Error ? e.message : e)
  }

  const join = async () => {
    const n = nick.trim().slice(0, 16)
    if (!n || busy) return
    setBusy(true)
    setErr(null)
    try {
      const s = await joinRoom(code, n)
      saveNick(n)
      setNick(n)
      setRs(s)
      setJoined(true)
    } catch (e) {
      setErr(explain(e))
    } finally {
      setBusy(false)
    }
  }

  // ── 跟随主持人:每 2.5 秒拉一次房间状态(页面在前台时) ──
  useEffect(() => {
    if (!joined) return
    let alive = true
    const tick = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const s = await roomState(code)
        if (alive) setRs(s)
      } catch (e) {
        if (!alive) return
        if (e instanceof RoomError && e.status === 404) {
          setErr(t('房间已结束'))
          setJoined(false)
        }
      }
    }
    const id = window.setInterval(tick, 2500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [joined, code])

  // 当前作品没封面就补一下(7 天缓存)
  useEffect(() => {
    if (!cur || cur.image || enriched.current.has(cur.id)) return
    enriched.current.add(cur.id)
    fetchSubject(cur.id).then(onSubjectInfo).catch(() => {})
  }, [cur, onSubjectInfo])

  const vote = async (v: Vote) => {
    if (!cur || busy) return
    setBusy(true)
    try {
      setRs(await voteRoom(code, nick, cur.id, v))
    } catch (e) {
      setErr(explain(e))
    } finally {
      setBusy(false)
    }
  }

  const tally = cur && rs ? rs.tally[String(cur.id)] : undefined
  const myVote = tally ? VOTES.find((v) => tally[v]?.includes(nick)) ?? null : null
  const pos = rs && rs.current ? rs.order.indexOf(rs.current) + 1 : 0

  return (
    <div className="join-page">
      <div className="jp-head">
        <span className="jp-code">
          🗣 {t('房间 {code}', { code })}
        </span>
        {rs && <span className="soft">{t('{n} 人在线', { n: rs.members.length })}</span>}
      </div>

      {!joined ? (
        <div className="jp-card jp-form">
          <label htmlFor="jp-nick">{t('你的昵称')}</label>
          <input
            id="jp-nick"
            value={nick}
            maxLength={16}
            placeholder={t('大家认得出你的名字')}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            autoFocus
          />
          <button className="iconbtn accent jp-big" disabled={!nick.trim() || busy} onClick={join}>
            {busy ? '…' : t('进入房间')}
          </button>
          {err && <div className="jp-err">{err}</div>}
          <div className="soft">{t('不用登录,昵称只存在你的手机上;主持人翻页时这里会自动跟着切。')}</div>
        </div>
      ) : err ? (
        <div className="jp-card">
          <div className="jp-err">{err}</div>
        </div>
      ) : !rs?.current ? (
        <div className="jp-card jp-wait">{t('等待主持人开始…')}</div>
      ) : !cur ? (
        <div className="jp-card jp-wait">…</div>
      ) : (
        <div className="jp-card jp-show">
          <div className="jp-pos">{pos > 0 ? t('第 {i} / {n} 部', { i: pos, n: rs.order.length }) : ''}</div>
          {cur.image ? <img className="jp-cover" src={cur.image} alt="" /> : <div className="jp-cover ph">{displayName(cur).slice(0, 1)}</div>}
          <div className="jp-title">{displayName(cur)}</div>
          {subName(cur) && <div className="jp-sub">{subName(cur)}</div>}
          <div className="jp-meta">
            {cur.firstAirDate ? `${md(cur.firstAirDate)} ${wdFull(isoWeekday(cur.firstAirDate))}${cur.airHint?.includes('深夜') ? ` ${t('深夜')}` : ''}` : t('日期待定')}
            {cur.web ? ` · ${t('网络放送')}` : ''}
            {cur.sourceType ? ` · ${cur.sourceType}` : ''}
            {cur.wish !== undefined ? ` · ${t('期待 {n}', { n: cur.wish })}` : ''}
          </div>
          <div className="jp-votes">
            {VOTES.map((v) => (
              <button key={v} className={`jp-vote ${v}${myVote === v ? ' on' : ''}`} disabled={busy} onClick={() => vote(v)}>
                {t(VOTE_LABEL[v])}
                <b>{tally?.[v]?.length ?? 0}</b>
              </button>
            ))}
          </div>
          <div className="jp-names">
            {VOTES.map((v) =>
              tally?.[v]?.length ? (
                <div key={v}>
                  <span className={`jp-dot ${v}`} />
                  {tally[v].join(' · ')}
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      <button className="iconbtn jp-back" onClick={onClose}>
        {t('返回课表')}
      </button>
    </div>
  )
}
