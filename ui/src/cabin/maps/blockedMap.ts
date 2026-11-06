/**
 * What the Maps app says instead of the map when the player plays on a map WestPlay doesn't allow (the host
 * tells: a map by HVT, Heavy Vehicles Turkey), in the game's language: every language the game has, by
 * its own codes (`locale/<code>` in its archives). HVT and WestPlay are names, the same in every language.
 * The game shows Silesian players Polish (pl_si), and so does this.
 */
export const HVT_MAP_MESSAGES: Record<string, string> = {
  en_us: 'Maps by HVT are not allowed in WestPlay. Contact WestPlay to learn more.',
  zh_cn: 'WestPlay 不允许使用 HVT 的地图。如需了解详情，请联系 WestPlay。',
}

/** The message in the game's `language`, or English for one not listed (a mod's). */
export function hvtMapMessage(language: string | null): string {
  return HVT_MAP_MESSAGES[language ?? ''] ?? HVT_MAP_MESSAGES.en_us
}
