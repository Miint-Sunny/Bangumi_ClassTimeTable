/**
 * 轻量四语言层(简中 / 繁中 / 日本語 / EN),零依赖。
 *
 * 约定:简中原文即字典 key —— 组件里 t('设置') 直接可读;缺译自动回落简中,
 * 永远不会渲染出 key 名。{n} 形式的占位符在译文中原样保留,由 t() 统一替换。
 * App 渲染最上方调用 setLang(settings.lang),React 自上而下渲染保证子组件取到新语言。
 */

export type Lang = 'zh-Hans' | 'zh-Hant' | 'ja' | 'en'

export const LANGS: [Lang, string][] = [
  ['zh-Hans', '简中'],
  ['zh-Hant', '繁中'],
  ['ja', '日本語'],
  ['en', 'EN'],
]

let cur: Lang = 'zh-Hans'
export const setLang = (l: Lang) => {
  cur = l
}
export const getLang = () => cur

export function detectLang(): Lang {
  const l = (navigator.language || '').toLowerCase()
  if (l.startsWith('ja')) return 'ja'
  if (l.startsWith('zh'))
    return /tw|hk|mo|hant/.test(l) ? 'zh-Hant' : 'zh-Hans'
  return 'en'
}

// value = [繁中, 日本語, EN]
const DICT: Record<string, [string, string, string]> = {
  // ── 顶栏 / 工具栏 ──
  番组课表: ['番組課表', '番組時間割', 'Bangumi Timetable'],
  '(当季)': ['(當季)', '(今期)', ' (current)'],
  本季在播: ['本季在播', '今期放送中', 'This season:'],
  该季收录: ['該季收錄', 'この期の収録', 'That season:'],
  部: ['部', '作品', ''],
  在看: ['在看', '視聴中', 'Watching'],
  '欠了 {n} 集没看': ['欠了 {n} 集沒看', '未視聴 {n} 話', '{n} eps unwatched'],
  切换季度: ['切換季度', 'シーズン切替', 'Switch season'],
  色彩模式: ['色彩模式', 'カラーテーマ', 'Color theme'],
  语言: ['語言', '言語', 'Language'],
  设置: ['設定', '設定', 'Settings'],
  关于: ['關於', 'このサイトについて', 'About'],
  'Bangumi 各域名登录互不相通,选常用的': [
    'Bangumi 各域名登入互不相通,選常用的',
    'Bangumi 各ドメインのログインは独立しています',
    'Bangumi domains have separate logins',
  ],
  日: ['日', '日', 'Day'],
  周: ['週', '週', 'Week'],
  月: ['月', '月', 'Month'],
  全部: ['全部', 'すべて', 'All'],
  我的课表: ['我的課表', 'マイ時間割', 'Mine'],
  想看: ['想看', '見たい', 'Plan'],
  看过: ['看過', '視聴済み', 'Done'],
  抛弃: ['拋棄', '中断', 'Dropped'],
  筛选: ['篩選', '絞り込み', 'Filter'],
  '范围 / 产地 / 口碑 / 来源 / 题材': [
    '範圍 / 產地 / 口碑 / 來源 / 題材',
    '範囲 / 制作国 / 評価 / 原作 / ジャンル',
    'Scope / Region / Rating / Source / Genre',
  ],
  范围: ['範圍', '範囲', 'Scope'],
  口碑: ['口碑', '評価', 'Rating'],
  来源: ['來源', '原作', 'Source'],
  题材: ['題材', 'ジャンル', 'Genre'],
  本季新番: ['本季新番', '今期の新作', 'New'],
  上季续播: ['上季續播', '前期から継続', 'Continuing'],
  长期放送: ['長期放送', '長期放送', 'Long-running'],
  本季新开播: ['本季新開播', '今期スタート', 'Started this season'],
  '上季开播、本季继续(季初已播 ≤20 集)': [
    '上季開播、本季繼續(季初已播 ≤20 集)',
    '前期開始で継続中(期首時点 ≤20 話)',
    'Started last season (≤20 eps at season start)',
  ],
  '年番/多年番(季初已播 >20 集)': [
    '年番/多年番(季初已播 >20 集)',
    '年間アニメなど(期首時点 >20 話)',
    'Year-long+ shows (>20 eps at season start)',
  ],
  展开: ['展開', '展開する', 'Expand'],
  收起: ['收起', '折りたたむ', 'Collapse'],
  产地: ['產地', '制作国', 'Region'],
  日本: ['日本', '日本', 'Japan'],
  中国: ['中國', '中国', 'China'],
  其他地区: ['其他地區', 'その他の地域', 'Other regions'],
  未知: ['未知', '不明', 'Unknown'],
  '有实锤的日本动画(bangumi-data/yuc 收录,或 bgm 官方产地标注)': [
    '有實錘的日本動畫(bangumi-data/yuc 收錄,或 bgm 官方產地標註)',
    '確証のある日本アニメ(bangumi-data/yuc 収録、または bgm 公式の制作国タグ)',
    'Confirmed Japanese anime (listed in bangumi-data/yuc, or officially tagged on bgm)',
  ],
  '国创(bgm 官方产地标注)': [
    '國創(bgm 官方產地標註)',
    '中国アニメ(bgm 公式の制作国タグ)',
    'Chinese animation (official bgm region tag)',
  ],
  '欧美/韩国等海外作品': [
    '歐美/韓國等海外作品',
    '欧米/韓国などの海外作品',
    'Western / Korean and other overseas works',
  ],
  '暂无可靠产地信号,不硬归类;每日自动复查,有实锤后自动归位': [
    '暫無可靠產地信號,不硬歸類;每日自動複查,有實錘後自動歸位',
    '確かな制作国情報がまだない作品。無理に分類せず毎日再確認、確証が出たら自動で振り分け',
    'No reliable region signal yet — not force-classified; rechecked daily and re-filed once confirmed',
  ],
  不限: ['不限', '指定なし', 'Any'],
  '按评分人数加权,小样本高分不虚高': [
    '按評分人數加權,小樣本高分不虛高',
    '評価人数で重み付け。少人数の高得点は上がりにくい',
    'Vote-weighted — tiny samples can’t inflate',
  ],
  清除筛选: ['清除篩選', '絞り込みをクリア', 'Clear filters'],
  '搜索标题 / 标签…': ['搜尋標題 / 標籤…', 'タイトル / タグを検索…', 'Search title / tag…'],
  本地时间: ['本地時間', '現地時間', 'Local'],
  日本时间: ['日本時間', '日本時間', 'JST'],
  时区: ['時區', 'タイムゾーン', 'Time zone'],
  收起侧栏: ['收起側欄', 'サイドパネルを閉じる', 'Collapse panel'],
  展开侧栏: ['展開側欄', 'サイドパネルを開く', 'Expand panel'],
  '数据加载失败:': ['資料載入失敗:', 'データの読み込みに失敗:', 'Failed to load: '],
  请检查网络后: ['請檢查網路後', 'ネットワークを確認して', 'Check your network, then '],
  重试: ['重試', '再試行', 'retry'],
  '正在拉取本季放送表…': ['正在拉取本季放送表…', '今期の放送表を取得中…', 'Loading this season…'],
  '正在加载 {s} 归档…': ['正在載入 {s} 歸檔…', '{s} のアーカイブを読み込み中…', 'Loading {s} archive…'],
  日视图仅当季可用: ['日檢視僅當季可用', '日表示は今期のみ', 'Day view is current-season only'],

  // ── 周/日/月导航 ──
  上周: ['上週', '先週', 'Prev'],
  下周: ['下週', '次週', 'Next'],
  本周: ['本週', '今週', 'This week'],
  回到本周: ['回到本週', '今週へ戻る', 'Back to this week'],
  前一天: ['前一天', '前日', 'Prev'],
  后一天: ['後一天', '翌日', 'Next'],
  回到今天: ['回到今天', '今日へ戻る', 'Back to today'],
  前天: ['前天', '一昨日', '2 days ago'],
  昨天: ['昨天', '昨日', 'Yesterday'],
  今天: ['今天', '今日', 'Today'],
  明天: ['明天', '明日', 'Tomorrow'],
  后天: ['後天', '明後日', 'In 2 days'],
  上月: ['上月', '前月', 'Prev'],
  下月: ['下月', '翌月', 'Next'],
  回到本月: ['回到本月', '今月へ戻る', 'Back to this month'],
  回到季首月: ['回到季首月', '期首の月へ', 'Season’s first month'],
  未定: ['未定', '未定', 'TBA'],
  未提供精确时间: ['未提供精確時間', '正確な時刻情報なし', 'No exact time'],
  '这一天没有更新。': ['這一天沒有更新。', 'この日は更新なし。', 'Nothing airs this day.'],
  当前时刻: ['當前時刻', '現在時刻', 'Now'],

  // ── 相对时间 ──
  马上: ['馬上', 'まもなく', 'soon'],
  刚刚: ['剛剛', 'たった今', 'just now'],
  '{n} 分钟后': ['{n} 分鐘後', '{n}分後', 'in {n} min'],
  '{n} 分钟前': ['{n} 分鐘前', '{n}分前', '{n} min ago'],
  '{n} 小时后': ['{n} 小時後', '{n}時間後', 'in {n} h'],
  '{n} 小时前': ['{n} 小時前', '{n}時間前', '{n} h ago'],
  '{n} 天后': ['{n} 天後', '{n}日後', 'in {n} d'],
  '{n} 天前': ['{n} 天前', '{n}日前', '{n} d ago'],

  // ── 卡片 ──
  '更新至{n}': ['更新至{n}', '{n}話まで', 'Ep {n} out'],
  '全{n}集': ['全{n}集', '全{n}話', '{n} eps'],
  '落后{n}': ['落後{n}', '{n}話遅れ', '{n} behind'],
  '友{n}': ['友{n}', '友{n}', 'F{n}'],
  续: ['續', '続', 'Cont.'],
  长期: ['長期', '長期', 'Long'],
  '先行{n}': ['先行{n}', '先行{n}', 'Early {n}'],
  流媒体: ['串流', '配信', 'Stream'],
  本周无: ['本週無', '今週なし', 'Off this week'],
  '上季开始播出,本季继续': ['上季開始播出,本季繼續', '前期から継続放送中', 'Continuing from last season'],
  '长期放送(本季开始前已播超过 20 集)': [
    '長期放送(本季開始前已播超過 20 集)',
    '長期放送(期首までに20話以上)',
    'Long-running (>20 eps before this season)',
  ],
  '仅 {n} 人评分,分数仅供参考': [
    '僅 {n} 人評分,分數僅供參考',
    '評価{n}人のみ。参考程度に',
    'Only {n} votes — take with a grain of salt',
  ],

  // ── 详情页 ──
  放送: ['放送', '放送', 'Broadcast'],
  '(日本时间,具体时刻未知)': ['(日本時間,具體時刻未知)', '(日本時間・時刻未定)', ' (JST, exact time unknown)'],
  放送时间未知: ['放送時間未知', '放送時間不明', 'Air time unknown'],
  下一次更新: ['下一次更新', '次回更新', 'Next:'],
  '第 {n} 集': ['第 {n} 集', '第{n}話', 'Ep {n}'],
  '第 {a}-{b} 集': ['第 {a}-{b} 集', '第{a}-{b}話', 'Ep {a}–{b}'],
  已播出: ['已播出', '放送済み', 'Aired'],
  集: ['集', '話', 'eps'],
  '/ 全 {n} 集': ['/ 全 {n} 集', '/ 全{n}話', '/ {n} total'],
  放送校正: ['放送校正', '放送情報の補正', 'Air-time fixes'],
  '(本机覆盖中)': ['(本機覆蓋中)', '(この端末で上書き中)', ' (local override)'],
  '(来自季度增强数据)': ['(來自季度增強資料)', '(シーズン拡張データ)', ' (from season data)'],
  '✎ 校正放送信息(先行/提前放送等)': [
    '✎ 校正放送資訊(先行/提前放送等)',
    '✎ 放送情報を補正(先行配信など)',
    '✎ Fix air info (early releases etc.)',
  ],
  前: ['前', '最初の', 'First'],
  '集已整批放出,时刻(本地时间,留空=开播时刻)': [
    '集已整批放出,時刻(本地時間,留空=開播時刻)',
    '話まで一括公開済み。時刻(現地時間・空欄=初回時刻)',
    'eps released in batch, at (local time; empty = premiere)',
  ],
  常规周更从第: ['常規週更從第', '通常の週次更新は第', 'Weekly from ep'],
  '集起,该集播出于': ['集起,該集播出於', '話から。その話の放送は', ', that ep airs at'],
  总集数: ['總集數', '全話数', 'Total eps'],
  备注: ['備註', 'メモ', 'Note'],
  '如:1~6 集 7/4 全网先行': ['如:1~6 集 7/4 全網先行', '例:1〜6話は7/4に先行配信', 'e.g. eps 1–6 early on 7/4'],
  依据链接: ['依據連結', '根拠リンク', 'Source link'],
  '官网公告 / yuc 页面 URL': ['官網公告 / yuc 頁面 URL', '公式告知 / yuc ページURL', 'Official notice / yuc URL'],
  保存到本机: ['儲存到本機', 'この端末に保存', 'Save locally'],
  清除校正: ['清除校正', '補正をクリア', 'Clear fixes'],
  取消: ['取消', 'キャンセル', 'Cancel'],
  '校正只保存在本机浏览器。想让它成为站点默认:把下面 JSON 交给 refresh-data skill 合并进 enhance.json 后重新部署。': [
    '校正只保存在本機瀏覽器。想讓它成為站點預設:把下面 JSON 交給 refresh-data skill 合併進 enhance.json 後重新部署。',
    '補正はこの端末にのみ保存されます。サイト既定にするには、下のJSONをenhance.jsonへマージして再デプロイしてください。',
    'Fixes are saved locally. To make them the site default, merge the JSON below into enhance.json and redeploy.',
  ],
  追番状态与评价: ['追番狀態與評價', '視聴ステータスと評価', 'Status & rating'],
  '(请谨慎评价)': ['(請謹慎評價)', '(慎重に)', ' (use sparingly)'],
  我的评价: ['我的評價', '自分の評価', 'My rating'],
  不忍直视: ['不忍直視', '見るに堪えない', 'Unwatchable'],
  很差: ['很差', 'とても悪い', 'Very bad'],
  差: ['差', '悪い', 'Bad'],
  较差: ['較差', 'やや悪い', 'Below avg'],
  不过不失: ['不過不失', '可もなく不可もなく', 'Average'],
  还行: ['還行', 'まあまあ', 'Fine'],
  推荐: ['推薦', 'おすすめ', 'Good'],
  力荐: ['力薦', '強くおすすめ', 'Great'],
  神作: ['神作', '神作', 'Superb'],
  超神作: ['超神作', '超神作', 'Masterpiece'],
  '标签(空格或逗号隔开,至多 10 个)': [
    '標籤(空格或逗號隔開,至多 10 個)',
    'タグ(スペース/カンマ区切り・最大10個)',
    'Tags (space/comma separated, max 10)',
  ],
  常用: ['常用', 'よく使われる', 'Popular'],
  我的: ['我的', '自分の', 'Mine'],
  '吐槽(随收藏同步到 bgm)': ['吐槽(隨收藏同步到 bgm)', 'コメント(bgmへ同期)', 'Comment (syncs to bgm)'],
  保存: ['儲存', '保存', 'Save'],
  仅自己可见: ['僅自己可見', '自分のみ表示', 'Private'],
  已保存: ['已儲存', '保存済み', 'Saved'],
  进度: ['進度', '進捗', 'Progress'],
  '落后 {n} 集': ['落後 {n} 集', '{n}話遅れ', '{n} eps behind'],
  补到已播: ['補到已播', '放送分まで既読', 'Catch up'],
  看了一集: ['看了一集', '1話見た', '+1 ep'],
  好友进度: ['好友進度', 'フレンドの進捗', 'Friends’ progress'],
  '看到第 {n} 集': ['看到第 {n} 集', '第{n}話まで視聴', 'at ep {n}'],
  链接: ['連結', 'リンク', 'Links'],
  官网: ['官網', '公式サイト', 'Official site'],
  内嵌预览: ['內嵌預覽', '埋め込み再生', 'Inline PV'],
  收起预览: ['收起預覽', 'プレビューを閉じる', 'Hide PV'],
  'PV 预览': ['PV 預覽', 'PVプレビュー', 'PV preview'],
  简介: ['簡介', 'あらすじ', 'Synopsis'],
  '{n} 人评分': ['{n} 人評分', '{n}人が評価', '{n} votes'],
  '(人数少,仅供参考)': ['(人數少,僅供參考)', '(少人数・参考値)', ' (few votes)'],
  '排名 #{n}': ['排名 #{n}', '順位 #{n}', 'Rank #{n}'],
  '{n} 人在看': ['{n} 人在看', '{n}人が視聴中', '{n} watching'],
  '长期放送(已播 {n} 集)': ['長期放送(已播 {n} 集)', '長期放送(既に{n}話)', 'Long-running ({n} eps aired)'],
  关闭: ['關閉', '閉じる', 'Close'],
  '筛选「{t}」': ['篩選「{t}」', '「{t}」で絞り込み', 'Filter “{t}”'],
  '[依据]': ['[依據]', '[根拠]', '[source]'],

  // ── 侧栏速览 ──
  '拖动调宽,拖到最窄即收起': ['拖動調寬,拖到最窄即收起', 'ドラッグで幅調整。最小で収納', 'Drag to resize; smallest collapses'],
  '点击课表里的番剧卡片,详情会在这里展开。': [
    '點擊課表裡的番劇卡片,詳情會在這裡展開。',
    '時間割のカードをクリックすると、ここに詳細が表示されます。',
    'Click a card in the timetable to see details here.',
  ],
  '标记「在看 / 想看」后,这里会变成你的补番清单和更新日程。': [
    '標記「在看 / 想看」後,這裡會變成你的補番清單和更新日程。',
    '「視聴中 / 見たい」を付けると、ここが積みリストと更新予定になります。',
    'Mark shows as Watching / Plan to see your backlog and schedule here.',
  ],
  补番清单: ['補番清單', '積み消化リスト', 'Backlog'],
  '(欠 {n} 集)': ['(欠 {n} 集)', '(残り{n}話)', ' ({n} eps)'],
  '没有落后的番,轻松。': ['沒有落後的番,輕鬆。', '遅れなし。快適。', 'All caught up.'],
  我的更新日程: ['我的更新日程', '更新スケジュール', 'My schedule'],
  '⚡ 撞档提醒': ['⚡ 撞檔提醒', '⚡ 時間帯かぶり', '⚡ Conflicts'],
  共同在追: ['共同在追', '一緒に視聴中', 'Watching together'],
  '等 {n} 部': ['等 {n} 部', 'など{n}作品', ' … {n} titles'],
  好友动态: ['好友動態', 'フレンドの動き', 'Friend activity'],
  本季高分: ['本季高分', '今期の高評価', 'Top rated'],
  该季高分: ['該季高分', 'この期の高評価', 'Top rated'],
  '按评分人数加权排序,少量人打出的高分不虚高': [
    '按評分人數加權排序,少量人打出的高分不虛高',
    '評価人数で重み付けした順位です',
    'Sorted by vote-weighted score',
  ],
  '加权 {n}': ['加權 {n}', '重み付け {n}', 'weighted {n}'],
  '{n}人': ['{n}人', '{n}人', '{n}'],
  补齐: ['補齊', '追いつく', 'Catch up'],
  '看到{n}': ['看到{n}', '{n}話まで', 'at {n}'],
  '· 点日期看当天': ['· 點日期看當天', '· 日付クリックでその日へ', ' · click a date'],
  '追番更新日 · 描边 = 今天': ['追番更新日 · 描邊 = 今天', '更新日 · 枠=今日', 'Update days · outline = today'],
  ' · 填充 = 当前所在日': [' · 填充 = 當前所在日', ' · 塗り=表示中の日', ' · filled = selected'],
  '{mo} 月 {d} 日有追番更新': ['{mo} 月 {d} 日有追番更新', '{mo}月{d}日に更新あり', 'Updates on {mo}/{d}'],

  // ── 设置 ──
  主题: ['主題', 'テーマ', 'Theme'],
  Bangumi深色: ['Bangumi深色', 'Bangumiダーク', 'Bangumi dark'],
  深色: ['深色', 'ダーク', 'Dark'],
  高对比深色: ['高對比深色', 'ハイコントラスト', 'High contrast'],
  白色: ['白色', 'ライト', 'Light'],
  周起始: ['週起始', '週の開始', 'Week starts'],
  深夜表记: ['深夜表記', '深夜表記', 'Late night'],
  凌晨归前日: ['凌晨歸前日', '深夜は前日扱い', 'Fold late night'],
  按实际日期: ['按實際日期', '実際の日付', 'Actual date'],
  '{h}:00 前(表记到 {e}:59)': ['{h}:00 前(表記到 {e}:59)', '{h}:00まで(〜{e}:59表記)', 'Before {h}:00 (up to {e}:59)'],
  几点之前算前一天的深夜档: ['幾點之前算前一天的深夜檔', '何時までを前日の深夜枠とするか', 'Cutoff hour for late night'],
  好友: ['好友', 'フレンド', 'Friends'],
  'bgm 用户名(个人页 URL 尾段)': ['bgm 使用者名(個人頁 URL 尾段)', 'bgmユーザー名(プロフィールURL末尾)', 'bgm username (end of profile URL)'],
  添加: ['新增', '追加', 'Add'],
  用户不存在或收藏不公开: ['使用者不存在或收藏不公開', 'ユーザー不在か収蔵が非公開', 'User not found or private'],
  拉取失败: ['拉取失敗', '取得失敗', 'Fetch failed'],
  导出: ['匯出', '書き出し', 'Export'],
  '📅 导出我的追番日历(.ics)': ['📅 匯出我的追番日曆(.ics)', '📅 視聴カレンダー(.ics)を書き出す', '📅 Export my calendar (.ics)'],
  备份: ['備份', 'バックアップ', 'Backup'],
  '⤓ 导出追番数据': ['⤓ 匯出追番資料', '⤓ データ書き出し', '⤓ Export data'],
  '⤒ 导入': ['⤒ 匯入', '⤒ 読み込み', '⤒ Import'],
  数据: ['資料', 'データ', 'Data'],
  清缓存并刷新: ['清快取並重新整理', 'キャッシュ削除して再読込', 'Clear cache & reload'],
  '导入将覆盖本机的追番记录与设置(备份含 {n} 部追番状态),确定?': [
    '匯入將覆蓋本機的追番記錄與設定(備份含 {n} 部追番狀態),確定?',
    '読み込むと、この端末の記録と設定を上書きします({n}作品分)。続行しますか?',
    'Importing will overwrite local data & settings ({n} tracked shows). Continue?',
  ],
  '导入失败:{e}': ['匯入失敗:{e}', '読み込み失敗:{e}', 'Import failed: {e}'],
  不是有效的备份文件: ['不是有效的備份檔案', '有効なバックアップではありません', 'Not a valid backup file'],

  // ── Bangumi 账号 ──
  '粘贴访问令牌(token)': ['貼上存取權杖(token)', 'アクセストークンを貼り付け', 'Paste access token'],
  连接: ['連接', '接続', 'Connect'],
  '验证中…': ['驗證中…', '確認中…', 'Verifying…'],
  '用 Bangumi 登录': ['用 Bangumi 登入', 'Bangumiでログイン', 'Sign in with Bangumi'],
  或: ['或', 'または', 'or'],
  '↻ 立即同步': ['↻ 立即同步', '↻ 今すぐ同期', '↻ Sync now'],
  '同步中…': ['同步中…', '同期中…', 'Syncing…'],
  断开: ['斷開', '切断', 'Disconnect'],
  '令牌已失效或被吊销,请生成新令牌后重新粘贴。': [
    '權杖已失效或被吊銷,請生成新權杖後重新貼上。',
    'トークンが無効です。新しく発行して貼り直してください。',
    'Token invalid or revoked — create a new one and paste it again.',
  ],
  '登录已过期,请重新登录。': ['登入已過期,請重新登入。', 'ログインの期限が切れました。再ログインしてください。', 'Session expired — sign in again.'],
  令牌无效或已过期: ['權杖無效或已過期', 'トークンが無効か期限切れです', 'Token invalid or expired'],
  '验证失败,请检查网络后重试': ['驗證失敗,請檢查網路後重試', '確認に失敗。ネットワークをご確認ください', 'Verification failed — check your network'],
  '已同步 {t}': ['已同步 {t}', '同期済み {t}', 'Synced {t}'],
  ' · 推回 {n} 条': [' · 推回 {n} 條', ' · {n}件を反映', ' · pushed {n}'],
  '同步失败:{e}': ['同步失敗:{e}', '同期失敗:{e}', 'Sync failed: {e}'],
  '令牌已失效,请重新连接': ['權杖已失效,請重新連接', 'トークンが無効です。再接続してください', 'Token invalid — reconnect'],
  '登录已过期,请重新登录': ['登入已過期,請重新登入', 'ログイン期限切れ。再ログインしてください', 'Session expired — sign in again'],
  'Bangumi 登录失败:{e}': ['Bangumi 登入失敗:{e}', 'Bangumiログイン失敗:{e}', 'Bangumi sign-in failed: {e}'],
  '「用 Bangumi 登录」跳转 bgm.tv 授权(需在 bgm.tv 域名下登录过),令牌 7 天有效、自动续期。 ': [
    '「用 Bangumi 登入」跳轉 bgm.tv 授權(需在 bgm.tv 網域登入過),權杖 7 天有效、自動續期。 ',
    '「Bangumiでログイン」はbgm.tvの認可ページへ移動します(bgm.tvでのログインが必要)。トークンは7日有効・自動更新。 ',
    '“Sign in with Bangumi” opens bgm.tv authorization (you must be logged in on bgm.tv). Tokens last 7 days and auto-renew. ',
  ],
  也可在: ['也可在', 'または', 'Or create a personal token at '],
  '生成个人令牌(建议选一年有效期)粘贴连接。令牌只保存在本机浏览器,不进备份文件,可随时吊销。 连接后:应用内的追番改动即时写回 bgm.tv;bgm.tv 侧的改动每半小时拉取合并(以 bgm 为准)。 首次连接会双向合并(状态本机优先、进度取较大值)。bgm 的「搁置」在课表按未追显示; 本地取消追番不会删除 bgm 收藏。': [
    '生成個人權杖(建議選一年有效期)貼上連接。權杖只保存在本機瀏覽器,不進備份檔案,可隨時吊銷。 連接後:應用內的追番改動即時寫回 bgm.tv;bgm.tv 側的改動每半小時拉取合併(以 bgm 為準)。 首次連接會雙向合併(狀態本機優先、進度取較大值)。bgm 的「擱置」在課表按未追顯示; 本地取消追番不會刪除 bgm 收藏。',
    'で個人トークンを発行(有効期間1年推奨)して貼り付け。トークンはこの端末にのみ保存され、バックアップには含まれず、いつでも失効できます。接続後:アプリ内の変更は即時bgm.tvへ反映、bgm.tv側の変更は30分ごとに取得・マージ(bgm優先)。初回は双方向マージ(ステータスは端末優先・進捗は大きい方)。bgmの「保留」は未追跡扱い。ローカルで追跡解除してもbgmの収蔵は消えません。',
    'and paste it here (1-year validity recommended). The token stays in this browser only, is excluded from backups, and can be revoked anytime. Once connected: in-app changes push to bgm.tv instantly; bgm-side changes merge every 30 min (bgm wins). First connect does a two-way merge (local status wins, higher progress wins). bgm’s “on hold” shows as untracked; untracking locally never deletes bgm collections.',
  ],
  '数据来源:Bangumi 官方 API(每 6 小时缓存)· bangumi-data 数据集(jsDelivr CDN,每日缓存)· 每集精确时刻来自': [
    '資料來源:Bangumi 官方 API(每 6 小時快取)· bangumi-data 資料集(jsDelivr CDN,每日快取)· 每集精確時刻來自',
    'データ:Bangumi公式API(6時間キャッシュ)・bangumi-data(jsDelivr CDN・日次キャッシュ)・各話の正確な時刻は',
    'Data: official Bangumi API (6 h cache) · bangumi-data via jsDelivr (daily cache) · per-episode exact times from ',
  ],
  '(经其开发者 API 每日同步,致谢其编辑者社区)· 可选的 yuc.wiki 增强数据由 AI 辅助的 refresh-data skill 人工触发生成,不做自动抓取。': [
    '(經其開發者 API 每日同步,致謝其編輯者社群)· 可選的 yuc.wiki 增強資料由 AI 輔助的 refresh-data skill 人工觸發生成,不做自動抓取。',
    '(開発者APIで日次同期。編集者コミュニティに感謝)・yuc.wiki拡張データはAI支援のrefresh-dataスキルで手動生成。自動クロールはしません。',
    ' (synced daily via its developer API — thanks to its editors) · optional yuc.wiki enrichment is generated manually via an AI-assisted skill; no automated scraping.',
  ],
  '追番状态与进度保存在本机浏览器(localStorage);连接 Bangumi 账号(上方一键登录或个人令牌)后与 bgm.tv 收藏双向同步。': [
    '追番狀態與進度保存在本機瀏覽器(localStorage);連接 Bangumi 帳號(上方一鍵登入或個人權杖)後與 bgm.tv 收藏雙向同步。',
    '視聴データはこの端末(localStorage)に保存。Bangumiアカウント接続で bgm.tv と双方向同期します。',
    'Tracking data lives in this browser (localStorage); connect a Bangumi account above for two-way sync with bgm.tv.',
  ],
  '好友进度读取的是对方在 bgm.tv 上公开的收藏,仅"在看"状态,缓存 1 小时。': [
    '好友進度讀取的是對方在 bgm.tv 上公開的收藏,僅"在看"狀態,快取 1 小時。',
    'フレンドの進捗は bgm.tv の公開収蔵(視聴中のみ)を1時間キャッシュで取得します。',
    'Friends’ progress reads their public bgm.tv collections (watching only), cached 1 h.',
  ],

  // ── 关于 ──
  '像课表一样追番。': ['像課表一樣追番。', '時間割のようにアニメを追いかける。', 'Track anime like a class timetable.'],
  '版本 {v}': ['版本 {v}', 'バージョン {v}', 'Version {v}'],
  'GitHub 仓库': ['GitHub 倉庫', 'GitHubリポジトリ', 'GitHub repo'],
  '🐛 反馈问题': ['🐛 回報問題', '🐛 不具合・要望を報告', '🐛 Report an issue'],
  '用得不顺、数据不对、想要新功能,都欢迎': [
    '用得不順、資料不對、想要新功能,都歡迎',
    '不具合・データの誤り・要望など何でもどうぞ',
    'Bugs, wrong data, feature ideas — all welcome',
  ],
  更新历史: ['更新歷史', '更新履歴', 'Changelog'],
  '数据来自 Bangumi、bangumi-data、番組維基(bgm.wiki)与 yuc.wiki,感谢各社区的维护者。': [
    '資料來自 Bangumi、bangumi-data、番組維基(bgm.wiki)與 yuc.wiki,感謝各社群的維護者。',
    'データは Bangumi・bangumi-data・番組維基(bgm.wiki)・yuc.wiki より。各コミュニティに感謝します。',
    'Data from Bangumi, bangumi-data, bgm.wiki and yuc.wiki — thanks to their maintainers.',
  ],
  '以 MIT 协议开源': ['以 MIT 授權開源', 'MITライセンスで公開', 'Open source under MIT'],
}

