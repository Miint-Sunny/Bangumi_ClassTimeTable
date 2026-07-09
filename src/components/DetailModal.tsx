import { useEffect, useMemo, useState } from 'react'
import type { AirFix, CollectMemo, FriendsMap, Settings, Show, Tracking, WatchStatus } from '../types'
import { fetchSubject, type SubjectInfo } from '../lib/api'
import { airedEps, behindCount } from '../lib/progress'
import { MIN_VOTES, fmtVotes } from '../lib/score'
import { nextEpisode, totalEps } from '../lib/schedule'
import { WEEKDAY_CN, displayTz, isCarryOver, pad, partsInZone, relTime, slotFor } from '../lib/time'

interface Props {
  show: Show
  tracking: Tracking
  settings: Settings
  now: number
  seasonStart: number
  friendsMap: FriendsMap
  hasLocalOverride: boolean
  onSetStatus: (id: number, s: WatchStatus | null) => void
  onSetWatched: (id: number, n: number) => void
  onSetRate: (id: number, rate: number) => void
  onSetMemo: (id: number, memo: CollectMemo) => void
  onSetOverride: (id: number, fix: AirFix | null) => void
  onSubjectInfo: (info: SubjectInfo) => void
  onTag?: (tag: string) => void // 点题材标签 → 按标签筛选
  onClose: () => void
}

const STATUS_BTNS: { k: WatchStatus; label: string }[] = [
  { k: 'wish', label: '想看' },
  { k: 'watching', label: '在看' },
  { k: 'done', label: '看过' },
  { k: 'dropped', label: '抛弃' },
]

/** bgm.tv 官方评分文案(1~10),取自其收藏窗口 */
const RATE_CAPTIONS = ['', '不忍直视', '很差', '差', '较差', '不过不失', '还行', '推荐', '力荐', '神作', '超神作'] as const
const rateTitle = (v: number) => `${RATE_CAPTIONS[v]} ${v}${v === 1 || v === 10 ? '(请谨慎评价)' : ''}`

