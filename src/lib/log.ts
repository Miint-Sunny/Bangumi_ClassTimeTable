/**
 * 本机事件日志:记录应用内的改状态 / 加集数 / 打分动作(带时间戳),
 * 未登录 bgm 时也能有时间胶囊与观看节奏;登录后以 bgm 时间线为准。
 * 只记本机操作 —— 同步合并从 bgm 拉下来的改动不记(App 里用 skip 标记跳过)。
 */

import type { Show, Tracking, WatchStatus } from '../types'
import type { CapsuleEvent } from './bgm'

const KEY = 'btt:log'
const MAX = 2000

export function readLog(): CapsuleEvent[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

export function appendLog(evs: Omit<CapsuleEvent, 'id'>[]) {
  if (!evs.length) return
  const cur = readLog()
  let id = (cur[0]?.id ?? 0) + 1
  const add = evs.map((e) => ({ ...e, id: id++ }))
  try {
    localStorage.setItem(KEY, JSON.stringify([...add.reverse(), ...cur].slice(0, MAX)))
  } catch {}
}

const KIND: Record<WatchStatus, CapsuleEvent['kind']> = { wish: 'wish', done: 'done', watching: 'watching', dropped: 'drop' }

/** 两份 tracking 的差异 → 事件(状态变化 / 进度前进 / 打分) */
export function diffTracking(prev: Tracking, next: Tracking, shows: Show[] | null, now: number): Omit<CapsuleEvent, 'id'>[] {
  if (prev === next) return []
  const byId = new Map((shows ?? []).map((s) => [s.id, s]))
  const subj = (id: number) => {
    const s = byId.get(id)
    return { id, name: s?.nameJp ?? '', nameCn: s?.nameCn ?? `#${id}` }
  }
  const out: Omit<CapsuleEvent, 'id'>[] = []
  const ids = new Set([...Object.keys(next.status), ...Object.keys(next.watched), ...Object.keys(next.rates)].map(Number))
  for (const id of ids) {
    const st = next.status[id]
    const rate = next.rates[id] ?? 0
    if (st && st !== prev.status[id]) out.push({ at: now, kind: KIND[st], subject: subj(id), rate: rate || undefined })
    else if (st && rate > 0 && rate !== (prev.rates[id] ?? 0)) out.push({ at: now, kind: KIND[st], subject: subj(id), rate })
    const w = next.watched[id] ?? 0
    if (w > (prev.watched[id] ?? 0)) out.push({ at: now, kind: 'progress', subject: subj(id), ep: w, epsTotal: byId.get(id)?.epsTotal })
  }
  return out
}
