/**
 * 统计页的"魔怔"区块:观看节奏(GitHub 贡献图式日历 + 周几×小时)、口味逆风盘、弃番解剖、
 * 追新 vs 补番、冷门指数、口味演变、制作/声优榜、好友重合度。全部纯 HTML/CSS 图表。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CapsuleEvent, LibItem } from '../lib/bgm'
import { computeRhythm } from '../lib/rhythm'
import { TYPE_ORDER, TYPE_VAR, type Catchup, type Deviation, type Drops, type Obscure, type Taste } from '../lib/stats'
import { aggregateStaff, fetchStaff, type StaffInfo, type StaffRanks } from '../lib/staff'
import { fetchFriendLibrary, overlap, type Overlap } from '../lib/friends'
import { t, wdFull, wdShort } from '../lib/i18n'

const fmt1 = (n: number | null) => (n === null ? '–' : n.toFixed(1))
const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`)
const level = (n: number, max: number) => (n <= 0 ? 0 : n <= max * 0.25 ? 1 : n <= max * 0.5 ? 2 : n <= max * 0.75 ? 3 : 4)

/** 让热力格随容器宽度伸缩:cols 列 + 左侧标签 + 间隙 刚好铺满,夹在 [min, max] 之间 */
function useCellSize(ref: React.RefObject<HTMLDivElement | null>, cols: number, labelW: number, min: number, max: number) {
  const [size, setSize] = useState(max)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => setSize(Math.max(min, Math.min(max, Math.floor((el.clientWidth - labelW - (cols - 1) * 3) / cols))))
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, cols, labelW, min, max])
  return size
}

function Kpi({ n, l, s }: { n: string; l: string; s?: string }) {
  return (
    <div className="st-kpi">
      <div className="n">{n}</div>
      <div className="l">
        {l}
        {s ? <span className="s"> · {s}</span> : null}
      </div>
    </div>
  )
}

/** bgm 主页同款封面墙:封面 + 标题两行 + 右上角角标 */
export function CoverGrid({ items, badge }: { items: LibItem[]; badge: (it: LibItem) => string }) {
  return (
    <div className="st-covers">
      {items.map((it) => (
        <a key={it.id} className="st-cover" href={`https://bgm.tv/subject/${it.id}`} target="_blank" rel="noreferrer" title={`${it.nameCn}${it.name && it.name !== it.nameCn ? ` / ${it.name}` : ''}`}>
          <span className="img">
            {it.image ? <img src={it.image} loading="lazy" alt="" /> : <span className="ph">{it.nameCn.slice(0, 1)}</span>}
            <span className="badge">{badge(it)}</span>
          </span>
          <span className="t">{it.nameCn}</span>
        </a>
      ))}
    </div>
  )
}

