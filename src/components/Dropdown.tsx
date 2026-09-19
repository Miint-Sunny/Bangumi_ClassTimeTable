/**
 * 自绘下拉:替代原生 <select>(原生的弹层样式跟随系统,和站点视觉脱节)。
 * 触发器沿用调用方传入的 className(如 season-sel),弹层为站内风格的浮层;
 * 支持分组、键盘(↑↓ Home End Enter Esc)、点击外部关闭、打开时选中项滚入视野。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface DdOption {
  value: string
  label: string
  title?: string
  disabled?: boolean
}
export interface DdGroup {
  label?: string
  options: DdOption[]
}
interface Props {
  value: string
  onChange: (v: string) => void
  groups: DdGroup[]
  className?: string
  title?: string
  align?: 'left' | 'right' // 弹层贴左还是贴右(靠视口右缘的触发器用 right)
  inline?: boolean // 分组横排:组名在左、选项在同一行(季度选择:一年一行、四季横排)
}

export default function Dropdown({ value, onChange, groups, className = '', title, align = 'left', inline = false }: Props) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(-1) // 键盘高亮的扁平索引
  const root = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const flat = groups.flatMap((g) => g.options)
  const current = flat.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    setFocus(flat.findIndex((o) => o.value === value))
    menu.current?.querySelector<HTMLElement>('.dd-opt.on')?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (o: DdOption) => {
    if (o.disabled) return
    setOpen(false)
    if (o.value !== value) onChange(o.value)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    const step = (d: number) => {
      let i = focus
      for (let n = 0; n < flat.length; n++) {
        i = (i + d + flat.length) % flat.length
        if (!flat[i].disabled) break
      }
      setFocus(i)
      menu.current?.querySelectorAll<HTMLElement>('.dd-opt')[i]?.scrollIntoView({ block: 'nearest' })
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        step(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        step(-1)
        break
      case 'Home':
        e.preventDefault()
        setFocus(0)
        break
      case 'End':
        e.preventDefault()
        setFocus(flat.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (flat[focus]) pick(flat[focus])
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  let idx = -1
  return (
    <span ref={root} className={`dd ${className}${open ? ' open' : ''}`} title={title} onKeyDown={onKey}>
      <button type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="dd-label">{current?.label ?? value}</span>
        <span className="dd-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div ref={menu} className={`dd-menu ${align}${inline ? ' inline' : ''}`} role="listbox">
          {groups.map((g, gi) => (
            <div key={gi} className={'dd-group' + (inline && g.label ? ' inline' : '')}>
              {g.label && <div className="dd-gl">{g.label}</div>}
              {g.options.map((o) => {
                idx += 1
                const i = idx
                return (
                  <div
                    key={o.value}
                    role="option"
                    aria-selected={o.value === value}
                    className={'dd-opt' + (o.value === value ? ' on' : '') + (i === focus ? ' focus' : '') + (o.disabled ? ' disabled' : '')}
                    title={o.title}
                    onMouseEnter={() => setFocus(i)}
                    onClick={() => pick(o)}
                  >
                    {o.label}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
