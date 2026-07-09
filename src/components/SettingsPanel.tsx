import { useRef, useState } from 'react'
import type { BgmAccount, Settings } from '../types'
import { clearApiCache } from '../lib/api'
import { loadPersisted } from '../lib/store'
import type { OauthConf } from '../lib/oauth'

interface Props {
  settings: Settings
  friendErrors: Record<string, string>
  account: BgmAccount | null
  sync: { msg: string; busy: boolean }
  oauth: OauthConf | null
  onOauthLogin: () => void
  onLogin: (token: string) => Promise<void>
  onLogout: () => void
  onSyncNow: () => void
  onChange: (patch: Partial<Settings>) => void
  onExportIcs: () => void
  onClose: () => void
}

export default function SettingsPanel({
  settings,
  friendErrors,
  account,
  sync,
  oauth,
  onOauthLogin,
  onLogin,
  onLogout,
  onSyncNow,
  onChange,
  onExportIcs,
  onClose,
}: Props) {
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [loginErr, setLoginErr] = useState('')

  const addFriend = () => {
    const n = name.trim()
    if (!n || settings.friends.includes(n)) return
    onChange({ friends: [...settings.friends, n] })
    setName('')
  }

  const doLogin = async () => {
    const t = token.trim()
    if (!t || verifying) return
    setVerifying(true)
    setLoginErr('')
    try {
      await onLogin(t)
      setToken('')
    } catch (e) {
      setLoginErr(
        e instanceof Error && e.message.includes('401') ? '令牌无效或已过期' : '验证失败,请检查网络后重试',
      )
    } finally {
      setVerifying(false)
    }
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
          <span className="lbl">Bangumi</span>
          {account && !account.invalid ? (
            <span className="bgm-acc">
              {account.avatar && <img src={account.avatar} alt="" />}
              <b>{account.nickname}</b>
              <span className="dim">@{account.username}</span>
              <button className="iconbtn" disabled={sync.busy} onClick={onSyncNow}>
                {sync.busy ? '同步中…' : '↻ 立即同步'}
              </button>
              <button className="iconbtn" onClick={onLogout}>
                断开
              </button>
            </span>
          ) : (
            <span className="friend-add">
              {oauth && (
                <>
                  <button className="iconbtn accent" onClick={onOauthLogin}>
                    用 Bangumi 登录
                  </button>
                  <span className="or">或</span>
                </>
              )}
              <input
                type="password"
                value={token}
                placeholder="粘贴访问令牌(token)"
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
              />
              <button className="iconbtn" disabled={verifying || !token.trim()} onClick={doLogin}>
                {verifying ? '验证中…' : '连接'}
              </button>
            </span>
          )}
        </div>
        {account?.invalid && (
          <div className="set-sub err">
            {account.kind === 'oauth' ? '登录已过期,请重新登录。' : '令牌已失效或被吊销,请生成新令牌后重新粘贴。'}
          </div>
        )}
        {loginErr && <div className="set-sub err">{loginErr}</div>}
        {account && !account.invalid && sync.msg && (
          <div className={`set-sub${sync.msg.includes('失败') ? ' err' : ''}`}>{sync.msg}</div>
        )}
        {!account && sync.msg.includes('登录失败') && <div className="set-sub err">{sync.msg}</div>}
        {!account && (
          <div className="set-sub">
            {oauth && <>「用 Bangumi 登录」跳转 bgm.tv 授权(需在 bgm.tv 域名下登录过),令牌 7 天有效、自动续期。 </>}
            也可在{' '}
            <a href="https://next.bgm.tv/demo/access-token" target="_blank" rel="noreferrer">
              next.bgm.tv/demo/access-token
            </a>{' '}
            生成个人令牌(建议选一年有效期)粘贴连接。令牌只保存在本机浏览器,不进备份文件,可随时吊销。
            连接后:应用内的追番改动即时写回 bgm.tv;bgm.tv 侧的改动每半小时拉取合并(以 bgm 为准)。
            首次连接会双向合并(状态本机优先、进度取较大值)。bgm 的「搁置」在课表按未追显示;
            本地取消追番不会删除 bgm 收藏。
          </div>
        )}

        <div className="set-row">
          <span className="lbl">主题</span>
          <span className="seg small">
            {(
              [
                ['bgm-dark', 'Bangumi深色'],
                ['dark', '深色'],
                ['contrast', '高对比深色'],
                ['light', '白色'],
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
            <button
              className={settings.lateNightCutoff > 0 ? 'on' : ''}
              onClick={() => settings.lateNightCutoff === 0 && onChange({ lateNightCutoff: 2 })}
            >
              凌晨归前日
            </button>
            <button
              className={settings.lateNightCutoff === 0 ? 'on' : ''}
              onClick={() => onChange({ lateNightCutoff: 0 })}
            >
              按实际日期
            </button>
          </span>
          {settings.lateNightCutoff > 0 && (
            <select
              className="cut-sel"
              title="几点之前算前一天的深夜档"
              value={settings.lateNightCutoff}
              onChange={(e) => onChange({ lateNightCutoff: +e.target.value })}
            >
              {[1, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>
                  {h}:00 前(表记到 {23 + h}:59)
                </option>
              ))}
            </select>
          )}
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
          每集精确时刻来自{' '}
          <a href="https://bgm.wiki" target="_blank" rel="noreferrer">
            番組維基 bgm.wiki
          </a>
          (经其开发者 API 每日同步,致谢其编辑者社区)·
          可选的 yuc.wiki 增强数据由 AI 辅助的 refresh-data skill 人工触发生成,不做自动抓取。
          <br />
          追番状态与进度保存在本机浏览器(localStorage);连接 Bangumi 账号(上方一键登录或个人令牌)后与
          bgm.tv 收藏双向同步。
          <br />
          好友进度读取的是对方在 bgm.tv 上公开的收藏,仅"在看"状态,缓存 1 小时。
        </div>
      </div>
    </div>
  )
}
