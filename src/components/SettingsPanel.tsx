import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { clearApiCache } from '../lib/api'
import { loadPersisted } from '../lib/store'

interface Props {
  settings: Settings
  friendErrors: Record<string, string>
  onChange: (patch: Partial<Settings>) => void
  onExportIcs: () => void
  onClose: () => void
}

export default function SettingsPanel({ settings, friendErrors, onChange, onExportIcs, onClose }: Props) {
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addFriend = () => {
    const n = name.trim()
    if (!n || settings.friends.includes(n)) return
    onChange({ friends: [...settings.friends, n] })
    setName('')
  }

  // 追番数据备份:localStorage 是唯一存储,换浏览器/清缓存前先导出
  const exportBackup = () => {
    const payload = { app: 'bangumi-timetable', version: 1, exportedAt: new Date().toISOString(), data: loadPersisted() }
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date()
    a.download = `bangumi-timetable-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importBackup = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text())
      const data = raw?.data ?? raw // 兼容裸 Persisted 格式
      if (!data?.tracking || !data?.settings) throw new Error('不是有效的备份文件')
      const n = Object.keys(data.tracking.status ?? {}).length
      if (!window.confirm(`导入将覆盖本机的追番记录与设置(备份含 ${n} 部追番状态),确定?`)) return
      localStorage.setItem('btt:v1', JSON.stringify(data))
      location.reload()
    } catch (e) {
      window.alert(`导入失败:${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 style={{ margin: '0 0 10px', fontWeight: 'normal', fontSize: 16, color: 'var(--pink-strong)' }}>设置</h2>

        <div className="set-row">
          <span className="lbl">主题</span>
          <span className="seg small">
            {(
              [
                ['dark', '深色'],
                ['light', '浅色'],
                ['contrast', '高对比'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={settings.theme === k ? 'on' : ''} onClick={() => onChange({ theme: k })}>
                {label}
              </button>
            ))}
          </span>
        </div>

        <div className="set-row">
          <span className="lbl">周起始</span>
          <span className="seg small">
            <button className={settings.weekStart === 1 ? 'on' : ''} onClick={() => onChange({ weekStart: 1 })}>
              周一
            </button>
            <button className={settings.weekStart === 7 ? 'on' : ''} onClick={() => onChange({ weekStart: 7 })}>
              周日
            </button>
          </span>
        </div>

        <div className="set-row">
          <span className="lbl">深夜表记</span>
          <span className="seg small">
            <button className={settings.lateNight ? 'on' : ''} onClick={() => onChange({ lateNight: true })}>
              25:30 归前日
            </button>
            <button className={!settings.lateNight ? 'on' : ''} onClick={() => onChange({ lateNight: false })}>
              按实际日期
            </button>
          </span>
        </div>

        <div className="set-row">
          <span className="lbl">好友</span>
          <span className="friend-add">
            <input
              value={name}
              placeholder="bgm 用户名(个人页 URL 尾段)"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            />
            <button className="iconbtn" onClick={addFriend}>
              添加
            </button>
          </span>
        </div>
        {settings.friends.map((f) => (
          <div key={f} className="friend-item">
            <button className="rm" onClick={() => onChange({ friends: settings.friends.filter((x) => x !== f) })}>
              ✕
            </button>
            <span>{f}</span>
            {friendErrors[f] && <span className="err">{friendErrors[f]}</span>}
          </div>
        ))}

        <div className="set-row" style={{ marginTop: 16 }}>
          <span className="lbl">导出</span>
          <button className="iconbtn" onClick={onExportIcs}>
            📅 导出我的追番日历(.ics)
          </button>
        </div>

        <div className="set-row">
          <span className="lbl">备份</span>
          <button className="iconbtn" onClick={exportBackup}>
            ⤓ 导出追番数据
          </button>
          <button className="iconbtn" onClick={() => fileRef.current?.click()}>
            ⤒ 导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importBackup(f)
              e.target.value = ''
            }}
          />
        </div>

        <div className="set-row">
          <span className="lbl">数据</span>
          <button
            className="iconbtn"
            onClick={() => {
              clearApiCache()
              location.reload()
            }}
          >
            清缓存并刷新
          </button>
        </div>

        <div className="set-note">
          数据来源:Bangumi 官方 API(每 6 小时缓存)· bangumi-data 数据集(jsDelivr CDN,每日缓存)·
          可选的 yuc.wiki 增强数据由 AI 辅助的 refresh-data skill 人工触发生成,不做自动抓取。
          <br />
          追番状态与进度目前保存在本机浏览器(localStorage),Bangumi OAuth 云同步在路线图上。
          <br />
          好友进度读取的是对方在 bgm.tv 上公开的收藏,仅"在看"状态,缓存 1 小时。
        </div>
      </div>
    </div>
  )
}