function Sub({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="st-sec-t">
      {title}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

// ── 观看节奏 ──────────────────────────────────────────────────────────

export function RhythmSection({ events, loading, now }: { events: CapsuleEvent[]; loading: boolean; now: number }) {
  const r = useMemo(() => computeRhythm(events, now), [events, now])
  const calRef = useRef<HTMLDivElement>(null)
  const whRef = useRef<HTMLDivElement>(null)
  const cols = Math.ceil(r.days.length / 7)
  const calCell = useCellSize(calRef, cols, 24, 9, 14)
  const whCell = useCellSize(whRef, 24, 38, 9, 15)
  if (loading && !events.length) return <div className="st-empty">{t('正在整理时间线…')}</div>
  if (!events.length) return <div className="st-empty">{t('还没有记录')}</div>
  const max = Math.max(1, ...r.days.map((d) => d.n))
  // 月份标签:某周(列)里出现了 1 号,就在该列标月份
  const monthAt: Record<number, string> = {}
  r.days.forEach((d, i) => {
    if (d.date.endsWith('-01')) monthAt[Math.floor(i / 7)] = String(+d.date.slice(5, 7))
  })
  const whMax = Math.max(1, ...r.weekHour.flat())
  const hours = Array.from({ length: 24 }, (_, h) => r.weekHour.reduce((a, row) => a + row[h], 0))
  const hMax = Math.max(1, ...hours)
  const peak = hours.indexOf(hMax)
  const gapText = r.medianGapH === null ? '–' : r.medianGapH >= 48 ? t('{n} 天', { n: (r.medianGapH / 24).toFixed(1) }) : t('{n} 小时', { n: r.medianGapH.toFixed(1) })
  return (
    <>
      <div className="st-kpis grid">
        <Kpi n={r.total.toLocaleString()} l={t('动作')} s={t('{n} 个活跃日', { n: r.activeDays })} />
        <Kpi n={pct(r.nightRatio)} l={t('深夜党指数')} s={t('0–5 点占比')} />
        <Kpi n={gapText} l={t('一集平均耗时')} s={t('同一部相邻两话的中位间隔')} />
        <Kpi n={String(r.streakWeeks)} l={t('连续追番周数')} />
        <Kpi n={r.longest ? t('{n} 天', { n: r.longest.days }) : '–'} l={t('最长追番')} s={r.longest?.name} />
        <Kpi n={r.busiest ? String(r.busiest.n) : '–'} l={t('最忙的一天')} s={r.busiest?.date} />
      </div>

      <div className="hm-scroll" ref={calRef} style={{ '--hm': `${calCell}px` } as React.CSSProperties}>
        <div className="hm-wrap">
          <div className="hm-months" style={{ gridTemplateColumns: `repeat(${cols}, var(--hm))` }}>
            {Array.from({ length: cols }, (_, c) => (
              <span key={c}>{monthAt[c] ? t('{m}月', { m: monthAt[c] }) : ''}</span>
            ))}
          </div>
          <div className="hm-body">
            <div className="hm-wd">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i}>{i % 2 === 0 ? wdShort(i + 1) : ''}</span>
              ))}
            </div>
            <div className="hm-cal" style={{ gridTemplateColumns: `repeat(${cols}, var(--hm))` }}>
              {r.days.map((d) => (
                <span key={d.date} className={`hm-c l${level(d.n, max)}`} style={{ gridRow: d.wd + 1 }} title={`${d.date} · ${t('{n} 次', { n: d.n })}`} />
              ))}
            </div>
          </div>
          <div className="hm-legend">
            <span>{t('少')}</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} className={`hm-c l${l}`} />
            ))}
            <span>{t('多')}</span>
          </div>
        </div>
      </div>

      <div className="st-two">
        <div>
          <div className="st-sub">{t('周几 × 时段')}</div>
          <div className="hm-scroll" ref={whRef} style={{ '--hm': `${whCell}px` } as React.CSSProperties}>
            <div className="wh-wrap">
              <div className="wh-hours">
                <span />
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h}>{h % 6 === 0 ? h : ''}</span>
                ))}
              </div>
              {r.weekHour.map((row, wd) => (
                <div key={wd} className="wh-row">
                  <span className="wh-wd">{wdFull(wd + 1)}</span>
                  {row.map((n, h) => (
                    <i key={h} className={`hm-c l${level(n, whMax)}`} title={`${wdFull(wd + 1)} ${h}:00 · ${t('{n} 次', { n })}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="st-sub">
            {t('一天里的时段')}
            {hMax > 0 && <span className="hint">{t('高峰 {h} 点', { h: peak })}</span>}
          </div>
          <div className="st-histwrap hours">
            <div className="st-hist">
              {hours.map((n, h) => (
                <div key={h} className={'b' + (h === peak ? ' peak' : '')} style={{ height: `${(n / hMax) * 100}%` }} title={`${h}:00 · ${t('{n} 次', { n })}`} />
              ))}
            </div>
            <div className="st-hist-x">
              {hours.map((_, h) => (
                <span key={h}>{h % 6 === 0 ? h : ''}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── 口味逆风盘 ────────────────────────────────────────────────────────

export function DeviationSection({ d }: { d: Deviation }) {
  if (!d.n) return <div className="st-empty">{t('暂无数据')}</div>
  const max = Math.max(1, ...d.hist)
  const labels = ['≤-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '≥+4']
  const badge = (it: LibItem) => `${it.rate} / ${it.score.toFixed(1)}`
  return (
    <>
      <div className="st-kpis">
        <Kpi n={d.picky === null ? '–' : (d.picky > 0 ? '+' : '') + d.picky.toFixed(2)} l={t('挑剔度')} s={t('我的分减站均分的平均')} />
        <Kpi n={d.corr === null ? '–' : d.corr.toFixed(2)} l={t('与站均的相关系数')} />
        <Kpi n={String(d.n)} l={t('可比对的作品')} />
      </div>
      <div className="st-histwrap">
        <div className="st-hist">
          {d.hist.map((n, i) => (
            <div key={i} className="b" style={{ height: `${(n / max) * 100}%` }} title={`${labels[i]} · ${n}`}>
              {n > 0 && <span className="v">{n}</span>}
            </div>
          ))}
        </div>
        <div className="st-hist-x">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
      {d.hidden.length > 0 && (
        <>
          <div className="st-sub">{t('私藏神作(我 ≥8,高出站均 ≥1.5)')}</div>
          <CoverGrid items={d.hidden} badge={badge} />
        </>
      )}
      {d.contrarian.length > 0 && (
        <>
          <div className="st-sub">{t('众人皆醉(我 ≤5,低于站均 ≥2)')}</div>
          <CoverGrid items={d.contrarian} badge={badge} />
        </>
      )}
    </>
  )
}

// ── 弃番解剖 ─────────────────────────────────────────────────────────

export function DropsSection({ d }: { d: Drops }) {
  if (!d.n) return <div className="st-empty">{t('一部都没弃过,了不起')}</div>
  const max = Math.max(1, ...d.hist)
  return (
    <>
      <div className="st-kpis">
        <Kpi n={String(d.n)} l={t('弃番数')} />
        <Kpi n={d.avgEp === null ? '–' : t('第 {n} 话', { n: d.avgEp.toFixed(1) })} l={t('平均弃在')} />
        {d.byLength.map((l) => (
          <Kpi key={l.label} n={pct(l.rate)} l={t('{len} 话完走率', { len: l.label })} s={t('{n} 部', { n: l.n })} />
        ))}
      </div>
      <div className="st-sub">{t('弃在第几话')}</div>
      <div className="st-histwrap">
        <div className="st-hist">
          {d.hist.slice(1).map((n, i) => (
            <div key={i} className="b" style={{ height: `${(n / max) * 100}%` }} title={`${i + 1} · ${n}`}>
              {n > 0 && <span className="v">{n}</span>}
            </div>
          ))}
        </div>
        <div className="st-hist-x">
          {d.hist.slice(1).map((_, i) => (
            <span key={i}>{i === 12 ? '13+' : i + 1}</span>
          ))}
        </div>
      </div>
      {d.byTag.length > 0 && (
        <>
          <div className="st-sub">{t('最容易弃的题材(≥4 部)')}</div>
          <div className="st-tags">
            {d.byTag.map((tg) => (
              <div key={tg.name} className="row">
                <span className="name">{tg.name}</span>
                <span className="track">
                  <span className="bar" style={{ width: `${tg.rate * 100}%`, background: 'var(--st-drop)' }} />
                </span>
                <span className="n">{Math.round(tg.rate * 100)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ── 追新 vs 补番 ──────────────────────────────────────────────────────

export function CatchupSection({ c }: { c: Catchup }) {
  if (!c.n) return <div className="st-empty">{t('暂无数据')}</div>
  const max = Math.max(1, ...c.debt.map((d) => d.total))
  return (
    <>
      <div className="st-kpis">
        <Kpi n={pct(c.inSeasonRate)} l={t('追新率')} s={t('开播 120 天内看完')} />
        <Kpi n={c.avgLagDays === null ? '–' : t('{n} 天', { n: Math.round(c.avgLagDays) })} l={t('平均滞后')} s={t('开播到看完')} />
      </div>
      {c.debt.length > 0 && (
        <>
          <div className="st-sub">{t('每年看完的番里,补的往年番有多少')}</div>
          <div className="st-chart">
            <div className="st-bars small">
              {c.debt.map((d) => (
                <div key={d.y} className="st-bar" title={`${d.y} · ${t('看完 {n} 部,其中补番 {m} 部', { n: d.total, m: d.backlog })}`}>
                  <div className="st-seg" style={{ height: `${((d.total - d.backlog) / max) * 100}%`, background: 'var(--st-done)' }} />
                  {d.backlog > 0 && <div className="st-seg" style={{ height: `${(d.backlog / max) * 100}%`, background: 'var(--st-hold)' }} />}
                </div>
              ))}
            </div>
            <div className="st-xaxis">
              {c.debt.map((d) => (
                <span key={d.y}>{d.y}</span>
              ))}
            </div>
            <div className="st-legend">
              <span>
                <i style={{ background: 'var(--st-done)' }} />
                {t('当年新番')}
              </span>
              <span>
                <i style={{ background: 'var(--st-hold)' }} />
                {t('补往年的番')}
              </span>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── 冷门指数 ─────────────────────────────────────────────────────────

export function ObscureSection({ o }: { o: Obscure }) {
  if (o.medianTotal === null) return <div className="st-empty">{t('暂无数据')}</div>
  return (
    <>
      <div className="st-kpis">
        <Kpi n={o.medianTotal.toLocaleString()} l={t('看过作品的站内收藏人数中位数')} />
      </div>
      <div className="st-sub">{t('你看过的最冷门的几部')}</div>
      <CoverGrid items={o.list} badge={(it) => t('{n} 人', { n: it.total.toLocaleString() })} />
    </>
  )
}

// ── 口味演变 ─────────────────────────────────────────────────────────

const TASTE_COLORS = [...TYPE_ORDER.map((ty) => TYPE_VAR[ty]), 'var(--text-subtle)']

export function TasteSection({ ts }: { ts: Taste }) {
  if (!ts.rows.length) return <div className="st-empty">{t('暂无数据')}</div>
  const names = [...ts.tags, t('其他')]
  return (
    <div className="st-chart">
      <div className="st-bars small pct">
        {ts.rows.map((r) => (
          <div key={r.y} className="st-bar" title={`${r.y} · ${names.map((n, i) => `${n} ${Math.round((r.counts[i] / r.total) * 100)}%`).join(' · ')}`}>
            {r.counts.map((n, i) => n > 0 && <div key={i} className="st-seg" style={{ height: `${(n / r.total) * 100}%`, background: TASTE_COLORS[i] }} />)}
          </div>
        ))}
      </div>
      <div className="st-xaxis">
        {ts.rows.map((r) => (
          <span key={r.y}>{r.y}</span>
        ))}
      </div>
      <div className="st-legend">
        {names.map((n, i) => (
          <span key={n}>
            <i style={{ background: TASTE_COLORS[i] }} />
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── 制作 / 声优榜(按需拉取)────────────────────────────────────────────

export function StaffSection({ items }: { items: LibItem[] }) {
  const targets = useMemo(
    () => items.filter((it) => it.type === 2 || it.type === 3).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 300),
    [items],
  )
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [ranks, setRanks] = useState<StaffRanks | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const run = async () => {
    const map = new Map<number, StaffInfo>()
    setProgress({ done: 0, total: targets.length })
    for (const [i, it] of targets.entries()) {
      if (!alive.current) return
      try {
        map.set(it.id, await fetchStaff(it.id))
      } catch {
        /* 单条失败跳过 */
      }
      setProgress({ done: i + 1, total: targets.length })
      if (i % 10 === 9) setRanks(aggregateStaff(items, map)) // 边拉边出结果
      await new Promise((r) => setTimeout(r, 120))
    }
    setRanks(aggregateStaff(items, map))
  }
  if (!targets.length) return <div className="st-empty">{t('暂无数据')}</div>
  const col = (title: string, rows: StaffRanks['studios'], link?: (id?: number) => string | undefined) => (
    <div className="st-rank">
      <div className="st-sub">{title}</div>
      {rows.length ? (
        rows.map((r, i) => (
          <div key={r.name} className="row">
            <span className="i">{i + 1}</span>
            {link?.(r.id) ? (
              <a className="name" href={link(r.id)} target="_blank" rel="noreferrer">
                {r.name}
              </a>
            ) : (
              <span className="name">{r.name}</span>
            )}
            <span className="n">{t('{n} 部', { n: r.n })}</span>
            <span className="avg">{r.avg === null ? '' : fmt1(r.avg)}</span>
          </div>
        ))
      ) : (
        <div className="st-empty">{t('暂无数据')}</div>
      )}
    </div>
  )
  return (
    <>
      {!progress && (
        <div className="st-notice-row set-note">
          <span>{t('要拉取 {n} 部条目的制作与角色信息(官方 API,每部两次请求,结果缓存 30 天)', { n: targets.length })}</span>
          <button className="iconbtn accent" onClick={run}>
            {t('开始统计')}
          </button>
        </div>
      )}
      {progress && progress.done < progress.total && <div className="st-note">{t('已拉取 {a} / {b}', { a: progress.done, b: progress.total })}</div>}
      {ranks && (
        <div className="st-three">
          {col(t('制作公司'), ranks.studios)}
          {col(t('导演'), ranks.directors)}
          {col(t('声优(主角/配角)'), ranks.actors, (id) => (id ? `https://bgm.tv/person/${id}` : undefined))}
        </div>
      )}
      {ranks && <div className="st-note">{t('最右一列是我给这些作品的平均分——验证"某声优出场即高分"的迷信')}</div>}
    </>
  )
}

// ── 好友重合度 ───────────────────────────────────────────────────────

export function FriendsSection({ items, friends }: { items: LibItem[]; friends: string[] }) {
  const [res, setRes] = useState<Record<string, Overlap | 'loading' | 'error'>>({})
  if (!friends.length) return <div className="st-empty">{t('在「设置 → 好友」里填上 bgm 用户名,这里就能算口味相似度')}</div>
  const calc = async (u: string) => {
    setRes((r) => ({ ...r, [u]: 'loading' }))
    try {
      const lib = await fetchFriendLibrary(u)
      setRes((r) => ({ ...r, [u]: overlap(items, lib, u) }))
    } catch {
      setRes((r) => ({ ...r, [u]: 'error' }))
    }
  }
  return (
    <table className="st-table">
      <thead>
        <tr>
          <th>{t('好友')}</th>
          <th className="num">{t('共同收藏')}</th>
          <th className="num">{t('共同看过')}</th>
          <th className="num">{t('口味相似度')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {friends.map((u) => {
          const r = res[u]
          const o = r && typeof r === 'object' ? r : null
          return (
            <tr key={u}>
              <td>
                <a href={`https://bgm.tv/user/${u}`} target="_blank" rel="noreferrer">
                  {u}
                </a>
              </td>
              <td className="num">{o ? o.common : '–'}</td>
              <td className="num">{o ? o.commonDone : '–'}</td>
              <td className="num" title={o ? t('共同打分 {n} 部', { n: o.ratedBoth }) : ''}>
                {o ? (o.corr === null ? t('样本不足') : o.corr.toFixed(2)) : '–'}
              </td>
              <td>
                {o ? null : (
                  <button className="iconbtn" disabled={r === 'loading'} onClick={() => calc(u)}>
                    {r === 'loading' ? '…' : r === 'error' ? t('重试') : t('计算')}
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
