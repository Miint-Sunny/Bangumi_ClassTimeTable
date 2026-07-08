import { useState } from 'react'
import type { Settings } from '../types'
import { clearApiCache } from '../lib/api'

interface Props {
  settings: Settings
  friendErrors: Record<string, string>
  onChange: (patch: Partial<Settings>) => void
  onExportIcs: () => void
  onClose: () => void
}

export default function SettingsPanel({ settings, friendErrors, onChange, onExportIcs, onClose }: Props) {
  const [name, setName] = useState('')

  const addFriend = () => {
    const n = name.trim()
    if (!n || settings.friends.includes(n)) return
    onChange({ friends: [...settings.friends, n] })
    setName('')
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 style={{ margin: '0 0 10px', fontWeight: 'normal', fontSize: 16, color: 'var(--pink-strong)' }}>设置</h2>

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
