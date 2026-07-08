import type { Show, Tracking } from '../types'
import { DAY_MS } from './time'

/** 已播到第几集(0 = 还没开播);无精确时间返回 undefined */
export function airedEps(show: Show, now: number): number | undefined {
  if (!show.begin) return undefined
  if (now < show.begin) return 0
  // 开播超过 400 天且不知总集数的长篇(海贼王类),周数折算不可靠,不给数字
  if (!show.epsTotal && now - show.begin > 400 * DAY_MS) return undefined
  const n = Math.floor((now - show.begin) / (show.periodDays * DAY_MS)) + 1
  return show.epsTotal ? Math.min(n, show.epsTotal) : n
}

/** 落后集数(仅"在看"状态有意义) */
export function behindCount(show: Show, tracking: Tracking, now: number): number {
  if (tracking.status[show.id] !== 'watching') return 0
  const aired = airedEps(show, now)
  if (aired === undefined) return 0
  return Math.max(0, aired - (tracking.watched[show.id] ?? 0))
}
