/**
 * The game's languages by their own names, as the game's language menu and iOS's list name them: each in
 * itself (Deutsch, Türkçe, 日本語), a language the game has twice told apart by where or how it's written.
 */
const OWN_NAMES: Record<string, string> = {
  en_us: 'English',
  zh_cn: '简体中文',
}

/** BCP 47 tags for the game's codes, to name a language in another (`Intl.DisplayNames`). */
const TAGS: Record<string, string> = {
  en_us: 'en-US',
  zh_cn: 'zh-Hans',
}

/** The game's languages, by their own names in alphabetical order (Latin letters first). */
export function gameLanguages(): string[] {
  return Object.keys(OWN_NAMES).sort((a, b) => OWN_NAMES[a].localeCompare(OWN_NAMES[b], 'en'))
}

/** A language's own name (`de_de`: Deutsch); the code itself for one the game doesn't have. */
export function ownName(code: string): string {
  return OWN_NAMES[code] ?? code
}

/** A language's name in the language of `locale` (`de_de` in `tr-TR`: Almanca); `null` where that has no
 * name for it, or it's the language itself. */
export function nameIn(code: string, locale: string): string | null {
  const tag = TAGS[code] ?? code.slice(0, 2)
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language', languageDisplay: 'dialect' }).of(tag)
    if (!name || name === tag || name === OWN_NAMES[code]) return null
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
  } catch {
    return null
  }
}
