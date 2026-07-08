import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FriendsMap, Settings, Show, Tracking, WatchStatus } from './types'
import { fetchCalendar, fetchSubject, fetchUserWatching, type SubjectInfo } from './lib/api'
import { fetchBangumiData } from './lib/bangumiData'
import { buildShows, fetchEnhance } from './lib/merge'
import { behindCount } from './lib/progress'
import { currentSeason } from './lib/time'
import { buildIcs, downloadIcs } from './lib/ics'
import { loadPersisted, savePersisted } from './lib/store'
import WeekView from './components/WeekView'
import DayView from './components/DayView'
import MonthView from './components/MonthView'
import DetailModal from './components/DetailModal'
import SettingsPanel from './components/SettingsPanel'

type View = 'day' | 'week' | 'month'
type Filter = 'all' | 'mine' | 'watching' | 'wish'

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: '全部' },
  { k: 'mine', label: '我的课表' },
  { k: 'watching', label: '在看' },
  { k: 'wish', label: '想看' },
]

export default function App() {
  const init = useRef(loadPersisted())
  const [settings, setSettings] = useState<Settings>(init.current.settings)
  const [tracking, setTracking] = useState<Tracking>(init.current.tracking)

  const [shows, setShows] = useState<Show[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<View>('week')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [friendsMap, setFriendsMap] = useState<FriendsMap>(new Map())
  const [friendErrors, setFriendErrors] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())

  // ── 持久化 & 主题 ──────────────────────────────────────────────
  useEffect(() => {
    savePersisted({ settings, tracking })
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings, tracking])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── 数据加载:calendar × bangumi-data × yuc 增强 ────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cal, bd, enh] = await Promise.all([fetchCalendar(), fetchBangumiData(), fetchEnhance()])
        if (!alive) return
        setShows(buildShows(cal, bd, enh, Date.now()))
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ── 背景补全:在追的番 + 流媒体番,懒拉集数/封面(有 7 天缓存) ──
  const enriched = useRef(new Set<number>())
  useEffect(() => {
    if (!shows) return
    const targets = shows
      .filter((s) => {
        const tracked = tracking.status[s.id] === 'watching' || tracking.status[s.id] === 'wish'
        return (tracked || !s.fromCalendar) && (!s.epsTotal || !s.image) && !enriched.current.has(s.id)
      })
      .slice(0, 40)
    if (targets.length === 0) return
    let alive = true
    ;(async () => {
      for (const t of targets) {
        enriched.current.add(t.id)
        try {
          const info = await fetchSubject(t.id)
          if (!alive) return
          applySubjectInfo(info)
        } catch {}
        await new Promise((r) => setTimeout(r, 120))
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows === null, tracking.status])

  const applySubjectInfo = useCallback((info: SubjectInfo) => {
    setShows((prev) =>
      prev
        ? prev.map((s) =>
            s.id === info.id
              ? {
                  ...s,
                  epsTotal: s.epsTotal ?? info.eps,
                  image: s.image ?? info.image,
                  score: s.score ?? info.score,
                  rank: s.rank ?? info.rank,
                }
              : s,
          )
        : prev,
    )
  }, [])

  // ── 好友进度 ───────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    if (settings.friends.length === 0) {
      setFriendsMap(new Map())
      return
    }
    ;(async () => {
      const map: FriendsMap = new Map()
      const errs: Record<string, string> = {}
      for (const user of settings.friends) {
        try {
          const cols = await fetchUserWatching(user)
          for (const c of cols) {
            let m = map.get(c.subjectId)
            if (!m) {
              m = new Map()
              map.set(c.subjectId, m)
            }
            m.set(user, { ep: c.ep, updatedAt: c.updatedAt })
          }
        } catch (e) {
          errs[user] = e instanceof Error && e.message.includes('404') ? '用户不存在或收藏不公开' : '拉取失败'
        }
        if (!alive) return
      }
      if (alive) {
        setFriendsMap(map)
        setFriendErrors(errs)
      }
    })()
    return () => {
      alive = false
    }
  }, [settings.friends])

  // ── 过滤 ───────────────────────────────────────────────────────
  const visibleShows = useMemo(() => {
    if (!shows) return []
    const q = query.trim().toLowerCase()
    return shows.filter((s) => {
      const st = tracking.status[s.id]
      if (filter === 'mine' && st !== 'watching' && st !== 'wish') return false
      if (filter === 'watching' && st !== 'watching') return false
      if (filter === 'wish' && st !== 'wish') return false
      if (q) {
        const hay = `${s.nameCn} ${s.nameJp} ${(s.tags ?? []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [shows, filter, query, tracking.status])

  const stats = useMemo(() => {
    if (!shows) return null
    const watching = Object.values(tracking.status).filter((s) => s === 'watching').length
    const behindTotal = shows.reduce((acc, s) => acc + behindCount(s, tracking, now), 0)
    return { total: shows.length, watching, behindTotal }
  }, [shows, tracking, now])

  const setStatus = useCallback((id: number, s: WatchStatus | null) => {
    setTracking((t) => {
      const status = { ...t.status }
      if (s === null) delete status[id]
      else status[id] = s
      return { ...t, status }
    })
  }, [])

  const setWatched = useCallback((id: number, n: number) => {
    setTracking((t) => ({ ...t, watched: { ...t.watched, [id]: n } }))
  }, [])

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const exportIcs = useCallback(() => {
    if (shows) downloadIcs(buildIcs(shows, tracking, Date.now()))
  }, [shows, tracking])

  const season = currentSeason(now)
  const openShow = openId !== null && shows ? (shows.find((s) => s.id === openId) ?? null) : null
  const viewProps = { tracking, settings, now, friendsMap, onOpen: setOpenId }

  return (
    <div className="container">
      <header className="site-header">
        <h1>
          番组课表<small>{season.label} · Anime Timetable</small>
        </h1>
        {stats && (
          <span className="stats">
            本季在播 <b>{stats.total}</b> 部 · 在看 <b>{stats.watching}</b> 部
            {stats.behindTotal > 0 && (
              <>
                {' '}
                <span className="behind-total">欠了 {stats.behindTotal} 集没看</span>
              </>
            )}
          </span>
        )}
        <span className="spacer" />
        <a href="https://bgm.tv" target="_blank" rel="noreferrer">
          bgm.tv
        </a>
      </header>

      <div className="toolbar">
        <span className="seg">
          {(
            [
              ['day', '日'],
              ['week', '周'],
              ['month', '月'],
            ] as [View, string][]
          ).map(([k, label]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </span>

        {FILTERS.map((f) => (
          <button key={f.k} className={`chip${filter === f.k ? ' on' : ''}`} onClick={() => setFilter(f.k)}>
            {f.label}
          </button>
        ))}

        <input
          className="search"
          placeholder="搜索标题 / 标签…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <span className="spacer" style={{ flex: 1 }} />

        <span className="seg small" title="时区">
          <button className={settings.tzMode === 'local' ? 'on' : ''} onClick={() => patchSettings({ tzMode: 'local' })}>
            本地时间
          </button>
          <button className={settings.tzMode === 'jst' ? 'on' : ''} onClick={() => patchSettings({ tzMode: 'jst' })}>
            日本时间
          </button>
        </span>
        <button
          className="iconbtn"
          title="切换主题"
          onClick={() => patchSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? '☀' : '🌙'}
        </button>
        <button className="iconbtn" onClick={() => setShowSettings(true)}>
          ⚙ 设置
        </button>
      </div>

      {loadError ? (
        <div className="error-box">
          数据加载失败:{loadError}
          <br />
          请检查网络后
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              location.reload()
            }}
          >
            重试
          </a>
        </div>
      ) : shows === null ? (
        <div className="loading">正在拉取本季放送表…</div>
      ) : (
        <>
          {view === 'week' && <WeekView shows={visibleShows} {...viewProps} />}
          {view === 'day' && <DayView shows={visibleShows} {...viewProps} />}
          {view === 'month' && <MonthView shows={visibleShows} {...viewProps} />}
        </>
      )}

      {openShow && (
        <DetailModal
          show={openShow}
          tracking={tracking}
          settings={settings}
          now={now}
          friendsMap={friendsMap}
          onSetStatus={setStatus}
          onSetWatched={setWatched}
          onSubjectInfo={applySubjectInfo}
          onClose={() => setOpenId(null)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          friendErrors={friendErrors}
          onChange={patchSettings}
          onExportIcs={exportIcs}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
