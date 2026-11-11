export const MEDIA_APPS = [
  'youtube',
  'appleMusic',
  'bilibili',
  'ximalaya',
  'douyin',
  'hongguo',
  'netease',
  'player',
] as const
export type MediaApp = (typeof MEDIA_APPS)[number]

export function mediaApp(type: string): MediaApp | undefined {
  return MEDIA_APPS.find(
    (app) => type === app || ['Answer', 'Playback', 'Account', 'SignIn'].some((suffix) => type === app + suffix),
  )
}

/** Reports queued by a closed page cannot modify the page opened after it. */
export class MediaGenerations {
  private instances = new Map<MediaApp, { generation: number; resident: boolean }>()

  accept(message: { type: string; generation?: number; app?: MediaApp; resident?: boolean }): boolean {
    if (
      message.type === 'mediaResource' &&
      message.app &&
      message.generation !== undefined &&
      message.resident !== undefined
    ) {
      const previous = this.instances.get(message.app)
      if (previous && message.generation < previous.generation) return false
      this.instances.set(message.app, { generation: message.generation, resident: message.resident })
      return true
    }
    const app = mediaApp(message.type)
    const instance = app && this.instances.get(app)
    return (
      !instance ||
      (instance.resident && (message.generation === undefined || message.generation === instance.generation))
    )
  }

  generation(app: MediaApp): number | undefined {
    const instance = this.instances.get(app)
    // Commands in a fresh start batch precede the host's opened acknowledgement.
    return instance?.resident ? instance.generation : undefined
  }
}
