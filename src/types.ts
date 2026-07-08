export type WatchStatus = 'wish' | 'watching' | 'done' | 'dropped'

export interface SiteLink {
  site: string // 平台展示名,如 "哔哩哔哩"
  url: string
}

/** 合并后的番剧条目(calendar API + bangumi-data + yuc 增强) */
export interface Show {
  id: number // bangumi subject id
  nameCn: string
  nameJp: string
  image?: string
  score?: number
  rank?: number
  watchers?: number // 多少人在看(collection.doing)
  airWeekdayJst?: number // ISO 1=周一..7=周日,来自 calendar API 的分组
  begin?: number // 第一集播出时刻(epoch ms),来自 bangumi-data
  end?: number // 完结时刻(epoch ms),0 = 未完结
  periodDays: number // 放送周期(天),周番 7
  epsTotal?: number // 总集数(来自 /v0/subjects,懒加载)
  summary?: string
  officialSite?: string
  sites: SiteLink[]
  fromCalendar: boolean // false = bangumi-data 独有(流媒体全集/未上 calendar)
  // yuc 增强字段(可选,由 refresh-data skill 生成)
  tags?: string[]
  pvUrl?: string
  sourceType?: string
}

/** 课表格子:某番在展示时区下的放送位置 */
export interface AirSlot {
  show: Show
  day: number // ISO 1..7(深夜表记开启时已归到前一天)
  minutes: number // 当日分钟数,深夜表记下可 >= 1440(25:30 → 1530)
  label: string // "22:00" / "25:30"
  known: boolean // 是否有精确时间
}

export interface Tracking {
  status: Record<number, WatchStatus>
  watched: Record<number, number> // subject id → 看到第几集
}

export interface Settings {
  theme: 'dark' | 'light'
  tzMode: 'local' | 'jst'
  lateNight: boolean // 深夜表记:0-6 点归前一天,显示 24+ 小时
  weekStart: 1 | 7 // 周一或周日开头
  friends: string[] // bgm 用户名
}

export interface FriendState {
  ep: number
  updatedAt?: string
}

/** subjectId → username → 进度 */
export type FriendsMap = Map<number, Map<string, FriendState>>
