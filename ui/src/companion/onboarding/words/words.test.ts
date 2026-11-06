import { describe, expect, it } from 'vitest'
import { HVT_MAP_MESSAGES } from '../../../cabin/maps/blockedMap'
import { count, languageOf, languages, type Plural, type Words, wordsFor } from '.'

/** Every count's words in `words`. */
function plurals(words: Words): [string, Plural][] {
  return [
    ['summary.dlcs', words.summary.dlcs],
    ['check.profileCount', words.check.profileCount],
    ['check.unreadable', words.check.unreadable],
  ]
}

/** Every text in `words`, by its path. */
function texts(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => texts(inner, path ? `${path}.${key}` : key))
  }
  return []
}

describe('the onboarding’s words', () => {
  it('are there in each of the game’s languages', () => {
    expect(languages()).toEqual(Object.keys(HVT_MAP_MESSAGES).sort())
  })

  it.each(languages())('%s has a form for every count it shows, by its plural rules', (code) => {
    const words = wordsFor(code)
    const rules = new Intl.PluralRules(words.locale)
    for (const [name, plural] of plurals(words)) {
      for (let n = 0; n <= 150; n++) {
        const category = rules.select(n)
        expect(plural[category], `${name} for ${n} (${category})`).toBeDefined()
        expect(count(words, plural, n)).toContain(new Intl.NumberFormat(words.locale).format(n))
      }
    }
  })

  it.each(languages())('%s fills in what it names, and leaves nothing empty', (code) => {
    const words = wordsFor(code)
    for (const [path, text] of texts(words)) expect(text.trim(), path).not.toBe('')
    expect(words.summary.version).toContain('{version}')
    expect(words.check.withMods).toContain('{map}')
    expect(words.check.withMods).toContain('{mods}')
    // One step to each of the finish screen's three columns.
    expect(words.launch.steps).toHaveLength(3)
  })

  it('takes Windows’ language, as the game has it', () => {
    expect(languageOf(['en-US'])).toBe('en_us')
    expect(languageOf(['en-GB'])).toBe('en_us')
    expect(languageOf(['en'])).toBe('en_us')
    expect(languageOf(['zh-CN'])).toBe('zh_cn')
    expect(languageOf(['zh'])).toBe('zh_cn')
    // Unsupported languages fall back to English.
    expect(languageOf(['tr-TR'])).toBe('en_us')
    expect(languageOf(['de-AT'])).toBe('en_us')
    expect(languageOf(['es-ES'])).toBe('en_us')
    expect(languageOf(['xh-ZA', 'zh-CN'])).toBe('zh_cn')
    expect(languageOf(['xh-ZA'])).toBe('en_us')
  })
})
