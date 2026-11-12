export function mapCacheNotice(state: string, cached: boolean, language: string | null): string | null {
  if (state === 'ready' || state === 'unknown' || state === 'noGame' || state === 'notAllowed') return null
  const zh = language?.startsWith('zh') ?? false
  if (cached) return zh ? '正在使用旧地图，可能与游戏不一致' : 'Using an older map; roads may differ from the game'
  return zh
    ? '尚未准备地图，可在 WestPlay 地图页面选择准备'
    : 'Map not prepared. Choose Prepare in WestPlay’s Map page.'
}
