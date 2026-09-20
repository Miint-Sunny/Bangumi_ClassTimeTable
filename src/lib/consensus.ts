/**
 * 本季共识榜:把讨论会里每部作品的票(房间投票 / 我的标记 / 好友 bgm 想看)分层排序,
 * 并导出成纯文本(发群)或 PNG 图片(canvas 绘制,不含封面——封面图跨域会污染画布)。
 */
import type { Show } from '../types'
import { displayName, t } from './i18n'

export interface VoteNames {
  wish: string[]
  maybe: string[]
  skip: string[]
}
export type Tier = 'all' | 'some' | 'maybe' | 'skip'
export interface BoardRow {
  show: Show
  votes: VoteNames
  tier: Tier
}
export interface Board {
  rows: BoardRow[]
  unvoted: number
  people: string[]
}

export const TIERS: Tier[] = ['all', 'some', 'maybe', 'skip']
export const TIER_LABEL: Record<Tier, string> = { all: '都想看', some: '有人想看', maybe: '观望', skip: '跳过' }
const VOTE_LABEL = { wish: '想看', maybe: '观望', skip: '跳过' } as const

const md = (iso?: string) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '')

export function buildBoard(list: Show[], votesFor: (id: number) => VoteNames): Board {
  const rows: BoardRow[] = []
  const people = new Set<string>()
  let unvoted = 0
  for (const show of list) {
    const v = votesFor(show.id)
    if (v.wish.length + v.maybe.length + v.skip.length === 0) {
      unvoted++
      continue
    }
    for (const k of ['wish', 'maybe', 'skip'] as const) v[k].forEach((p) => people.add(p))
    const tier: Tier = v.wish.length >= 2 && v.skip.length === 0 ? 'all' : v.wish.length >= 1 ? 'some' : v.maybe.length >= 1 ? 'maybe' : 'skip'
    rows.push({ show, votes: v, tier })
  }
  const order: Record<Tier, number> = { all: 0, some: 1, maybe: 2, skip: 3 }
  rows.sort(
    (a, b) =>
      order[a.tier] - order[b.tier] ||
      b.votes.wish.length - a.votes.wish.length ||
      b.votes.maybe.length - a.votes.maybe.length ||
      a.votes.skip.length - b.votes.skip.length ||
      displayName(a.show).localeCompare(displayName(b.show)),
  )
  return { rows, unvoted, people: [...people] }
}

const voteLine = (v: VoteNames, sep = ' | ') =>
  (['wish', 'maybe', 'skip'] as const)
    .filter((k) => v[k].length)
    .map((k) => `${t(VOTE_LABEL[k])}:${v[k].join(' · ')}`)
    .join(sep)

/** 发群用的纯文本 */
export function boardText(board: Board, title: string, total: number): string {
  const lines: string[] = [`🗣 ${title}`]
  if (board.people.length) lines.push(t('{n} 人参与:{names}', { n: board.people.length, names: board.people.join(' · ') }))
  lines.push(t('已过 {n} 部', { n: total - board.unvoted }) + ` / ${total}`, '')
  for (const tier of TIERS) {
    const rows = board.rows.filter((r) => r.tier === tier)
    if (!rows.length) continue
    lines.push(`【${t(TIER_LABEL[tier])}】`)
    for (const r of rows) {
      const date = r.show.firstAirDate ? `(${md(r.show.firstAirDate)})` : ''
      lines.push(`· ${displayName(r.show)}${date} ${voteLine(r.votes)}`)
    }
    lines.push('')
  }
  if (board.unvoted) lines.push(t('未过 {n} 部', { n: board.unvoted }))
  lines.push('bgmtimetable.com')
  return lines.join('\n')
}

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

/** 画成 PNG(宽 960 CSS 像素,按设备像素比放大),返回 Blob */
export async function renderBoardPng(board: Board, title: string, total: number): Promise<Blob> {
  const W = 960
  const pad = 40
  const rowH = 46
  const font = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
  const tiers = TIERS.map((tier) => ({ tier, rows: board.rows.filter((r) => r.tier === tier) })).filter((x) => x.rows.length)
  const H = pad + 96 + tiers.reduce((h, x) => h + 40 + x.rows.length * rowH, 0) + 56 + pad
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const colors = {
    bg: cssVar('--card', '#fff'),
    text: cssVar('--text', '#222'),
    soft: cssVar('--text-soft', '#666'),
    subtle: cssVar('--text-subtle', '#999'),
    pink: cssVar('--pink-strong', '#e26470'),
    wish: cssVar('--st-wish', '#d47f2a'),
    hold: cssVar('--st-hold', '#7b6fc2'),
    line: cssVar('--border-soft', '#eee'),
  }
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, W, H)

  let y = pad
  ctx.fillStyle = colors.pink
  ctx.font = `28px ${font}`
  ctx.textBaseline = 'top'
  ctx.fillText(`🗣 ${title}`, pad, y)
  y += 44
  ctx.fillStyle = colors.soft
  ctx.font = `14px ${font}`
  const sub = [
    board.people.length ? t('{n} 人参与:{names}', { n: board.people.length, names: board.people.join(' · ') }) : '',
    `${t('已过 {n} 部', { n: total - board.unvoted })} / ${total}`,
  ]
    .filter(Boolean)
    .join(' · ')
  ctx.fillText(fit(ctx, sub, W - pad * 2), pad, y)
  y += 40

  for (const { tier, rows } of tiers) {
    ctx.fillStyle = colors.pink
    ctx.font = `18px ${font}`
    ctx.fillText(t(TIER_LABEL[tier]), pad, y + 8)
    ctx.fillStyle = colors.subtle
    ctx.font = `12px ${font}`
    ctx.fillText(String(rows.length), pad + ctx.measureText(t(TIER_LABEL[tier])).width * 1.5 + 8, y + 14)
    y += 40
    for (const r of rows) {
      ctx.fillStyle = colors.line
      ctx.fillRect(pad, y + rowH - 1, W - pad * 2, 1)
      ctx.fillStyle = colors.text
      ctx.font = `16px ${font}`
      const nameW = 400
      ctx.fillText(fit(ctx, displayName(r.show), nameW), pad, y + 8)
      ctx.fillStyle = colors.subtle
      ctx.font = `12px ${font}`
      if (r.show.firstAirDate) ctx.fillText(md(r.show.firstAirDate), pad, y + 29)
      // 右侧:想看 / 观望 / 跳过 的名字,各自的颜色
      let x = pad + nameW + 20
      ctx.font = `13px ${font}`
      const maxX = W - pad
      for (const k of ['wish', 'maybe', 'skip'] as const) {
        if (!r.votes[k].length || x >= maxX - 40) continue
        ctx.fillStyle = k === 'wish' ? colors.wish : k === 'maybe' ? colors.hold : colors.subtle
        const s = fit(ctx, `${t(VOTE_LABEL[k])} ${r.votes[k].join(' · ')}`, maxX - x)
        ctx.fillText(s, x, y + 14)
        x += ctx.measureText(s).width + 18
      }
      y += rowH
    }
  }
  y += 16
  ctx.fillStyle = colors.subtle
  ctx.font = `12px ${font}`
  ctx.fillText([board.unvoted ? t('未过 {n} 部', { n: board.unvoted }) : '', 'bgmtimetable.com'].filter(Boolean).join(' · '), pad, y)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
