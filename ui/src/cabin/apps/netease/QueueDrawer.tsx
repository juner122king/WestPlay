import { clearQueue, playQueueTrack, removeFromQueue, toggleQueue, useNetease } from './netease'

export function QueueDrawer() {
  const queue = useNetease((s) => s.queue)
  const queueIndex = useNetease((s) => s.queueIndex)
  const queueOpen = useNetease((s) => s.queueOpen)
  const playing = useNetease((s) => s.playing)

  if (!queueOpen) return null

  return (
    <div className="netease-queue-backdrop" onClick={() => toggleQueue(false)}>
      <aside className="netease-queue-drawer" onClick={(e) => e.stopPropagation()} aria-label="播放队列">
        <header className="queue-header">
          <div className="queue-title-wrap">
            <h3 className="queue-title">当前播放</h3>
            <span className="queue-count">({queue.length})</span>
          </div>

          <div className="queue-actions">
            {queue.length > 0 && (
              <button type="button" className="queue-clear-btn" onClick={clearQueue} title="清空列表">
                清空
              </button>
            )}
            <button type="button" className="queue-close-btn" onClick={() => toggleQueue(false)} aria-label="关闭">
              ✕
            </button>
          </div>
        </header>

        <div className="queue-list">
          {queue.length === 0 ? (
            <div className="queue-empty">播放列表为空</div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`queue-item ${isCurrent ? 'active' : ''}`}
                  onClick={() => playQueueTrack(idx)}
                >
                  <div className="queue-item-indicator">
                    {isCurrent ? (
                      <div className="sound-wave">
                        <span className={`bar b1 ${playing ? 'anim' : ''}`} />
                        <span className={`bar b2 ${playing ? 'anim' : ''}`} />
                        <span className={`bar b3 ${playing ? 'anim' : ''}`} />
                      </div>
                    ) : (
                      <span className="queue-item-num">{idx + 1}</span>
                    )}
                  </div>

                  <div className="queue-item-body">
                    <span className="queue-item-title">{track.title}</span>
                    <span className="queue-item-artist">{track.artist}</span>
                  </div>

                  <button
                    type="button"
                    className="queue-item-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromQueue(idx)
                    }}
                    title="从列表中移除"
                    aria-label="移除歌曲"
                  >
                    ×
                  </button>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}
