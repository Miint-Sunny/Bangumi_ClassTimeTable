/**
 * 追番统计页(bgm.tv「收藏统计」风格):五种收藏状态的总览、每季/每年追番柱图、
 * 换季对比、评分分布、题材偏好、年度足迹、9 分神作。
 * 数据:登录 bgm 时拉全量收藏(pullLibrary,缓存 24h);未登录退回本机当季 tracking。
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { BgmAccount, Show, Tracking, WatchStatus } from '../types'
import { pullLibrary, type LibItem, type Library } from '../lib/bgm'
import {
  computeStats,
  prevSeasonKey,
  TYPE_LABEL,
  TYPE_ORDER,
  TYPE_VAR,
  type Bucket,
  type CollType,
} from '../lib/stats'
import { fmtSeason } from '../lib/seasons'
import { currentSeason } from '../lib/time'
import { t } from '../lib/i18n'

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
const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`)

export default function StatsModal({ account, tracking, shows, seasonList, onOpenSeason, onClose }: Props) {
  const [lib, setLib] = useState<Library | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshN, setRefreshN] = useState(0)
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

  const items = useMemo(() => (live ? (lib?.items ?? []) : localLibrary(tracking, shows)), [live, lib, tracking, shows])
  const st = useMemo(() => computeStats(items), [items])
  const cur = currentSeason(Date.now()).yyyymm
  const prev = prevSeasonKey(cur)
  const curB = st.bySeason[cur]
  const prevB = st.bySeason[prev]

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stats">
        <button className="close" onClick={onClose} aria-label={t('关闭')}>
          ×
        </button>

        <div className="st-head">
          <h2>{t('追番统计')}</h2>
          <span className="sub">
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

        {!live && <div className="set-note st-notice">{t('登录 bgm 账号后可统计全部历史收藏;现在只统计本机记录的当季追番。')}</div>}
        {error && <div className="set-note st-notice">{t('拉取失败:{e}', { e: error })}</div>}
        {loading && !lib && <div className="st-empty">{t('正在拉取全部收藏…')}</div>}

        {items.length === 0 && !loading ? (
          <div className="st-empty">{t('暂无数据')}</div>
        ) : (
          <>
            {/* ── 总览 ── */}
            <div className="st-tiles">
              {TYPE_ORDER.map((ty) => (
                <div key={ty} className="st-tile" style={{ '--tile-c': TYPE_VAR[ty] } as CSSProperties}>
                  <div className="n">{st.counts[ty].toLocaleString()}</div>
                  <div className="l">{t(TYPE_LABEL[ty])}</div>
                </div>
              ))}
              <div className="st-tile">
                <div className="n">{st.epsWatched.toLocaleString()}</div>
                <div className="l">{t('总集数')}</div>
              </div>
              <div className="st-tile">
                <div className="n">{st.firstYear ? new Date().getFullYear() - st.firstYear + 1 : '–'}</div>
                <div className="l">
                  {t('追番年数')}
                  {st.firstYear ? <span className="s"> · {t('自 {y} 年起', { y: st.firstYear })}</span> : null}
                </div>
              </div>
              <div className="st-tile">
                <div className="n">{fmt1(st.myMean)}</div>
                <div className="l">
                  {t('平均打分')}
                  {st.siteMean !== null ? <span className="s"> · {t('站均 {s}', { s: fmt1(st.siteMean) })}</span> : null}
                </div>
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
              {/* ── 换季对比 ── */}
              <div className="st-sec">
                <div className="st-sec-t">
                  {t('换季对比')}
                  <span className="hint">{t('完走率 = 看过 ÷ (看过 + 抛弃)')}</span>
                </div>
                <div className="st-cmp">
                  {[
                    [t('本季'), cur, curB],
                    [t('上季'), prev, prevB],
                  ].map(([label, key, b]) => {
                    const bk = b as Bucket | undefined
                    const done = bk?.counts[2] ?? 0
                    const drop = bk?.counts[5] ?? 0
                    return (
                      <div key={key as string} className="col">
                        <h4>
                          {label as string} · {fmtSeason(key as string)}
                        </h4>
                        <div className="kv">
                          <span>{t('在看')}</span>
                          <b>{bk?.counts[3] ?? 0}</b>
                        </div>
                        <div className="kv">
                          <span>{t('看过')}</span>
                          <b>{done}</b>
                        </div>
                        <div className="kv">
                          <span>{t('抛弃')}</span>
                          <b>{drop}</b>
                        </div>
                        <div className="kv">
                          <span>{t('想看')}</span>
                          <b>{bk?.counts[1] ?? 0}</b>
                        </div>
                        <div className="kv">
                          <span>{t('完走率')}</span>
                          <b>{pct(done + drop ? done / (done + drop) : null)}</b>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── 评分分布 ── */}
              <div className="st-sec">
                <div className="st-sec-t">
                  {t('评分分布')}
                  <span className="hint">{t('打过分 {n} 部', { n: st.rated })}</span>
                </div>
                {st.rated ? <Histogram hist={st.hist} /> : <div className="st-empty">{t('暂无数据')}</div>}
              </div>
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

function Histogram({ hist }: { hist: number[] }) {
  const max = Math.max(1, ...hist.slice(1))
  return (
    <div className="st-histwrap">
      <div className="st-hist">
        {hist.slice(1).map((n, i) => (
          <div key={i} className="b" style={{ height: `${(n / max) * 100}%` }} title={`${i + 1} · ${n}`}>
            {n > 0 && <span className="v">{n}</span>}
          </div>
        ))}
      </div>
      <div className="st-hist-x">
        {hist.slice(1).map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
    </div>
  )
}