/** 取译文;缺译回落简中。{k} 占位符统一替换。 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = key
  if (cur !== 'zh-Hans') {
    const e = DICT[key]
    if (e) s = e[cur === 'zh-Hant' ? 0 : cur === 'ja' ? 1 : 2]
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

// ── 星期与日期格式(各语言习惯不同,不走字典) ──────────────────────

const WD_SHORT: Record<Lang, string[]> = {
  'zh-Hans': ['', '一', '二', '三', '四', '五', '六', '日'],
  'zh-Hant': ['', '一', '二', '三', '四', '五', '六', '日'],
  ja: ['', '月', '火', '水', '木', '金', '土', '日'],
  en: ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
}
const WD_EN = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_EN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_EN_FULL = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 单字/双字星期(表头、迷你月历) */
export const wdShort = (wd: number) => WD_SHORT[cur][wd] ?? ''

/** 完整星期:周一 / 週一 / 月曜 / Mon */
export function wdFull(wd: number): string {
  if (cur === 'ja') return `${WD_SHORT.ja[wd]}曜`
  if (cur === 'en') return WD_EN[wd]
  return `${cur === 'zh-Hant' ? '週' : '周'}${WD_SHORT[cur][wd]}`
}

/** 每周五 / 毎週金曜 / Every Fri */
export function everyWd(wd: number): string {
  if (cur === 'ja') return `毎週${WD_SHORT.ja[wd]}曜`
  if (cur === 'en') return `Every ${WD_EN[wd]}`
  return `每${wdFull(wd)}`
}

