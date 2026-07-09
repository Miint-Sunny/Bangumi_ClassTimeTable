import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AirFix, BgmAccount, FriendsMap, Settings, Show, Tracking, WatchStatus } from './types'
import { fetchCalendar, fetchSubject, fetchUserWatching, type SubjectInfo } from './lib/api'
import {
  BgmAuthError,
  STATUS_TO_TYPE,
  clearPullCache,
  clearQueue,
  drainQueue,
  enqueuePush,
  loadAccount,
  mergeRemote,
  pullCollections,
  queuedIds,
  saveAccount,
  verifyToken,
} from './lib/bgm'
import { beginOauthLogin, completeOauthLogin, fetchOauthConf, refreshIfNeeded, type OauthConf } from './lib/oauth'
import { withViewTransition } from './lib/anim'
import { fetchBangumiData } from './lib/bangumiData'
import { buildShows, fetchEnhance } from './lib/merge'
import { behindCount } from './lib/progress'
import { currentSeason, displayTz, isCarryOver, partsInZone, seasonStartInstant } from './lib/time'
import { fetchSeasonList, fetchSeasonPack, fmtSeason, seasonMonthOf, seasonStartOf } from './lib/seasons'
import { buildIcs, downloadIcs } from './lib/ics'
import { loadPersisted, savePersisted } from './lib/store'
import WeekView from './components/WeekView'
import DayView from './components/DayView'
import MonthView, { type MonthCursor } from './components/MonthView'
import DetailModal from './components/DetailModal'
import SidePanel from './components/SidePanel'
import SettingsPanel from './components/SettingsPanel'

/** 视口宽度足够时,详情走右侧常驻面板而非弹窗 */
function useWideLayout(): boolean {
  const query = '(min-width: 1000px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setWide(window.matchMedia(query).matches)
    mq.addEventListener('change', fn)
    window.addEventListener('resize', fn) // 部分环境 MQL change 不触发,resize 兜底
    return () => {
      mq.removeEventListener('change', fn)
      window.removeEventListener('resize', fn)
    }
  }, [])
  return wide
}

type View = 'day' | 'week' | 'month'
type Filter = 'all' | 'mine' | 'watching' | 'wish' | 'new' | 'carry'

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: '全部' },
  { k: 'mine', label: '我的课表' },
  { k: 'watching', label: '在看' },
  { k: 'wish', label: '想看' },
  { k: 'new', label: '本季新番' },
  { k: 'carry', label: '上季续播' },
]

const THEMES: [Settings['theme'], string][] = [
  ['bgm-dark', 'Bangumi 深色'],
  ['dark', '深色'],
  ['contrast', '高对比深色'],
  ['light', '白色'],
]

