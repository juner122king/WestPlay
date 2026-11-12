import { useLive } from '../state/store'
import { mapCacheNotice } from './cacheNotice'

export function MapCacheNotice() {
  const preparation = useLive((s) => s.mapPreparation)
  const language = useLive((s) => s.chosenLanguage ?? s.gameLanguage)
  const text = preparation && mapCacheNotice(preparation.state, preparation.cached, language)
  return text ? (
    <div className="map-cache-notice" data-empty={!preparation?.cached || undefined} role="status">
      {text}
    </div>
  ) : null
}
