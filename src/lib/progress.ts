import type { Show, Tracking } from '../types'
import { airedCount } from './schedule'
import { DAY_MS, isCarryOver } from './time'

/** 已播到第几集(0 = 还没开播);无法推导返回 undefined。规则见 schedule.ts */
export function airedEps(show: Show, now: number): number | undefined {
  return airedCount(show, now)
}

export type Continuity = 'new' | 'carry' | 'long'

/**
 * 跨季分级:
 *   new   本季新番
 *   carry 上季续播 —— 半年番进下半等,季度开始前已播 ≤ 20 集
 *   long  长期放送 —— 年番/多年番(柯南、光美…),季度开始前已播 > 20 集,
 *          或总集数明确超过两季量(> 32)
 * ">20 集"这个判据能把"半年番第二季度"(此时 12~14 集)和真·长期番分开。
 */
export function continuity(show: Show, seasonStart: number): Continuity {
  if (!isCarryOver(show, seasonStart)) return 'new'
  const airedBefore = airedEps(show, seasonStart) ?? 0
  // 任一即长期:季初已播 >20 集 / 总集数超两季量 /
  // 开播距季初超 200 天(柯南等超长篇的 airedCount 因不可靠返回 undefined,用"年龄"兜底)
  if (airedBefore > 20 || (show.epsTotal ?? 0) > 32) return 'long'
  if (show.begin && seasonStart - show.begin > 200 * DAY_MS) return 'long'
  return 'carry'
}

/** 落后集数(仅"在看"状态有意义) */
export function behindCount(show: Show, tracking: Tracking, now: number): number {
  if (tracking.status[show.id] !== 'watching') return 0
  const aired = airedEps(show, now)
  if (aired === undefined) return 0
  return Math.max(0, aired - (tracking.watched[show.id] ?? 0))
}