export default function App() {
  const init = useRef(loadPersisted())
  const [settings, setSettings] = useState<Settings>(init.current.settings)
  const [tracking, setTracking] = useState<Tracking>(init.current.tracking)
  const [overrides, setOverrides] = useState<Record<number, AirFix>>(init.current.overrides)

  const [shows, setShows] = useState<Show[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [seasonSel, setSeasonSel] = useState<string>('live') // 'live' 或归档季 YYYYMM
  const [seasonList, setSeasonList] = useState<string[]>([])
  const [packs, setPacks] = useState<Record<string, Show[]>>({})
  const [view, setView] = useState<View>('week')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [dayCursor, setDayCursor] = useState(0) // 日/周/月游标提升到 App:迷你月历跳转 + 键盘翻页
  const [weekCursor, setWeekCursor] = useState(0)
  const [monthCursor, setMonthCursor] = useState<MonthCursor | null>(null) // null = 默认月
  const [showSettings, setShowSettings] = useState(false)
  const [friendsMap, setFriendsMap] = useState<FriendsMap>(new Map())
  const [friendErrors, setFriendErrors] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())
  const [account, setAccount] = useState<BgmAccount | null>(() => loadAccount())
  const [syncState, setSyncState] = useState<{ msg: string; busy: boolean }>({ msg: '', busy: false })
  const [oauthConf, setOauthConf] = useState<OauthConf | null>(null)
  const oauthRef = useRef<OauthConf | null>(null)

  // ── 持久化 & 主题 ──────────────────────────────────────────────
  useEffect(() => {
    savePersisted({ settings, tracking, overrides })
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings, tracking, overrides])

  // 主题切换时给全站颜色一个短暂的渐变窗口(首次挂载不做,避免开屏闪变)
  const themeAnimReady = useRef(false)
  useEffect(() => {
    if (!themeAnimReady.current) {
      themeAnimReady.current = true
      return
    }
    const el = document.documentElement
    el.setAttribute('data-theme-anim', '')
    const t = window.setTimeout(() => el.removeAttribute('data-theme-anim'), 300)
    return () => {
      window.clearTimeout(t)
      el.removeAttribute('data-theme-anim')
    }
  }, [settings.theme])

  // ── Bangumi 账号:令牌登录 + 双向同步 ───────────────────────────
  const accountRef = useRef(account)
  const trackingRef = useRef(tracking)
  useEffect(() => {
    accountRef.current = account
    saveAccount(account)
  }, [account])
  useEffect(() => {
    trackingRef.current = tracking
  }, [tracking])

  /** OAuth 令牌到期前静默续期;续不回来 → 标记失效。个人令牌原样通过。 */
  const ensureFresh = useCallback(async (): Promise<BgmAccount | null> => {
    const acc = accountRef.current
    if (!acc || acc.invalid) return null
    const fresh = await refreshIfNeeded(oauthRef.current, acc)
    if (!fresh) {
      setAccount({ ...acc, invalid: true })
      setSyncState({ msg: '登录已过期,请重新登录', busy: false })
      return null
    }
    if (fresh !== acc) {
      accountRef.current = fresh // setAccount 的 effect 是异步的,先手动同步 ref
      setAccount(fresh)
    }
    return fresh
  }, [])

  const drainTimer = useRef<number | null>(null)
  const drainNow = useCallback(async () => {
    const acc = await ensureFresh()
    if (!acc) return
    try {
      await drainQueue(acc)
    } catch (e) {
      if (e instanceof BgmAuthError) setAccount((a) => (a ? { ...a, invalid: true } : a))
    }
  }, [ensureFresh])
  const scheduleDrain = useCallback(() => {
    if (drainTimer.current) window.clearTimeout(drainTimer.current)
    drainTimer.current = window.setTimeout(drainNow, 1500)
  }, [drainNow])

  const syncingRef = useRef(false)
  const doSync = useCallback(async (force = false) => {
    if (syncingRef.current) return
    syncingRef.current = true
    const acc = await ensureFresh()
    if (!acc) {
      syncingRef.current = false
      return
    }
    setSyncState((s) => ({ ...s, busy: true }))
    try {
      if (acc.mergedOnce) await drainQueue(acc) // 先推后拉,拉到的就包含本机改动
      const remote = await pullCollections(acc, force)
      const { tracking: merged, pushes } = mergeRemote(trackingRef.current, remote, !acc.mergedOnce, queuedIds())
      setTracking(merged)
      const pushIds = Object.keys(pushes)
      for (const id of pushIds) enqueuePush(Number(id), pushes[Number(id)])
      if (pushIds.length) await drainQueue(acc)
      if (!acc.mergedOnce) setAccount((a) => (a ? { ...a, mergedOnce: true } : a))
      const t = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      setSyncState({ msg: `已同步 ${t}${pushIds.length ? ` · 推回 ${pushIds.length} 条` : ''}`, busy: false })
    } catch (e) {
      if (e instanceof BgmAuthError) {
        setAccount((a) => (a ? { ...a, invalid: true } : a))
        setSyncState({ msg: '令牌已失效,请重新连接', busy: false })
      } else {
        setSyncState({ msg: `同步失败:${e instanceof Error ? e.message : e}`, busy: false })
      }
    } finally {
      syncingRef.current = false
    }
  }, [ensureFresh])

  useEffect(() => {
    if (!account?.token || account.invalid) return
    doSync()
    const id = window.setInterval(() => doSync(), 30 * 60_000) // 拉取本身有 1h 缓存,间隔只是兜底
    return () => window.clearInterval(id)
  }, [account?.token, account?.invalid, doSync])

  const bgmLogin = useCallback(async (token: string) => {
    const me = await verifyToken(token.trim()) // 失败抛错,由设置页展示
    setAccount({ token: token.trim(), ...me, mergedOnce: false })
  }, [])

  const bgmLogout = useCallback(() => {
    const acc = accountRef.current
    if (acc) clearPullCache(acc.username)
    clearQueue()
    setAccount(null) // 本机追番记录保留
    setSyncState({ msg: '', busy: false })
  }, [])

  // OAuth(可选):读站点根目录 oauth.json;URL 带 ?code= 时完成一键登录
  useEffect(() => {
    let alive = true
    ;(async () => {
      const conf = await fetchOauthConf()
      if (!alive) return
      oauthRef.current = conf
      setOauthConf(conf)
      if (!conf) return
      try {
        const acc = await completeOauthLogin(conf)
        if (acc && alive) setAccount(acc) // 触发首次双向合并
      } catch (e) {
        if (!alive) return
        setSyncState({ msg: `Bangumi 登录失败:${e instanceof Error ? e.message : e}`, busy: false })
        setShowSettings(true) // 让错误立刻可见
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const oauthLogin = useCallback(() => {
    if (oauthRef.current) beginOauthLogin(oauthRef.current)
  }, [])

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
    fetchSeasonList().then((list) => alive && setSeasonList(list))
    return () => {
      alive = false
    }
  }, [])

  // ── 归档季数据包(静态文件,按需加载) ────────────────────────────
  useEffect(() => {
    if (seasonSel === 'live' || packs[seasonSel]) return
    let alive = true
    fetchSeasonPack(seasonSel)
      .then((list) => alive && setPacks((p) => ({ ...p, [seasonSel]: list })))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [seasonSel, packs])

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

  // ── 当季实时 / 归档数据包二选一,再叠加本机放送校正 ─────────────
  const archive = seasonSel !== 'live'
  const season = currentSeason(now)
  const seasonStart = archive ? seasonStartOf(seasonSel) : seasonStartInstant(now)
  const baseShows = archive ? (packs[seasonSel] ?? null) : shows

  const effShows = useMemo(
    () => (baseShows ? baseShows.map((s) => (overrides[s.id] ? { ...s, airFix: overrides[s.id] } : s)) : null),
    [baseShows, overrides],
  )

  const setOverride = useCallback((id: number, fix: AirFix | null) => {
    setOverrides((o) => {
      const next = { ...o }
      if (fix === null) delete next[id]
      else next[id] = fix
      return next
    })
  }, [])

  // ── 过滤 ───────────────────────────────────────────────────────
  const visibleShows = useMemo(() => {
    if (!effShows) return []
    const q = query.trim().toLowerCase()
    return effShows.filter((s) => {
      const st = tracking.status[s.id]
      if (filter === 'mine' && st !== 'watching' && st !== 'wish') return false
      if (filter === 'watching' && st !== 'watching') return false
      if (filter === 'wish' && st !== 'wish') return false
      if (filter === 'new' && isCarryOver(s, seasonStart)) return false
      if (filter === 'carry' && !isCarryOver(s, seasonStart)) return false
      if (q) {
        const hay = `${s.nameCn} ${s.nameJp} ${(s.tags ?? []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [effShows, filter, query, tracking.status, seasonStart])

  const stats = useMemo(() => {
    if (!effShows) return null
    // 只数本季在播的(账号同步后 tracking 会含跨季收藏,不能全量数)
    const watching = effShows.filter((s) => tracking.status[s.id] === 'watching').length
    const behindTotal = effShows.reduce((acc, s) => acc + behindCount(s, tracking, now), 0)
    return { total: effShows.length, watching, behindTotal }
  }, [effShows, tracking, now])

  const setStatus = useCallback(
    (id: number, s: WatchStatus | null) => {
      setTracking((t) => {
        const status = { ...t.status }
        if (s === null) delete status[id]
        else status[id] = s
        return { ...t, status }
      })
      // bgm API 无"删除收藏",本地取消追番不回写
      const acc = accountRef.current
      if (acc && !acc.invalid && s !== null) {
        enqueuePush(id, { type: STATUS_TO_TYPE[s] })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const setWatched = useCallback(
    (id: number, n: number) => {
      setTracking((t) => ({ ...t, watched: { ...t.watched, [id]: n } }))
      const acc = accountRef.current
      if (acc && !acc.invalid) {
        const st = trackingRef.current.status[id] ?? 'watching' // 改进度即视为在看
        enqueuePush(id, { type: STATUS_TO_TYPE[st], ep: n })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const setRate = useCallback(
    (id: number, rate: number) => {
      setTracking((t) => {
        const rates = { ...t.rates }
        if (rate === 0) delete rates[id]
        else rates[id] = rate
        return { ...t, rates }
      })
      const acc = accountRef.current
      const st = trackingRef.current.status[id]
      // bgm 的评分挂在收藏上:未收藏只存本机,不回写
      if (acc && !acc.invalid && st) {
        enqueuePush(id, { type: STATUS_TO_TYPE[st], rate })
        scheduleDrain()
      }
    },
    [scheduleDrain],
  )

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const exportIcs = useCallback(() => {
    if (effShows) downloadIcs(buildIcs(effShows, tracking, Date.now()))
  }, [effShows, tracking])

  const wide = useWideLayout()
  const openShow = openId !== null && effShows ? (effShows.find((s) => s.id === openId) ?? null) : null
  const effView: View = archive && view === 'day' ? 'week' : view

  // 点卡片打开详情;侧栏收起时自动展开
  const openDetail = useCallback(
    (id: number) => {
      setOpenId(id)
      setSettings((s) => (s.panelOpen ? s : { ...s, panelOpen: true }))
    },
    [],
  )
  const jumpToDay = useCallback((offset: number) => {
    withViewTransition(() => {
      setDayCursor(offset)
      setView('day')
    })
  }, [])

  // 视图/翻页/换季一律走交叉淡化(不支持时瞬时切换)
  const changeView = useCallback((v: View) => withViewTransition(() => setView(v)), [])
  const pageDay = useCallback((o: number) => withViewTransition(() => setDayCursor(o)), [])
  const pageWeek = useCallback((o: number) => withViewTransition(() => setWeekCursor(o)), [])
  const pageMonthTo = useCallback((c: MonthCursor | null) => withViewTransition(() => setMonthCursor(c)), [])

  // 点详情页的题材标签 → 搜索该标签(搜索本就匹配标签)
  const searchTag = useCallback(
    (t: string) => {
      setQuery(t)
      if (!wide) setOpenId(null)
    },
    [wide],
  )

  // 换季时游标复位
  useEffect(() => {
    setDayCursor(0)
    setWeekCursor(0)
    setMonthCursor(null)
  }, [seasonSel])

  const defaultMonth: MonthCursor = useMemo(() => {
    if (archive) return seasonMonthOf(seasonSel)
    const p = partsInZone(now, displayTz(settings))
    return { y: p.y, mo: p.mo }
  }, [archive, seasonSel, now, settings])
  const effMonthCursor = monthCursor ?? defaultMonth

  // 键盘快捷键:←/→ 翻页,Home 回到今天/本周/本月,D/W/M 切视图
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const pageMonth = (d: number) => {
        const idx = effMonthCursor.y * 12 + (effMonthCursor.mo - 1) + d
        pageMonthTo({ y: Math.floor(idx / 12), mo: (idx % 12) + 1 })
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          const d = e.key === 'ArrowLeft' ? -1 : 1
          if (effView === 'day') withViewTransition(() => setDayCursor((c) => c + d))
          else if (effView === 'week') withViewTransition(() => setWeekCursor((c) => c + d))
          else pageMonth(d)
          e.preventDefault()
          break
        }
        case 'Home':
          if (effView === 'day') pageDay(0)
          else if (effView === 'week') pageWeek(0)
          else pageMonthTo(null)
          e.preventDefault()
          break
        case 'd':
        case 'D':
          if (!archive) changeView('day')
          break
        case 'w':
        case 'W':
          changeView('week')
          break
        case 'm':
        case 'M':
          changeView('month')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [effView, archive, effMonthCursor, changeView, pageDay, pageWeek, pageMonthTo])

  const panelW = effView === 'day' ? settings.panelWidthDay : settings.panelWidth
  const viewProps = { tracking, settings, now, seasonStart, archive, friendsMap, onOpen: openDetail }

  return (
    <div className="container">
      <header className="site-header">
        <h1>
          番组课表
          <select
            className="season-sel"
            value={seasonSel}
            onChange={(e) => {
              const v = e.target.value
              withViewTransition(() => setSeasonSel(v))
            }}
            title="切换季度"
          >
            <option value="live">{season.label}(当季)</option>
            {seasonList
              .filter((s) => s !== season.yyyymm)
              .map((s) => (
                <option key={s} value={s}>
                  {fmtSeason(s)}
                </option>
              ))}
          </select>
        </h1>
        {stats && (
          <span className="stats">
            {archive ? '该季收录' : '本季在播'} <b>{stats.total}</b> 部 · 在看 <b>{stats.watching}</b> 部
            {stats.behindTotal > 0 && (
              <>
                {' '}
                <span className="behind-total">欠了 {stats.behindTotal} 集没看</span>
              </>
            )}
          </span>
        )}
        <span className="spacer" />
        <span className="domains" title="Bangumi 各域名登录互不相通,选常用的">
          {['bgm.tv', 'bangumi.tv', 'chii.in'].map((d) => (
            <a key={d} href={`https://${d}`} target="_blank" rel="noreferrer">
              {d}
            </a>
          ))}
        </span>
        <select
          className="season-sel theme-sel"
          title="色彩模式"
          value={settings.theme}
          onChange={(e) => patchSettings({ theme: e.target.value as Settings['theme'] })}
        >
          {THEMES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button className="iconbtn" onClick={() => setShowSettings(true)}>
          ⚙ 设置
        </button>
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
            <button
              key={k}
              className={effView === k ? 'on' : ''}
              disabled={archive && k === 'day'}
              title={archive && k === 'day' ? '日视图仅当季可用' : undefined}
              onClick={() => changeView(k)}
            >
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
          type="search"
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
        {wide && (
          <button
            className="iconbtn"
            title={settings.panelOpen ? '收起侧栏' : '展开侧栏'}
            onClick={() => patchSettings({ panelOpen: !settings.panelOpen })}
          >
            {settings.panelOpen ? '⇥' : '⇤'}
          </button>
        )}
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
      ) : effShows === null ? (
        <div className="loading">{archive ? `正在加载 ${fmtSeason(seasonSel)} 归档…` : '正在拉取本季放送表…'}</div>
      ) : (
        <div className="content-row">
          <div className="view-area">
            {effView === 'week' && (
              <WeekView
                key={seasonSel}
                shows={visibleShows}
                weekOffset={weekCursor}
                onWeekOffset={pageWeek}
                {...viewProps}
              />
            )}
            {effView === 'day' && (
              <DayView
                key={seasonSel}
                shows={visibleShows}
                dayOffset={dayCursor}
                onDayOffset={pageDay}
                {...viewProps}
              />
            )}
            {effView === 'month' && (
              <MonthView
                key={seasonSel}
                shows={visibleShows}
                cursor={effMonthCursor}
                resetTo={defaultMonth}
                onCursor={pageMonthTo}
                {...viewProps}
              />
            )}
          </div>
          {wide && settings.panelOpen && (
            <SidePanel
              openShow={openShow}
              shows={effShows}
              tracking={tracking}
              settings={settings}
              now={now}
              seasonStart={seasonStart}
              archive={archive}
              friendsMap={friendsMap}
              hasLocalOverride={openShow ? openShow.id in overrides : false}
              tz={displayTz(settings)}
              width={panelW}
              view={effView}
              dayCursor={dayCursor}
              onResizeEnd={(w) =>
                w === null
                  ? patchSettings({ panelOpen: false })
                  : patchSettings(effView === 'day' ? { panelWidthDay: w } : { panelWidth: w })
              }
              onJumpDay={jumpToDay}
              onTag={searchTag}
              onOpen={openDetail}
              onSetStatus={setStatus}
              onSetWatched={setWatched}
              onSetRate={setRate}
              onSetOverride={setOverride}
              onSubjectInfo={applySubjectInfo}
              onClose={() => setOpenId(null)}
            />
          )}
        </div>
      )}

      {!wide && openShow && (
        <DetailModal
          show={openShow}
          tracking={tracking}
          settings={settings}
          now={now}
          seasonStart={seasonStart}
          friendsMap={friendsMap}
          hasLocalOverride={openShow.id in overrides}
          onSetStatus={setStatus}
          onSetWatched={setWatched}
          onSetRate={setRate}
          onSetOverride={setOverride}
          onSubjectInfo={applySubjectInfo}
          onTag={searchTag}
          onClose={() => setOpenId(null)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          friendErrors={friendErrors}
          account={account}
          sync={syncState}
          oauth={oauthConf}
          onOauthLogin={oauthLogin}
          onLogin={bgmLogin}
          onLogout={bgmLogout}
          onSyncNow={() => doSync(true)}
          onChange={patchSettings}
          onExportIcs={exportIcs}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
