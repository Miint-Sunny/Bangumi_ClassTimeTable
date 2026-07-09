import { useEffect } from 'react'
import { getLang, t, type Lang } from '../lib/i18n'

const REPO = 'https://github.com/Miint-Sunny/Bangumi_ClassTimeTable'

/** 更新历史:面向用户的里程碑(按 commit 提炼),每条自带四语言 */
interface LogEntry {
  d: string // YYYY-MM-DD
  x: Record<Lang, string>
}

const CHANGELOG: LogEntry[] = [
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '筛选新增「产地」:日本/中国/其他地区/未知 四类(bgm 官方产地标注;拿不准的诚实标未知、每日复查,不误删)',
      'zh-Hant': '篩選新增「產地」:日本/中國/其他地區/未知 四類(bgm 官方產地標註;拿不準的誠實標未知、每日複查,不誤刪)',
      ja: '絞り込みに「制作国」を追加:日本/中国/その他/不明の4分類(bgm公式タグ準拠、不明な作品は無理に分類せず毎日再確認)',
      en: 'New "Region" filter: Japan / China / Other / Unknown (official bgm tags; uncertain shows stay honestly Unknown, rechecked daily)',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '修复:海外延迟放送混进每集时刻造成一天两集(光美/神之水滴);柯南、哆啦A梦等长寿番的档期不再落错星期',
      'zh-Hant': '修復:海外延遲放送混進每集時刻造成一天兩集(光美/神之水滴);柯南、哆啦A夢等長壽番的檔期不再落錯星期',
      ja: '修正:海外の遅れ放送が混入し1日2話表示になる問題(プリキュア/神の雫)。コナン・ドラえもん等の長寿番組の曜日ズレも解消',
      en: 'Fix: overseas delayed broadcasts no longer duplicate episodes (PreCure/Kami no Shizuku); Conan, Doraemon & co. now sit on the right weekday',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '关于窗口与更新历史;界面四语言(简中/繁中/日本語/EN),番剧标题也随语言切换',
      'zh-Hant': '關於視窗與更新歷史;介面四語言(簡中/繁中/日本語/EN),番劇標題也隨語言切換',
      ja: 'このウィンドウと更新履歴を追加。UIが4言語対応、作品タイトルも言語に追従',
      en: 'About window & changelog; UI in 4 languages, show titles follow your language too',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '筛选面板:范围(新番/续播/长期)· 口碑(按人数加权)· 来源 · 题材',
      'zh-Hant': '篩選面板:範圍(新番/續播/長期)· 口碑(按人數加權)· 來源 · 題材',
      ja: '絞り込みパネル:範囲(新作/継続/長期)・評価(人数重み付け)・原作・ジャンル',
      en: 'Filter panel: scope (new/continuing/long-running) · vote-weighted rating · source · genre',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '修复:柯南/光美/小鲨鱼等长期档此前根本没进课表;跨季自动分级为续播/长期并垫色区分',
      'zh-Hant': '修復:柯南/光美/小鯊魚等長期檔此前根本沒進課表;跨季自動分級為續播/長期並墊色區分',
      ja: '修正:コナン・プリキュアなど長期枠が時間割に出ていなかった問題。継続/長期を自動判別し色分け',
      en: 'Fix: long-running shows (Conan, PreCure…) were missing entirely; cross-season shows now auto-classified & tinted',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '评分按评分人数贝叶斯加权:小样本高分不再霸榜,评分人数全站展示',
      'zh-Hant': '評分按評分人數貝葉斯加權:小樣本高分不再霸榜,評分人數全站展示',
      ja: '評価を人数でベイズ重み付け。少人数の高得点が上位を占めなくなり、評価人数も表示',
      en: 'Bayesian vote-weighted scores: tiny-sample 10.0s no longer top the charts; vote counts shown everywhere',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': 'bgm 式收藏面板:十星评分(官方文案)、标签、吐槽、仅自己可见,随收藏双向同步',
      'zh-Hant': 'bgm 式收藏面板:十星評分(官方文案)、標籤、吐槽、僅自己可見,隨收藏雙向同步',
      ja: 'bgm式の収蔵パネル:10段階評価・タグ・コメント・非公開設定。収蔵と双方向同期',
      en: 'bgm-style collection panel: 10-star rating, tags, comment, private flag — all two-way synced',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '动效体系:View Transitions 交叉淡化(不闪不残影)、iOS 式节奏、弹窗轻磨砂',
      'zh-Hant': '動效體系:View Transitions 交叉淡化(不閃不殘影)、iOS 式節奏、彈窗輕磨砂',
      ja: 'アニメーション刷新:View Transitionsのクロスフェード、iOS的なテンポ、ダイアログのすりガラス',
      en: 'Motion system: View Transitions crossfade (no flicker/ghosting), iOS-like timing, light glass dialogs',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '深夜表记支持自定义边界(默认 26:00),凌晨时段"今天"的归属跟随深夜日界',
      'zh-Hant': '深夜表記支援自訂邊界(預設 26:00),凌晨時段"今天"的歸屬跟隨深夜日界',
      ja: '深夜表記の境界をカスタム可能に(既定26:00)。深夜帯の「今日」の扱いも日界に追従',
      en: 'Customizable late-night cutoff (default 26:00); “today” follows the late-night day boundary',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': 'OAuth 一键登录上线;正式域名 bgmtimetable.com(站点与令牌代理同域)',
      'zh-Hant': 'OAuth 一鍵登入上線;正式網域 bgmtimetable.com(站點與權杖代理同域)',
      ja: 'OAuthワンクリックログイン。正式ドメイン bgmtimetable.com(サイトとトークンプロキシ同一ドメイン)',
      en: 'OAuth one-click sign-in; official domain bgmtimetable.com (site & token proxy share one origin)',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': 'Bangumi 账号双向同步:个人令牌登录,状态/进度即时写回,离线改动进队列不丢',
      'zh-Hant': 'Bangumi 帳號雙向同步:個人權杖登入,狀態/進度即時寫回,離線改動進佇列不丟',
      ja: 'Bangumiアカウント双方向同期:トークンでログイン、ステータス/進捗を即時反映。オフライン変更もキューで保持',
      en: 'Two-way Bangumi sync: token sign-in, instant status/progress write-back, offline queue',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': '接入番組維基(bgm.wiki)每集精确时刻:年番休播漂移、一举多话全都对得上,每日自动同步',
      'zh-Hant': '接入番組維基(bgm.wiki)每集精確時刻:年番休播漂移、一舉多話全都對得上,每日自動同步',
      ja: '番組維基(bgm.wiki)の話数別放送時刻を導入:年間アニメの休止ズレや一挙放送も正確に。毎日自動同期',
      en: 'Per-episode exact air times from bgm.wiki: year-long drift & multi-ep drops all accurate, synced daily',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': '右侧常驻面板(详情/补番清单/撞档/迷你月历)、键盘快捷键、点标签筛选、备份导入导出、PWA',
      'zh-Hant': '右側常駐面板(詳情/補番清單/撞檔/迷你月曆)、鍵盤快捷鍵、點標籤篩選、備份匯入匯出、PWA',
      ja: 'サイドパネル(詳細/積みリスト/かぶり/ミニカレンダー)、ショートカット、タグ絞り込み、バックアップ、PWA',
      en: 'Side panel (details/backlog/conflicts/mini calendar), keyboard shortcuts, tag filtering, backup, PWA',
    },
  },
  {
    d: '2026-07-08',
    x: {
      'zh-Hans': '站点建立:日/周/月三视图课表、追番进度、时区切换、放送校正模型、八季归档',
      'zh-Hant': '站點建立:日/週/月三檢視課表、追番進度、時區切換、放送校正模型、八季歸檔',
      ja: 'サイト公開:日/週/月の時間割ビュー、視聴進捗、タイムゾーン切替、放送補正モデル、8期分アーカイブ',
      en: 'Launch: day/week/month timetable views, progress tracking, time zones, air-time fix model, 8 archived seasons',
    },
  },
]

