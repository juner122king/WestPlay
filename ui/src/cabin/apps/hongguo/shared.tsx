import { useState } from 'react'
import type { HongguoDrama } from '../../../shared/host'
import { CloseGlyph, PlayGlyph } from '../youtube/glyphs'
import { dismissNotice, openDetail, play, selectEpisode, sendSignIn, useHongguo } from './hongguo'

const EPISODES_PER_PAGE = 30

/** Shared status/error banner when web playback hits a login wall or app-only episode lock. */
export function HongguoNoticeBanner({
  className = '',
  onOpenEpisodes,
}: {
  className?: string
  onOpenEpisodes?: () => void
}) {
  const notice = useHongguo((s) => s.playbackNotice)
  const currentEpisode = useHongguo((s) => s.currentEpisode)
  if (!notice) return null

  return (
    <div className={`hg-notice-banner ${notice.reason} ${className}`.trim()} role="alert">
      <div className="hg-notice-copy">
        <strong className="hg-notice-title">{notice.title}</strong>
        <p className="hg-notice-detail">{notice.detail}</p>
      </div>
      <div className="hg-notice-actions">
        {notice.reason === 'login_required' && (
          <button
            type="button"
            className="hg-notice-btn primary"
            onClick={() => {
              dismissNotice()
              sendSignIn()
            }}
          >
            扫码登录
          </button>
        )}
        {notice.reason === 'episode_locked' && currentEpisode > 1 && (
          <button type="button" className="hg-notice-btn primary" onClick={() => selectEpisode(1)}>
            试看第 1 集
          </button>
        )}
        {onOpenEpisodes && (
          <button type="button" className="hg-notice-btn" onClick={onOpenEpisodes}>
            选集列表
          </button>
        )}
        <button type="button" className="hg-notice-close" aria-label="关闭提示" onClick={() => dismissNotice()}>
          <CloseGlyph />
        </button>
      </div>
    </div>
  )
}

interface DramaCardProps {
  drama: HongguoDrama
  rank?: number
  metaOverride?: string
  onOpen?: (drama: HongguoDrama) => void
  onQuickPlay?: (drama: HongguoDrama) => void
}

/** Poster card for home shelves, category grid, search results, and rank lists. */
export function DramaCard({ drama, rank, metaOverride, onOpen, onQuickPlay }: DramaCardProps) {
  const [imgBroken, setImgBroken] = useState(false)
  const hasCover = Boolean(drama.cover) && !imgBroken
  const epLabel = drama.episodeText || (drama.totalEpisodes > 0 ? `${drama.totalEpisodes}集` : '连载中')
  const metaText =
    metaOverride || [drama.category, drama.heatText || drama.scoreText].filter(Boolean).join(' · ') || '热门短剧'

  return (
    <article className="hg-card">
      <button type="button" className="hg-card-main" onClick={() => (onOpen ? onOpen(drama) : openDetail(drama))}>
        <div className="hg-card-poster">
          {hasCover ? (
            <img
              src={drama.cover}
              alt={drama.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgBroken(true)}
            />
          ) : (
            <div className="hg-poster-fallback">
              <span>{drama.title.slice(0, 8)}</span>
            </div>
          )}
          <div className="hg-card-scrim" />

          {rank !== undefined && (
            <span className={`hg-rank-pill${rank <= 3 ? ` top${rank}` : ''}`}>{rank <= 3 ? `TOP ${rank}` : rank}</span>
          )}

          <span className="hg-ep-pill">{epLabel}</span>

          {drama.accessibleEpisodes !== undefined &&
            drama.accessibleEpisodes > 0 &&
            drama.totalEpisodes > drama.accessibleEpisodes && (
              <span className="hg-free-pill">前{drama.accessibleEpisodes}集试看</span>
            )}
        </div>

        <div className="hg-card-info">
          <h4 className="hg-card-title">{drama.title}</h4>
          <p className="hg-card-meta">{metaText}</p>
        </div>
      </button>

      <button
        type="button"
        className="hg-card-play"
        aria-label={`立即播放 ${drama.title}`}
        onClick={() => (onQuickPlay ? onQuickPlay(drama) : play(drama, 1, true))}
      >
        <PlayGlyph />
      </button>
    </article>
  )
}

interface EpisodePickerProps {
  totalEpisodes: number
  accessibleEpisodes: number
  currentEpisode: number
  compact?: boolean
  onSelect: (episode: number) => void
}

/**
 * Paginated episode grid supporting short dramas with 500–670+ episodes cleanly
 * inside in-car touch layouts, with visual distinction for web-free vs app-only episodes.
 */
export function EpisodePicker({
  totalEpisodes,
  accessibleEpisodes,
  currentEpisode,
  compact = false,
  onSelect,
}: EpisodePickerProps) {
  const safeTotal = Math.max(totalEpisodes || 0, currentEpisode || 1, 1)
  const pageCount = Math.ceil(safeTotal / EPISODES_PER_PAGE)
  const activePageForCurrent = Math.max(
    0,
    Math.min(pageCount - 1, Math.floor((Math.max(1, currentEpisode) - 1) / EPISODES_PER_PAGE)),
  )
  const [pageSelection, setPageSelection] = useState({
    key: `${safeTotal}:${activePageForCurrent}`,
    page: activePageForCurrent,
  })
  const currentKey = `${safeTotal}:${activePageForCurrent}`
  const page = pageSelection.key === currentKey ? pageSelection.page : activePageForCurrent

  const startEp = page * EPISODES_PER_PAGE + 1
  const endEp = Math.min(safeTotal, (page + 1) * EPISODES_PER_PAGE)
  const episodes = Array.from({ length: endEp - startEp + 1 }, (_, i) => startEp + i)
  const hasWebLimit = accessibleEpisodes > 0 && safeTotal > accessibleEpisodes

  return (
    <div className={`hg-ep-picker${compact ? ' compact' : ''}`}>
      {hasWebLimit && (
        <div className="hg-ep-legend">
          <span>
            <i className="hg-dot free" /> 第 1–{accessibleEpisodes} 集网页可直接畅看
          </span>
          <span>
            <i className="hg-dot locked" /> 后续剧集受平台版权保护（需手机端 App）
          </span>
        </div>
      )}

      {pageCount > 1 && (
        <div className="hg-ep-ranges" role="tablist" aria-label="选集分段">
          {Array.from({ length: pageCount }, (_, i) => {
            const from = i * EPISODES_PER_PAGE + 1
            const to = Math.min(safeTotal, (i + 1) * EPISODES_PER_PAGE)
            return (
              <button
                key={from}
                type="button"
                role="tab"
                aria-selected={page === i}
                className={`hg-range-pill${page === i ? ' active' : ''}`}
                onClick={() => setPageSelection({ key: currentKey, page: i })}
              >
                {from}–{to}
              </button>
            )
          })}
        </div>
      )}

      <div className="hg-ep-grid">
        {episodes.map((ep) => {
          const isCurrent = ep === currentEpisode
          const isLocked = accessibleEpisodes > 0 && ep > accessibleEpisodes
          return (
            <button
              key={ep}
              type="button"
              className={`hg-ep-btn${isCurrent ? ' active' : ''}${isLocked ? ' locked' : ''}`}
              onClick={() => onSelect(ep)}
            >
              <span className="hg-ep-num">{ep}</span>
              {isLocked && <span className="hg-ep-lock">APP</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