/** 7月10日(周五) / 7月10日(金) / Jul 10 (Fri) */
export function fmtMDW(mo: number, d: number, wd: number): string {
  if (cur === 'ja') return `${mo}月${d}日(${WD_SHORT.ja[wd]})`
  if (cur === 'en') return `${MONTH_EN[mo]} ${d} (${WD_EN[wd]})`
  return `${mo}月${d}日(${wdFull(wd)})`
}

/** 2026 年 7 月 / 2026年7月 / July 2026 */
export function monthTitle(y: number, mo: number): string {
  if (cur === 'ja') return `${y}年${mo}月`
  if (cur === 'en') return `${MONTH_EN_FULL[mo]} ${y}`
  return `${y} 年 ${mo} 月`
}

/** 季度标签:2026年7月 / 2026年7月 / Jul 2026 */
export function seasonLabel(y: number, mo: number): string {
  if (cur === 'en') return `${MONTH_EN[mo]} ${y}`
  return `${y}年${mo}月`
}

// ── 番剧标题多语言(数据来自 bangumi-data titleTranslate,不是界面字典) ──

interface Named {
  nameCn: string
  nameJp: string
  nameHant?: string
  nameEn?: string
}

/** 主标题按界面语言:日语→原名;EN→英译,缺则回落原名;繁中→繁译,缺则回落简中 */
export function displayName(s: Named): string {
  switch (cur) {
    case 'ja':
      return s.nameJp
    case 'en':
      return s.nameEn ?? s.nameJp
    case 'zh-Hant':
      return s.nameHant ?? s.nameCn
    default:
      return s.nameCn
  }
}

/** 副标题(详情页/宽卡片的第二行):与主标题不同的那个名字 */
export function subName(s: Named): string | null {
  const main = displayName(s)
  const alt = main === s.nameJp ? s.nameCn : s.nameJp
  return alt && alt !== main ? alt : null
}
