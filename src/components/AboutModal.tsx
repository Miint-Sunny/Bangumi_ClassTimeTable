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
    d: '2026-09-19',
    x: {
      'zh-Hans': '统计页「魔怔」扩展:观看节奏(GitHub 贡献图式日历 + 周几×小时热力、深夜党指数、一集耗时、连续周数)、口味逆风盘(挑剔度、私藏神作/众人皆醉)、弃番解剖、追新 vs 补番、冷门指数、口味演变、制作/导演/声优榜、好友口味相似度;应用内操作也会记进本机日志,未登录同样有胶囊与节奏图',
      'zh-Hant': '統計頁「魔怔」擴展:觀看節奏(GitHub 貢獻圖式日曆 + 週幾×小時熱力、深夜黨指數、一集耗時、連續週數)、口味逆風盤(挑剔度、私藏神作/眾人皆醉)、棄番解剖、追新 vs 補番、冷門指數、口味演變、製作/導演/聲優榜、好友口味相似度;應用內操作也會記進本機日誌,未登入同樣有膠囊與節奏圖',
      ja: '統計ページを大幅拡張:視聴リズム(GitHub風カレンダー+曜日×時間ヒートマップ、深夜派指数、1話あたりの間隔、連続週数)、逆張り度(辛口度、隠れた神作/世間とズレた作品)、切り解剖、新作追い vs 積み消化、マイナー度、嗜好の変化、制作会社/監督/声優ランキング、フレンドとの嗜好類似度。アプリ内操作もローカルに記録され、未ログインでもカプセルとリズムが見られます',
      en: 'Stats page goes full data-nerd: watch rhythm (GitHub-style calendar + weekday×hour heatmap, night-owl index, per-episode pace, week streak), taste vs crowd (pickiness, hidden gems / against the crowd), drop anatomy, new vs backlog, obscurity index, taste over time, studio/director/VA rankings, friend taste match; in-app actions are logged locally so the capsule and rhythm work without signing in',
    },
  },
  {
    d: '2026-09-19',
    x: {
      'zh-Hans': '统计改为独立页面(顶栏 📊 切换,地址栏 #stats,浏览器后退可回课表);季度/主题/语言/深夜档等下拉全部换成站内自绘菜单(分组、键盘操作、选中项自动定位),不再用浏览器默认样式',
      'zh-Hant': '統計改為獨立頁面(頂欄 📊 切換,網址列 #stats,瀏覽器後退可回課表);季度/主題/語言/深夜檔等下拉全部換成站內自繪選單(分組、鍵盤操作、選中項自動定位),不再用瀏覽器預設樣式',
      ja: '統計を独立ページに(上部 📊 で切替、URL #stats、ブラウザの戻るで時間割へ)。シーズン/テーマ/言語/深夜帯のプルダウンをサイト独自のメニューに刷新(グループ表示、キーボード操作、選択項目へ自動スクロール)',
      en: 'Stats is now a full page (toggle via 📊, URL #stats, browser back returns to the timetable); season / theme / language / late-night dropdowns replaced with custom menus (grouped, keyboard-friendly, auto-scroll to the selected item) instead of browser defaults',
    },
  },
  {
    d: '2026-09-19',
    x: {
      'zh-Hans': '追番统计页按 bgm 新版主页重做:状态胶囊行、收藏/看过/完成率/平均分/标准差/评分数六色块、10→1 评分直方图,新增「时间胶囊」(想看/在看/完成了第几话的真实动作流,可翻页)',
      'zh-Hant': '追番統計頁按 bgm 新版主頁重做:狀態膠囊行、收藏/看過/完成率/平均分/標準差/評分數六色塊、10→1 評分直方圖,新增「時間膠囊」(想看/在看/完成了第幾話的真實動作流,可翻頁)',
      ja: '視聴統計を bgm 新版プロフィールに合わせて刷新:状態チップ、収蔵/見た/完了率/平均/標準偏差/評価数の6ブロック、10→1 の評価分布。「タイムカプセル」(視聴履歴の実アクション、ページ送り可)を追加',
      en: 'Stats page restyled after the new bgm profile: status chips, six stat blocks (collected / done / finish rate / avg / std dev / rated), 10→1 rating histogram, plus a “Time capsule” feed of your real actions (paginated)',
    },
  },
  {
    d: '2026-09-18',
    x: {
      'zh-Hans': '新增「追番统计」页(顶栏 📊):看过/在看/想看/搁置/抛弃总览、每季追番柱图(点柱子跳归档)、换季对比、评分分布、题材偏好、年度足迹、9 分神作;登录 bgm 后统计全部历史收藏',
      'zh-Hant': '新增「追番統計」頁(頂欄 📊):看過/在看/想看/擱置/拋棄總覽、每季追番柱圖(點柱子跳歸檔)、換季對比、評分分布、題材偏好、年度足跡、9 分神作;登入 bgm 後統計全部歷史收藏',
      ja: '「視聴統計」ページを追加(上部 📊):収蔵状態の総覧、シーズン別の棒グラフ(クリックでアーカイブへ)、シーズン比較、評価分布、ジャンル傾向、年別記録、9点以上の神作。bgmログインで全履歴を集計',
      en: 'New “Watch stats” page (📊 in the header): collection overview, per-season bars (click to open that archive), season vs season, rating spread, genre taste, by-year table and 9+ picks; sign in to bgm for your whole history',
    },
  },
  {
    d: '2026-09-19',
    x: {
      'zh-Hans': '修复:粘贴个人令牌提示"验证失败"——bgm.tv 官方接口近日对所有跨站请求回 502,浏览器直连全部失效。现在直连失败时自动改走本站同源转发(令牌只透传、不留存),登录/同步/统计/好友榜恢复可用;bgm 接口自身故障时提示更准确;v0 挂着的时候登录、收藏同步、统计页收藏、好友重合整体改走 next.bgm.tv 的 p1 接口(同一套令牌,经本站转发),v0 恢复自动切回',
      'zh-Hant': '修復:貼上個人權杖提示「驗證失敗」——bgm.tv 官方介面近日對所有跨站請求回 502,瀏覽器直連全部失效。現在直連失敗時自動改走本站同源轉發(權杖只透傳、不保存),登入/同步/統計/好友榜恢復可用;bgm 介面自身故障時提示更準確;v0 掛著的時候登入、收藏同步、統計頁收藏、好友重合整體改走 next.bgm.tv 的 p1 介面(同一套權杖,經本站轉發),v0 恢復自動切回',
      ja: '修正:トークン貼り付けで「確認に失敗」になる問題。bgm.tv 公式 API が最近クロスサイト要求すべてに 502 を返すようになりブラウザ直結が全滅。直結失敗時は自サイトの同一オリジン中継へ自動切替(トークンは透過のみ、保存なし)。ログイン/同期/統計/フレンド比較が復旧。API 自体の障害時は表示を明確化。v0 停止中はログイン・収蔵同期・統計・フレンド比較をまとめて next.bgm.tv の p1 API へ切替(同じトークン、自サイト経由)。v0 復旧で自動的に戻る',
      en: 'Fix: pasting a token showed "Verification failed" — the official bgm.tv API recently began answering every cross-site request with 502, so direct browser calls all failed. Direct calls now fall back to a same-origin relay on this site (token passed through, never stored); login, sync, stats and friend charts work again, and a real API outage is reported as such; while v0 is down, sign-in, collection sync, stats and friend overlap all switch to next.bgm.tv\'s p1 API (same token, relayed by this site) and switch back once v0 recovers',
    },
  },
  {
    d: '2026-09-18',
    x: {
      'zh-Hans': '修复:滚动时周表/月表的星期表头上方露出一条缝(翻页条高度随字体带小数,表头吸附位置对不齐);2022~2024 归档补齐 yuc 标签/PV;换季时自动重烘上季归档、刷新终局评分',
      'zh-Hant': '修復:滾動時週表/月表的星期表頭上方露出一條縫(翻頁條高度隨字體帶小數,表頭吸附位置對不齊);2022~2024 歸檔補齊 yuc 標籤/PV;換季時自動重烘上季歸檔、刷新終局評分',
      ja: '修正:スクロール時に曜日ヘッダーの上に隙間が出る問題(ナビバーの高さが小数になりヘッダーの固定位置とずれていた)。2022〜2024アーカイブにyucのタグ/PVを追加。シーズン切替時に前シーズンのアーカイブを自動再生成し最終評価を反映',
      en: 'Fix: a thin gap above the weekday header while scrolling (nav bar height was fractional, so the sticky header misaligned); 2022–2024 archives now carry yuc tags/PV; the previous season is re-baked automatically at season change with final ratings',
    },
  },
  {
    d: '2026-09-18',
    x: {
      'zh-Hans': '归档扩展到 2014 年起共 51 季(2014~2024 由 bangumi-data + bgm 官方数据烘焙,季度选择器按年份分组);10 月新番增强数据就位(65 部对齐 bgm 条目,标签/PV/改编来源),课表时段待 yuc 周表与 bangumi-data 更新后自动跟进',
      'zh-Hant': '歸檔擴展到 2014 年起共 51 季(2014~2024 由 bangumi-data + bgm 官方資料烘焙,季度選擇器按年份分組);10 月新番增強資料就位(65 部對齊 bgm 條目,標籤/PV/改編來源),課表時段待 yuc 週表與 bangumi-data 更新後自動跟進',
      ja: 'アーカイブを2014年まで拡張し計51シーズンに(2014〜2024はbangumi-data+bgm公式データから生成、シーズン選択は年ごとにグループ化)。10月新作の補助データを準備(65作品をbgmに紐付け、タグ/PV/原作種別)。時間割の枠はyucの週表とbangumi-data更新後に自動反映',
      en: 'Archives now reach back to 2014 (51 seasons; 2014–2024 baked from bangumi-data + official bgm data, season picker grouped by year). October lineup enhancements ready (65 shows matched to bgm, tags/PV/source); timetable slots will follow once yuc and bangumi-data publish theirs',
    },
  },
  {
    d: '2026-08-05',
    x: {
      'zh-Hans': '修复:办过提前先行首映的新番(盗掘王)课表格位被首映时刻带偏,现按近五周实播定位;www.bgmtimetable.com 跳转主域名;GitHub Pages 镜像随每日数据自动更新',
      'zh-Hant': '修復:辦過提前先行首映的新番(盜掘王)課表格位被首映時刻帶偏,現按近五週實播定位;www.bgmtimetable.com 跳轉主域名;GitHub Pages 鏡像隨每日資料自動更新',
      ja: '修正:先行ワールドプレミア実施作(盗掘王)の時間割枠がプレミア時刻に引っ張られる問題。直近5週の実放送で判定。www は主ドメインへリダイレクト、Pages ミラーも毎日自動更新に',
      en: 'Fix: shows with early premiere events (Tomb Raider King) no longer sit in the premiere slot — placement now follows the last 5 weeks of actual airings; www now redirects to the apex domain; GitHub Pages mirror auto-updates daily',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '筛选新增「产地」:日本/中国/其他地区/未知 四类(拿不准的诚实标未知、每日复查,不误删);筛选选择跨会话记住;侧栏补番清单/更新日程限高滚动、可展开,不再截断条数',
      'zh-Hant': '篩選新增「產地」:日本/中國/其他地區/未知 四類(拿不準的誠實標未知、每日複查,不誤刪);篩選選擇跨會話記住;側欄補番清單/更新日程限高滾動、可展開,不再截斷條數',
      ja: '絞り込みに「制作国」を追加:日本/中国/その他/不明の4分類(不明作品は無理に分類せず毎日再確認)。絞り込み選択は保存。サイドバーの積みリスト/更新予定はスクロール+展開式で全件表示に',
      en: 'New "Region" filter: Japan / China / Other / Unknown (uncertain shows stay Unknown, rechecked daily); filter choices persist; sidebar backlog & schedule now scroll + expand, no more truncation',
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
