import type { FriendsMap, Show, Tracking } from '../types'
import { airedEps, behindCount, continuity } from '../lib/progress'
import { displayName, subName, t } from '../lib/i18n'
import { MIN_VOTES } from '../lib/score'

interface Props {
  show: Show
  tracking: Tracking
  now: number
  seasonStart: number // 所选季度起点,用于"续"徽标
  archive?: boolean // 归档季:集数显示"全 N 集"而非"更新至"
  friendsMap: FriendsMap
  wide?: boolean // 日视图加宽卡片:大封面 + 日文名
  occText?: string // 本次放出说明,如"第 2 集 · 11 小时后"
  airedMark?: boolean // 本周该集已播
  offWeek?: boolean // 本周无更新(完结/延期)
  onOpen: (id: number) => void
}

export default function ShowCard({
  show,
  tracking,
  now,
  seasonStart,
  archive,
  friendsMap,
  wide,
  occText,
  airedMark,
  offWeek,
  onOpen,
}: Props) {
  const status = tracking.status[show.id] ?? 'none'
  const watched = tracking.watched[show.id] ?? 0
  const aired = airedEps(show, now)
  const behind = behindCount(show, tracking, now)
  const friendCount = friendsMap.get(show.id)?.size ?? 0
  const cont = continuity(show, seasonStart) // 跨季分级:新番 / 上季续播 / 长期放送

  const cls = [
    'show-card',
    `st-${status}`,
    cont !== 'new' ? `cont-${cont}` : '',
    wide ? 'wide' : '',
    airedMark ? 'aired' : '',
    offWeek ? 'offweek' : '',
  ].join(' ')

  return (
    <button className={cls} onClick={() => onOpen(show.id)} title={show.nameJp}>
      {show.image ? (
        <img className="cover" src={show.image} loading="lazy" alt="" />
      ) : (
        <span className="cover ph">番</span>
      )}
      <span className="body">
        <span className="title">{displayName(show)}</span>
        {wide && subName(show) ? <span className="jp">{subName(show)}</span> : null}
        <span className="meta">
          {occText ? <span className="occ">{occText}</span> : null}
          {show.score ? (
            show.ratingTotal !== undefined && show.ratingTotal < MIN_VOTES ? (
              <span className="score few" title={t('仅 {n} 人评分,分数仅供参考', { n: show.ratingTotal })}>
                ★{show.score.toFixed(1)}?
              </span>
            ) : (
              <span className="score">★{show.score.toFixed(1)}</span>
            )
          ) : null}
          {status === 'watching' && aired !== undefined ? (
            <span className="ep-badge">
              {watched}/{aired}
              {show.epsTotal ? `/${show.epsTotal}` : ''}
            </span>
          ) : archive ? (
            show.epsTotal ? <span className="ep-badge">{t('全{n}集', { n: show.epsTotal })}</span> : null
          ) : aired !== undefined && aired > 0 ? (
            <span className="ep-badge">{t('更新至{n}', { n: aired })}</span>
          ) : null}
          {behind > 0 ? <span className="behind">{t('落后{n}', { n: behind })}</span> : null}
          {friendCount > 0 ? <span className="friends">{t('友{n}', { n: friendCount })}</span> : null}
          {cont === 'carry' ? (
            <span className="cont" title={t('上季开始播出,本季继续')}>
              {t('续')}
            </span>
          ) : cont === 'long' ? (
            <span className="cont long" title={t('长期放送(本季开始前已播超过 20 集)')}>
              {t('长期')}
            </span>
          ) : null}
          {show.airFix?.advanceEps ? (
            <span className="cont" title={show.airFix.note ?? t('先行{n}', { n: show.airFix.advanceEps })}>
              {t('先行{n}', { n: show.airFix.advanceEps })}
            </span>
          ) : null}
          {!show.fromCalendar && cont === 'new' ? <span className="streamtag">{t('流媒体')}</span> : null}
          {offWeek ? <span>{t('本周无')}</span> : null}
        </span>
      </span>
    </button>
  )
}
