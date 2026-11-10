import { dismissPlaybackNotice, formatPlaybackNotice, sendSignIn, useNetease } from './netease'

/** Banner notifying the driver when a VIP/unplayable track was skipped or paused. */
export function PlaybackNoticeBanner({ className = '' }: { className?: string }) {
  const playbackNotice = useNetease((s) => s.playbackNotice)
  const signedIn = useNetease((s) => s.signedIn)

  if (!playbackNotice) return null

  return (
    <div className={`netease-playback-notice ${className}`.trim()} role="status" aria-live="polite">
      <span className="playback-notice-text">
        {playbackNotice.reason === 'vip_required' ? '👑 ' : '⚠️ '}
        {formatPlaybackNotice(playbackNotice)}
      </span>
      <div className="playback-notice-actions">
        {playbackNotice.reason === 'vip_required' && !signedIn && !playbackNotice.skippedTo && (
          <button type="button" className="playback-notice-signin" onClick={sendSignIn}>
            扫码登录
          </button>
        )}
        <button type="button" className="playback-notice-close" onClick={dismissPlaybackNotice} aria-label="关闭提示">
          ✕
        </button>
      </div>
    </div>
  )
}
