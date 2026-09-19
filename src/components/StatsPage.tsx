/**
 * 追番统计页(占据主区域的独立页面,不是弹窗),按 bgm.tv 新版个人主页的「收藏统计」与「时间胶囊」重做:
 *   状态胶囊行 → 六色块(收藏/看过/完成率/平均分/标准差/评分数)+ 10→1 评分直方图
 *   → 时间胶囊(p1 时间线,经同源代理)| 换季对比 → 每季追番柱图 → 题材偏好 | 年度足迹 → 9 分神作
 * 数据:登录 bgm 时拉全量收藏(pullLibrary,缓存 24h);未登录退回本机当季 tracking。
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { BgmAccount, Show, Tracking, WatchStatus } from '../types'
import { fetchTimeline, pullLibrary, type CapsuleEvent, type LibItem, type Library } from '../lib/bgm'
import { computeStats, prevSeasonKey, TYPE_LABEL, TYPE_ORDER, TYPE_VAR, type Bucket, type CollType } from '../lib/stats'
import { fmtSeason } from '../lib/seasons'
import { currentSeason } from '../lib/time'
import { t } from '../lib/i18n'
import { buildDemo, type DemoData } from '../lib/demo'

interface Props {
  account: BgmAccount | null
  tracking: Tracking
  shows: Show[] | null
  seasonList: string[]
  onOpenSeason: (yyyymm: string) => void
  onClose: () => void
}

const LOCAL_TYPE: Record<WatchStatus, CollType> = { wish: 1, done: 2, watching: 3, dropped: 5 }

/** 未登录:用本机 tracking + 当季节目拼一份最小收藏(只有当季、没有历史) */
function localLibrary(tracking: Tracking, shows: Show[] | null): LibItem[] {
  const byId = new Map((shows ?? []).map((s) => [s.id, s]))
  return Object.entries(tracking.status).map(([id, st]) => {
    const s = byId.get(+id)
    return {
      id: +id,
      type: LOCAL_TYPE[st],
      rate: tracking.rates[+id] ?? 0,
      ep: tracking.watched[+id] ?? 0,
      at: '',
      name: s?.nameJp ?? '',
      nameCn: s?.nameCn ?? `#${id}`,
      date: s?.begin ? new Date(s.begin).toISOString().slice(0, 10) : null,
      eps: s?.epsTotal ?? 0,
      score: s?.score ?? 0,
      tags: s?.tags ?? [],
    }
  })
}

