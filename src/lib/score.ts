/**
 * 评分的可信度处理:防止"三五个人打出来的 10.0"混进高分,同时不误伤小众好番。
 *
 * 思路是贝叶斯加权(IMDb 同款),不做硬性人数门槛:
 *   加权分 = (人数×原分 + m×先验均值) / (人数 + m)
 * 人数越少越向全站均值收缩 —— 30 人的 8.0 仍能排前面,3 人的 10.0 自然沉底,
 * 谁都没有被"筛掉",只是排序变诚实。
 */

const M = 50 // 先验权重:评分人数达到 50 时,原分与先验各占一半
const PRIOR = 6.5 // bgm 全站均值附近

/** 人数未知时不收缩(旧归档包无此字段),返回原分 —— 宁可放过不误杀 */
export function weightedScore(score?: number, total?: number): number | undefined {
  if (score === undefined) return undefined
  if (total === undefined) return score
  return (total * score + M * PRIOR) / (total + M)
}

/** bgm 惯例:少于 10 人评分视作尚无有效均分 */
export const MIN_VOTES = 10

/** 评分人数紧凑显示:987 → "987",1234 → "1.2k" */
export function fmtVotes(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n)
}
