import { useEffect, useRef, useState } from 'react'

/**
 * 翻页脉冲:游标变化时让容器重放一次淡入(只动 opacity,不碰 sticky 表头)。
 * 用两个等价关键帧(page-fade / page-fade-b)按奇偶交替触发重放——
 * 不依赖 requestAnimationFrame 或 animationend,后台标签页里也不会卡住状态。
 */
export function usePageFade(cursor: unknown): string {
  const [tick, setTick] = useState(0)
  const prev = useRef(cursor)
  useEffect(() => {
    if (prev.current !== cursor) {
      prev.current = cursor
      setTick((t) => t + 1)
    }
  }, [cursor])
  return tick === 0 ? '' : tick % 2 ? 'page-fade' : 'page-fade-b'
}