const fmt1 = (n: number | null) => (n === null ? '–' : n.toFixed(1))
const fmt2 = (n: number | null) => (n === null ? '–' : n.toFixed(2))
const pct = (n: number | null) => (n === null ? '–' : `${(n * 100).toFixed(1)}%`)
const pad = (n: number) => String(n).padStart(2, '0')
/** 2026-8-31 22:37 —— 与 bgm 主页的时间胶囊同款写法 */
const fmtWhen = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function StatsPage({ account, tracking, shows, seasonList, onOpenSeason, onClose }: Props) {
  const [lib, setLib] = useState<Library | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshN, setRefreshN] = useState(0)
  const [demo, setDemo] = useState<DemoData | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const live = !!account && !account.invalid

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!live || !account) return
    let alive = true
    setLoading(true)
    setError(null)
    pullLibrary(account, refreshN > 0)
      .then((l) => alive && setLib(l))
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [account, live, refreshN])

  const items = useMemo(() => (live ? (lib?.items ?? []) : demo ? demo.items : localLibrary(tracking, shows)), [live, lib, demo, tracking, shows])
  const st = useMemo(() => computeStats(items), [items])
  const cur = currentSeason(Date.now()).yyyymm
  const prev = prevSeasonKey(cur)
  const finishRate = st.counts[2] + st.counts[5] ? st.counts[2] / (st.counts[2] + st.counts[5]) : null

  return (
    <div className="stats-page">
        <div className="st-head">
          <button className="iconbtn st-back" onClick={onClose}>
            ← {t('返回课表')}
          </button>
          <h2>{t('追番统计')}</h2>
          <span className="sub">
            {!live && demo ? <span className="st-demo-badge">{t('演示数据')}</span> : null}
            {live && account ? `@${account.nickname || account.username} · ` : ''}
            {t('共 {n} 部', { n: st.total })}
            {live && lib ? ` · ${t('更新于 {t}', { t: new Date(lib.fetchedAt).toLocaleString() })}` : ''}
          </span>
          {live && (
            <button className="iconbtn st-refresh" disabled={loading} onClick={() => setRefreshN((n) => n + 1)}>
              ↻ {t('刷新')}
            </button>
          )}
        </div>

        {!live && (
          <div className="set-note st-notice st-notice-row">
            <span>{demo ? t('这是演示数据(从站内归档抽样的真实作品),登录 bgm 后显示你自己的收藏。') : t('登录 bgm 账号后可统计全部历史收藏;现在只统计本机记录的当季追番。')}</span>
            {demo ? (
              <button className="iconbtn" onClick={() => setDemo(null)}>
                {t('退出演示')}
              </button>
            ) : (
              <button
                className="iconbtn accent"
                disabled={demoBusy}
                onClick={() => {
                  setDemoBusy(true)
                  buildDemo()
                    .then(setDemo)
                    .finally(() => setDemoBusy(false))
                }}
              >
                {demoBusy ? '…' : t('查看演示数据')}
              </button>
            )}
          </div>
        )}
        {error && <div className="set-note st-notice">{t('拉取失败:{e}', { e: error })}</div>}
        {loading && !lib && <div className="st-empty">{t('正在拉取全部收藏…')}</div>}

        {items.length === 0 && !loading && !live && !demo ? ( // 登录态即使收藏为空也照常渲染(时间胶囊不依赖收藏)
          <div className="st-empty">{t('暂无数据')}</div>
        ) : (
          <>
            {/* ── 状态胶囊行(bgm 主页「动画 [在看 38] [看过 90]…」)── */}
            <div className="st-chips">
              {TYPE_ORDER.filter((ty) => st.counts[ty] > 0).map((ty) => (
                <span key={ty} className="st-chip" style={{ '--c': TYPE_VAR[ty] } as CSSProperties}>
                  {t(TYPE_LABEL[ty])}
                  <b>{st.counts[ty].toLocaleString()}</b>
                </span>
              ))}
              <span className="st-chip-note">
                {t('总集数')} {t('约 {n} 集', { n: st.epsWatched.toLocaleString() })}
                {st.firstYear ? ` · ${t('自 {y} 年起', { y: st.firstYear })}` : ''}
              </span>
            </div>

            {/* ── 六色块 + 评分直方图(bgm 主页「收藏统计」)── */}
            <div className="st-panel">
              <div className="st-six">
                <Box c="var(--box-pink)" n={st.total.toLocaleString()} l={t('收藏')} />
                <Box c="var(--box-green)" n={st.counts[2].toLocaleString()} l={t('看过')} />
                <Box c="var(--box-blue)" n={pct(finishRate)} l={t('完成率')} title={t('完成率 = 看过 ÷ (看过 + 抛弃)')} />
                <Box c="var(--box-orange)" n={fmt2(st.myMean)} l={t('平均分')} title={st.siteMean !== null ? t('站均 {s}', { s: fmt2(st.siteMean) }) : undefined} />
                <Box c="var(--box-purple)" n={fmt2(st.myStd)} l={t('标准差')} />
                <Box c="var(--box-sky)" n={st.rated.toLocaleString()} l={t('评分数')} />
              </div>
              {st.rated > 0 && <Histogram hist={st.hist} />}
            </div>

            <div className="st-two">
              {/* ── 时间胶囊 ── */}
              <div className="st-sec">
                <div className="st-sec-t">{t('时间胶囊')}</div>
                {!live && demo ? (
                  <Capsule events={demo.events} />
                ) : account?.username ? ( // 时间线是公开数据,令牌过期也照样能看
                  <Capsule username={account.username} />
                ) : (
                  <div className="st-empty">{t('时间胶囊需要登录 bgm;镜像站点无此功能')}</div>
                )}
              </div>

              {/* ── 换季对比 ── */}
              <div className="st-sec">
                <div className="st-sec-t">{t('换季对比')}</div>
                <div className="st-cmp">
                  {(
                    [
                      [t('本季'), cur, st.bySeason[cur]],
                      [t('上季'), prev, st.bySeason[prev]],
                    ] as [string, string, Bucket | undefined][]
                  ).map(([label, key, b]) => {
                    const done = b?.counts[2] ?? 0
                    const drop = b?.counts[5] ?? 0
                    return (
                      <div key={key} className="col">
                        <h4>
                          {label} · {fmtSeason(key)}
                        </h4>
                        {(
                          [
                            [t('在看'), b?.counts[3] ?? 0],
                            [t('看过'), done],
                            [t('抛弃'), drop],
                            [t('想看'), b?.counts[1] ?? 0],
                            [t('完走率'), pct(done + drop ? done / (done + drop) : null)],
                          ] as [string, number | string][]
                        ).map(([k, v]) => (
                          <div key={k} className="kv">
                            <span>{k}</span>
                            <b>{v}</b>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
                <div className="st-note">{t('完走率 = 看过 ÷ (看过 + 抛弃)')}</div>
              </div>
            </div>

            {/* ── 时间轴 ── */}
            <div className="st-sec">
              <div className="st-sec-t">
                {t(st.timelineUnit === 'season' ? '每季追番' : '每年追番')}
                {st.timelineUnit === 'season' && <span className="hint">{t('点击柱子跳到该季归档(2014 年起)')}</span>}
              </div>
              {st.timeline.length ? (
                <Timeline buckets={st.timeline} unit={st.timelineUnit} seasonList={seasonList} onOpenSeason={onOpenSeason} />
              ) : (
                <div className="st-empty">{t('暂无数据')}</div>
              )}
            </div>

            <div className="st-two">
              {/* ── 题材偏好 ── */}
              <div className="st-sec">
                <div className="st-sec-t">{t('题材偏好')}</div>
                {st.tags.length ? (
                  <div className="st-tags">
                    {st.tags.map((tg) => (
                      <div key={tg.name} className="row" title={`${tg.name} · ${tg.n}`}>
                        <span className="name">{tg.name}</span>
                        <span className="track">
                          <span className="bar" style={{ width: `${(tg.n / st.tags[0].n) * 100}%` }} />
                        </span>
                        <span className="n">{tg.n}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="st-empty">{t('暂无数据')}</div>
                )}
              </div>

              {/* ── 年度足迹 ── */}
              <div className="st-sec">
                <div className="st-sec-t">{t('年度足迹')}</div>
                {st.years.length ? (
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>{t('年份')}</th>
                        <th className="num">{t('看过')}</th>
                        <th className="num">{t('均分')}</th>
                        <th>{t('最高分')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.years.slice(0, 14).map((y) => (
                        <tr key={y.y}>
                          <td>{y.y}</td>
                          <td className="num">{y.done}</td>
                          <td className="num">{fmt1(y.mean)}</td>
                          <td className="best" title={y.best ? `${y.best.nameCn} · ${y.best.rate}` : ''}>
                            {y.best ? (
                              <>
                                {y.best.nameCn}
                                <b>{y.best.rate}</b>
                              </>
                            ) : (
                              '–'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="st-empty">{t('暂无数据')}</div>
                )}
              </div>
            </div>

            {/* ── 9 分神作 ── */}
            {st.best.length > 0 && (
              <div className="st-sec">
                <div className="st-sec-t">{t('我的神作(9 分以上)')}</div>
                <div className="st-best">
                  {st.best.map((it) => (
                    <a key={it.id} className="st-pick" href={`https://bgm.tv/subject/${it.id}`} target="_blank" rel="noreferrer">
                      {it.nameCn}
                      <b>{it.rate}</b>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="st-note">
              {live ? t('数据来自你的 Bangumi 收藏') : null}
              {lib?.partial ? ` · ${t('收藏太多,超出 4000 部的部分未计入')}` : null}
            </div>
          </>
        )}
    </div>
  )
}

function Box({ c, n, l, title }: { c: string; n: string; l: string; title?: string }) {
  return (
    <div className="st-box" style={{ '--box': c } as CSSProperties} title={title}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  )
}

// ── 时间胶囊:动作流,翻页用上一页最后一条 id ──────────────────────────

const VERB: Record<CapsuleEvent['kind'], string> = {
  wish: '想看',
  done: '看过',
  watching: '在看',
  hold: '搁置',
  drop: '抛弃',
  progress: '完成了',
  ep: '看过',
}

function Capsule({ username, events: preset }: { username?: string; events?: CapsuleEvent[] }) {
  const [events, setEvents] = useState<CapsuleEvent[]>(preset ?? [])
  const [lastId, setLastId] = useState<number | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'end' | 'error'>(preset ? 'end' : 'idle')

  const load = (until?: number) => {
    if (!username) return
    setState('loading')
    fetchTimeline(username, until)
      .then(({ events: ev, lastId: id }) => {
        setEvents((old) => (until ? [...old, ...ev] : ev))
        setLastId(id)
        setState(id === null || ev.length === 0 ? 'end' : 'idle')
      })
      .catch(() => setState('error'))
  }
  useEffect(() => {
    if (preset) {
      setEvents(preset)
      setState('end')
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, preset])

  if (state === 'error' && events.length === 0) return <div className="st-empty">{t('时间胶囊需要登录 bgm;镜像站点无此功能')}</div>
  if (state !== 'loading' && events.length === 0) return <div className="st-empty">{t('还没有记录')}</div>
  return (
    <div className="st-cap">
      {events.map((e) => (
        <div key={`${e.id}-${e.subject.id}`} className="ev">
          <span className="verb">{t(VERB[e.kind])}</span>{' '}
          <a href={`https://bgm.tv/subject/${e.subject.id}`} target="_blank" rel="noreferrer">
            {e.subject.nameCn || e.subject.name}
          </a>
          {e.kind === 'progress' && e.ep ? <span className="prog"> {t('{a} of {b} 话', { a: e.ep, b: e.epsTotal ?? '?' })}</span> : null}
          {e.kind === 'ep' && e.ep ? <span className="prog"> {t('看过第 {n} 话', { n: e.ep })}</span> : null}
          {e.rate ? <span className="prog">{t('（{n} 分）', { n: e.rate })}</span> : null}
          <span className="when">{fmtWhen(e.at)}</span>
        </div>
      ))}
      <div className="more">
        {state === 'end' ? (
          <span className="st-note">{t('没有更多了')}</span>
        ) : (
          <button className="iconbtn" disabled={state === 'loading'} onClick={() => lastId && load(lastId)}>
            {state === 'loading' ? '…' : t('更多')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── 图表:纯 HTML/CSS,细柱、2px 表面间隔、悬停提示、图例 ──────────────

function Legend() {
  return (
    <div className="st-legend">
      {TYPE_ORDER.map((ty) => (
        <span key={ty}>
          <i style={{ background: TYPE_VAR[ty] }} />
          {t(TYPE_LABEL[ty])}
        </span>
      ))}
    </div>
  )
}

function Timeline({
  buckets,
  unit,
  seasonList,
  onOpenSeason,
}: {
  buckets: Bucket[]
  unit: 'season' | 'year'
  seasonList: string[]
  onOpenSeason: (k: string) => void
}) {
  const [hov, setHov] = useState<{ i: number; x: number } | null>(null)
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const label = (b: Bucket) => (unit === 'season' ? fmtSeason(b.key) : b.key)
  const every = unit === 'year' ? (buckets.length > 20 ? 2 : 1) : 4
  return (
    <div className="st-chart">
      <div className="st-bars" onMouseLeave={() => setHov(null)}>
        <span className="st-grid" style={{ bottom: '50%' }}>
          {Math.round(max / 2)}
        </span>
        <span className="st-grid" style={{ bottom: '100%' }}>
          {max}
        </span>
        {buckets.map((b, i) => {
          const link = unit === 'season' && seasonList.includes(b.key)
          return (
            <div
              key={b.key}
              className={'st-bar' + (link ? ' link' : '') + (hov?.i === i ? ' hov' : '')}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                const wrap = el.parentElement!
                setHov({ i, x: Math.min(el.offsetLeft, Math.max(0, wrap.clientWidth - 170)) })
              }}
              onClick={() => link && onOpenSeason(b.key)}
              aria-label={`${label(b)} ${b.total}`}
            >
              {TYPE_ORDER.map(
                (ty) =>
                  b.counts[ty] > 0 && (
                    <div key={ty} className="st-seg" style={{ height: `${(b.counts[ty] / max) * 100}%`, background: TYPE_VAR[ty] }} />
                  ),
              )}
            </div>
          )
        })}
        {hov && (
          <div className="st-tip" style={{ left: hov.x }}>
            <div className="tt">
              {label(buckets[hov.i])} · {t('{n} 部', { n: buckets[hov.i].total })}
            </div>
            {TYPE_ORDER.filter((ty) => buckets[hov.i].counts[ty] > 0).map((ty) => (
              <div key={ty}>
                <i style={{ background: TYPE_VAR[ty] }} />
                {t(TYPE_LABEL[ty])} {buckets[hov.i].counts[ty]}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="st-xaxis">
        {buckets.map((b, i) => (
          <span key={b.key}>
            {unit === 'year'
              ? i % every === 0
                ? b.key
                : ''
              : buckets.length <= 12
                ? `${b.key.slice(0, 4)}-${b.key.slice(4)}` // 跨度短:每季都标
                : b.key.endsWith('01')
                  ? b.key.slice(0, 4) // 跨度长:只在一月标年份
                  : ''}
          </span>
        ))}
      </div>
      <Legend />
    </div>
  )
}

/** 评分直方图:10 → 1 倒序(与 bgm 主页一致),灰柱、顶端直接标数 */
function Histogram({ hist }: { hist: number[] }) {
  const max = Math.max(1, ...hist.slice(1))
  const order = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  return (
    <div className="st-histwrap">
      <div className="st-hist">
        {order.map((s) => (
          <div key={s} className="b" style={{ height: `${(hist[s] / max) * 100}%` }} title={`${s} · ${hist[s]}`}>
            {hist[s] > 0 && <span className="v">{hist[s]}</span>}
          </div>
        ))}
      </div>
      <div className="st-hist-x">
        {order.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  )
}