/** 详情内容体:宽屏时装进右侧 SidePanel,窄屏时装进弹窗外壳 */
export function DetailBody(props: Props) {
  const {
    show,
    tracking,
    settings,
    now,
    seasonStart,
    friendsMap,
    hasLocalOverride,
    onSetStatus,
    onSetWatched,
    onSetRate,
    onSetMemo,
    onSetOverride,
    onSubjectInfo,
    onTag,
    onClose,
  } = props
  const [info, setInfo] = useState<SubjectInfo | null>(null)
  const [editingFix, setEditingFix] = useState(false)
  const [pvOpen, setPvOpen] = useState(false)
  const [hoverRate, setHoverRate] = useState(0)
  // B 站 PV 可选内嵌预览;主入口仍是新标签页跳转
  const pvBv = show.pvUrl ? (/BV[0-9A-Za-z]{10}/.exec(show.pvUrl)?.[0] ?? null) : null

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

  const status: WatchStatus | 'none' = tracking.status[show.id] ?? 'none'
  const collected = show.id in tracking.status // 有收藏才能评分(与 bgm 一致)
  const watched = tracking.watched[show.id] ?? 0
  const myRate = tracking.rates[show.id] ?? 0
  const aired = airedEps(show, now)
  const behind = behindCount(show, tracking, now)
  const epsTotal = totalEps(show) ?? info?.eps
  const image = show.image ?? info?.image
  const score = show.score ?? info?.score
  const votes = show.ratingTotal ?? info?.ratingTotal

  const slot = slotFor(show, settings)
  const tz = displayTz(settings)
  const nx = nextEpisode(show, now)

  const friends = friendsMap.get(show.id)

  const fmtNext = (t: number) => {
    const p = partsInZone(t, tz)
    return `${p.mo}月${p.d}日(周${WEEKDAY_CN[p.wd]}) ${pad(p.hh)}:${pad(p.mm)}`
  }

  return (
    <>
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
                  {votes ? <span> · {fmtVotes(votes)} 人评分</span> : null}
                  {votes !== undefined && votes < MIN_VOTES ? <span className="few-note">(人数少,仅供参考)</span> : null}
                  {show.rank ? <span> · 排名 #{show.rank}</span> : null}
                  <br />
                </>
              ) : null}
              {show.watchers ? <>{show.watchers} 人在看 · </> : null}
              {show.sourceType ?? ''}
              {isCarryOver(show, seasonStart) ? <> · 上季续播</> : null}
            </div>
            {show.tags && show.tags.length > 0 && (
              <div className="dm-tags">
                {show.tags.map((t) =>
                  onTag ? (
                    <button key={t} className="tag clickable" title={`筛选「${t}」`} onClick={() => onTag(t)}>
                      {t}
                    </button>
                  ) : (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ),
                )}
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
            {nx && (
              <>
                <br />
                下一次更新 {nx.epEnd > nx.ep ? `第 ${nx.ep}-${nx.epEnd} 集` : `第 ${nx.ep} 集`} ·{' '}
                <b>{fmtNext(nx.t)}</b>({relTime(nx.t, now)})
              </>
            )}
            {aired !== undefined && (
              <>
                <br />
                已播出 <b>{aired}</b> 集{epsTotal ? ` / 全 ${epsTotal} 集` : ''}
              </>
            )}
          </div>
          {show.airFix?.note && (
            <div className="fix-note">
              📌 {show.airFix.note}
              {show.airFix.source && (
                <>
                  {' '}
                  <a href={show.airFix.source} target="_blank" rel="noreferrer">
                    [依据]
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        <div className="dm-sec">
          <div className="sec-t">
            放送校正
            {hasLocalOverride ? '(本机覆盖中)' : show.airFix ? '(来自季度增强数据)' : ''}
          </div>
          {editingFix ? (
            <FixEditor
              show={show}
              onSave={(fix) => {
                onSetOverride(show.id, fix)
                setEditingFix(false)
              }}
              onClear={() => {
                onSetOverride(show.id, null)
                setEditingFix(false)
              }}
              onCancel={() => setEditingFix(false)}
            />
          ) : (
            <button className="iconbtn" onClick={() => setEditingFix(true)}>
              ✎ 校正放送信息(先行/提前放送等)
            </button>
          )}
        </div>

        <div className="dm-sec">
          <div className="sec-t">追番状态与评价</div>
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
          {collected && (
            <>
              <div className="rate-row" onMouseLeave={() => setHoverRate(0)}>
                <span className="stars">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                    <button
                      key={v}
                      className={`star${(hoverRate || myRate) >= v ? ' lit' : ''}`}
                      title={rateTitle(v)}
                      onMouseEnter={() => setHoverRate(v)}
                      onClick={() => onSetRate(show.id, myRate === v ? 0 : v)}
                    >
                      ★
                    </button>
                  ))}
                </span>
                <span className={`rate-cap${hoverRate ? ' preview' : ''}`}>
                  {hoverRate
                    ? `${RATE_CAPTIONS[hoverRate]} ${hoverRate}`
                    : myRate
                      ? `${RATE_CAPTIONS[myRate]} ${myRate}`
                      : '我的评价'}
                </span>
              </div>
              <MemoForm
                key={show.id}
                memo={tracking.memos[show.id]}
                hotTags={info?.hotTags ?? show.tags ?? []}
                myTags={myFrequentTags(tracking)}
                onSave={(m) => onSetMemo(show.id, m)}
              />
            </>
          )}
        </div>

        {(status === 'watching' || watched > 0) && (
          <div className="dm-sec">
            <div className="sec-t">进度</div>
            <div className="ep-stepper">
              <button className="step" onClick={() => onSetWatched(show.id, Math.max(0, watched - 1))}>
                −
              </button>
              <span className="val">
                {watched}
                <small>{epsTotal ? ` / ${epsTotal}` : ''} 集</small>
              </span>
              <button
                className="step"
                onClick={() => onSetWatched(show.id, epsTotal ? Math.min(epsTotal, watched + 1) : watched + 1)}
              >
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
              {pvBv && (
                <button className="iconbtn pv-toggle" onClick={() => setPvOpen((v) => !v)}>
                  {pvOpen ? '收起预览' : '内嵌预览'}
                </button>
              )}
              {show.officialSite && (
                <a href={show.officialSite} target="_blank" rel="noreferrer">
                  官网
                </a>
              )}
              {show.sites.map((s, i) => (
                <a key={`${i}-${s.url}`} href={s.url} target="_blank" rel="noreferrer">
                  {s.site}
                </a>
              ))}
            </div>
            {pvOpen && pvBv && (
              <div className="pv-embed">
                <iframe
                  src={`https://player.bilibili.com/player.html?bvid=${pvBv}&autoplay=0&danmaku=0`}
                  allowFullScreen
                  title="PV 预览"
                />
              </div>
            )}
          </div>
        )}

      {info?.summary && (
        <div className="dm-sec">
          <div className="sec-t">简介</div>
          <div className="dm-summary">{info.summary}</div>
        </div>
      )}
    </>
  )
}

/** 我的常用标签:从全部收藏的标签里按使用频次取前 12 */
function myFrequentTags(tracking: Tracking): string[] {
  const freq = new Map<string, number>()
  for (const m of Object.values(tracking.memos)) {
    for (const t of m.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t)
}

/** 收藏面板的标签/吐槽/可见性(对齐 bgm 的加入收藏窗口),显式保存 */
function MemoForm({
  memo,
  hotTags,
  myTags,
  onSave,
}: {
  memo?: CollectMemo
  hotTags: string[]
  myTags: string[]
  onSave: (m: CollectMemo) => void
}) {
  const [tagsText, setTagsText] = useState((memo?.tags ?? []).join(' '))
  const [comment, setComment] = useState(memo?.comment ?? '')
  const [priv, setPriv] = useState(memo?.private ?? false)
  const [savedAt, setSavedAt] = useState(0)

  const parsedTags = useMemo(
    () => [...new Set(tagsText.split(/[\s,,、]+/).filter(Boolean))].slice(0, 10),
    [tagsText],
  )
  const dirty =
    parsedTags.join(' ') !== (memo?.tags ?? []).join(' ') ||
    comment.trim() !== (memo?.comment ?? '') ||
    priv !== (memo?.private ?? false)

  const toggleTag = (t: string) => {
    // 函数式更新:同一帧连点多个标签也不丢
    setTagsText((prev) => {
      const cur = [...new Set(prev.split(/[\s,,、]+/).filter(Boolean))]
      return (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).slice(0, 10).join(' ')
    })
  }

  const save = () => {
    const m: CollectMemo = {}
    if (parsedTags.length > 0) m.tags = parsedTags
    if (comment.trim()) m.comment = comment.trim()
    if (priv) m.private = true
    onSave(m)
    setSavedAt(Date.now())
  }

  const sugg = (label: string, tags: string[]) =>
    tags.length > 0 && (
      <div className="memo-sugg">
        <span className="lbl">{label}</span>
        {tags.map((t) => (
          <button key={t} className={`tag clickable${parsedTags.includes(t) ? ' on' : ''}`} onClick={() => toggleTag(t)}>
            {t}
          </button>
        ))}
      </div>
    )

  return (
    <div className="memo-form">
      <input
        value={tagsText}
        placeholder="标签(空格或逗号隔开,至多 10 个)"
        onChange={(e) => setTagsText(e.target.value)}
      />
      {sugg('常用', hotTags)}
      {sugg('我的', myTags)}
      <textarea
        value={comment}
        rows={2}
        placeholder="吐槽(随收藏同步到 bgm)"
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="memo-actions">
        <button className="iconbtn accent" disabled={!dirty} onClick={save}>
          保存
        </button>
        <label className="priv">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> 仅自己可见
        </label>
        {savedAt > 0 && !dirty && <span className="saved">已保存</span>}
      </div>
    </div>
  )
}

/** 窄屏弹窗外壳(宽屏时 App 直接把 DetailBody 装进 SidePanel) */
export default function DetailModal(props: Props) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal">
        <DetailBody {...props} />
      </div>
    </div>
  )
}

// ── 放送校正编辑器 ──────────────────────────────────────────────

const isoToInput = (iso?: string): string => {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const inputToIso = (v: string): string | undefined => {
  if (!v) return undefined
  const t = new Date(v)
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString()
}

function FixEditor({
  show,
  onSave,
  onClear,
  onCancel,
}: {
  show: Show
  onSave: (fix: AirFix) => void
  onClear: () => void
  onCancel: () => void
}) {
  const f = show.airFix
  const [advanceEps, setAdvanceEps] = useState(f?.advanceEps ? String(f.advanceEps) : '')
  const [advanceAt, setAdvanceAt] = useState(isoToInput(f?.advanceAt))
  const [anchorEp, setAnchorEp] = useState(f?.anchorEp != null ? String(f.anchorEp) : '')
  const [anchorAt, setAnchorAt] = useState(isoToInput(f?.anchorAt))
  const [eps, setEps] = useState(f?.eps ? String(f.eps) : '')
  const [note, setNote] = useState(f?.note ?? '')
  const [source, setSource] = useState(f?.source ?? '')

  const build = (): AirFix | null => {
    const fix: AirFix = {}
    const nAdv = parseInt(advanceEps, 10)
    if (nAdv > 0) {
      fix.advanceEps = nAdv
      const at = inputToIso(advanceAt)
      if (at) fix.advanceAt = at
    }
    const nAnc = parseInt(anchorEp, 10)
    const ancAt = inputToIso(anchorAt)
    if (nAnc > 0 && ancAt) {
      fix.anchorEp = nAnc
      fix.anchorAt = ancAt
    }
    const nEps = parseInt(eps, 10)
    if (nEps > 0) fix.eps = nEps
    if (note.trim()) fix.note = note.trim()
    if (source.trim()) fix.source = source.trim()
    return Object.keys(fix).length > 0 ? fix : null
  }

  const preview = build()

  return (
    <div className="fix-form">
      <div className="fix-row">
        <span>前</span>
        <input className="num" type="number" min="1" value={advanceEps} onChange={(e) => setAdvanceEps(e.target.value)} />
        <span>集已整批放出,时刻(本地时间,留空=开播时刻)</span>
        <input type="datetime-local" value={advanceAt} onChange={(e) => setAdvanceAt(e.target.value)} />
      </div>
      <div className="fix-row">
        <span>常规周更从第</span>
        <input className="num" type="number" min="1" value={anchorEp} onChange={(e) => setAnchorEp(e.target.value)} />
        <span>集起,该集播出于</span>
        <input type="datetime-local" value={anchorAt} onChange={(e) => setAnchorAt(e.target.value)} />
      </div>
      <div className="fix-row">
        <span>总集数</span>
        <input className="num" type="number" min="1" value={eps} onChange={(e) => setEps(e.target.value)} />
        <span>备注</span>
        <input className="wide" value={note} placeholder="如:1~6 集 7/4 全网先行" onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="fix-row">
        <span>依据链接</span>
        <input className="wide" value={source} placeholder="官网公告 / yuc 页面 URL" onChange={(e) => setSource(e.target.value)} />
      </div>
      <div className="fix-row">
        <button className="iconbtn" disabled={preview === null} onClick={() => preview && onSave(preview)}>
          保存到本机
        </button>
        <button className="iconbtn" onClick={onClear}>
          清除校正
        </button>
        <button className="iconbtn" onClick={onCancel}>
          取消
        </button>
      </div>
      {preview && (
        <>
          <div className="fix-hint">
            校正只保存在本机浏览器。想让它成为站点默认:把下面 JSON 交给 refresh-data skill 合并进
            enhance.json 后重新部署。
          </div>
          <code className="fix-json">{JSON.stringify({ [show.id]: { air: preview } }, null, 1)}</code>
        </>
      )}
    </div>
  )
}
