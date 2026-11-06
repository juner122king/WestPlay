import type { Language as CabinLanguage } from '../state/strings'

/**
 * The keyboard's keys, as on the iPhone: standard English QWERTY keyboard used for both English
 * and Chinese (Pinyin) input.
 */

/** A keyboard, by the letters it has. */
export type Language = 'en'

interface Letters {
  rows: readonly [string, string, string]
  /** Shift's letters, where they aren't the letters in capitals: key for key. */
  shifted?: readonly [string, string, string]
  /** Capitals by this language's rules. */
  locale: string
  /** What typing a letter does to the text, where it isn't adding it. */
  typed?: (text: string, char: string) => string
  /** What delete does, where it isn't taking the last character away (`null`: as usual). */
  deleted?: (text: string) => string | null
}

const QWERTY = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

const KEYBOARD_EN: Letters = { rows: QWERTY, locale: 'en-US' }

const KEYBOARDS: Record<string, Letters> = {
  en: KEYBOARD_EN,
}

const getKeyboard = (language: string): Letters => KEYBOARDS[language] ?? KEYBOARD_EN

/** The keyboard for the cabin's language: standard English QWERTY. */
export function keyboardLanguage(_language: CabinLanguage): Language {
  return 'en'
}

/** Which set of keys shows. */
export type Layer = 'letters' | 'numbers' | 'symbols'

/** What the return key says it does: search for what was typed, go there, or simply finish. */
export type ReturnKind = 'search' | 'go' | 'done'

export type Key =
  | { kind: 'char'; char: string }
  | { kind: 'shift' }
  | { kind: 'delete' }
  /** 123, #+= or ABC: another layer. */
  | { kind: 'layer'; to: Layer }
  /** The other keyboard's letters: the language's own and English's. */
  | { kind: 'globe' }
  | { kind: 'space' }
  | { kind: 'return' }
  /** Puts the keyboard away. */
  | { kind: 'hide' }

const NUMBERS = ['1234567890', '-/:;()€&@"', ".,?!'"]
const SYMBOLS = ['[]{}#%^*+=', '_\\|~<>$£¥•', ".,?!'"]

const chars = (row: string): Key[] => Array.from(row, (char) => ({ kind: 'char', char }))

/** The keys of a layer, row by row: three rows of characters, then the bottom row (the globe only where
 * there's another keyboard to go to). */
export function keyRows(language: Language, layer: Layer, globe = language !== 'en'): Key[][] {
  const keyboard = getKeyboard(language)
  const rows = layer === 'letters' ? keyboard.rows : layer === 'numbers' ? NUMBERS : SYMBOLS
  const [top, middle, bottom] = rows.map(chars)
  // Left of the third row: shift on letters, the other symbols layer on the others.
  const left: Key =
    layer === 'letters' ? { kind: 'shift' } : { kind: 'layer', to: layer === 'numbers' ? 'symbols' : 'numbers' }
  const switcher: Key = layer === 'letters' ? { kind: 'layer', to: 'numbers' } : { kind: 'layer', to: 'letters' }
  return [
    top,
    middle,
    [left, ...bottom, { kind: 'delete' }],
    [switcher, ...(globe ? [{ kind: 'globe' } as Key] : []), { kind: 'space' }, { kind: 'hide' }, { kind: 'return' }],
  ]
}

/** A letter with shift on, by its keyboard: its own shifted letter, or its capital by the language's rules. */
export function capital(char: string, language: Language): string {
  const { rows, shifted, locale } = getKeyboard(language)
  if (shifted) {
    for (let row = 0; row < 3; row++) {
      const at = Array.from(rows[row]).indexOf(char)
      if (at >= 0) return Array.from(shifted[row])[at]
    }
  }
  return char.toLocaleUpperCase(locale)
}

/** The other keyboard, for the globe key: English from the language's own, the language's own from English. */
export function otherLanguage(language: Language, own: Language): Language {
  return language === own ? 'en' : own
}

/** The text after typing `char` on `language`'s keyboard. */
export function typedWith(language: Language, text: string, char: string): string {
  const typed = getKeyboard(language).typed
  return typed ? typed(text, char) : text + char
}

/** The text after delete on `language`'s keyboard, or `null` where delete takes the last character away. */
export function deletedWith(language: Language, text: string): string | null {
  return getKeyboard(language).deleted?.(text) ?? null
}