declare const __APP_VERSION__: string

export default function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lang = getLang()

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal about">
        <button className="close" onClick={onClose} aria-label={t('关闭')}>
          ×
        </button>

        <div className="about-head">
          <h2>{t('番组课表')}</h2>
          <div className="tagline">{t('像课表一样追番。')}</div>
          <div className="ver">
            {t('版本 {v}', { v: __APP_VERSION__ })} · bgmtimetable.com · {t('以 MIT 协议开源')}
          </div>
        </div>

        <div className="about-links">
          <a className="iconbtn" href={REPO} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            {t('GitHub 仓库')}
          </a>
          <a className="iconbtn" href={`${REPO}/issues/new`} target="_blank" rel="noreferrer" title={t('用得不顺、数据不对、想要新功能,都欢迎')}>
            {t('🐛 反馈问题')}
          </a>
        </div>

        <div className="set-note about-credit">
          {t('数据来自 Bangumi、bangumi-data、番組維基(bgm.wiki)与 yuc.wiki,感谢各社区的维护者。')}
        </div>

        <div className="dm-sec">
          <div className="sec-t">{t('更新历史')}</div>
          <div className="changelog">
            {CHANGELOG.map((e, i) => (
              <div key={i} className="cl-row">
                <span className="cl-date">{e.d}</span>
                <span className="cl-text">{e.x[lang]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
