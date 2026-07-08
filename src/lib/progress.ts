import type { Show, Tracking } from '../types'
import { airedCount } from './schedule'

/** 已播到第几集(0 = 还没开播);无法推导返回 undefined。规则见 schedule.ts */
export function airedEps(show: Show, now: number): number | undefined {
  return airedCount(show, now)
}

/** 落后集数(仅"在看"状态有意义) */
export function behindCount(show: Show, tracking: Tracking, now: number): number {
  if (tracking.status[show.id] !== 'watching') return 0
  const aired = airedEps(show, now)
  if (aired === undefined) return 0
  return Math.max(0, aired - (tracking.watched[show.id] ?? 0))
}
