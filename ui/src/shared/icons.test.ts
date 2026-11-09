import { describe, expect, it } from 'vitest'
import { type AppIconRole, appIcon } from './icons'

// The icon files there are (public/icons/westplay), as Vite sees them.
const RAW_FILES = import.meta.glob<string>('../../public/icons/westplay/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const FILES = Object.keys(RAW_FILES).map((path) => path.replace('../../public', ''))

const ROLES: AppIconRole[] = [
  'maps',
  'music',
  'bilibili',
  'ximalaya',
  'netease',
  'podcasts',
  'messages',
  'phone',
  'calendar',
  'settings',
  'weather',
  'youtube',
  'player',
  'freight',
]

describe('appIcon', () => {
  it('gives every role WestPlay’s icon in the look asked for, and each file is there', () => {
    for (const role of ROLES) {
      for (const look of ['light', 'dark'] as const) {
        expect(FILES).toContain(appIcon(role, look))
      }
    }
    expect(appIcon('bilibili', 'dark')).toBe('/icons/westplay/bilibili.dark.svg')
    expect(appIcon('ximalaya', 'dark')).toBe('/icons/westplay/ximalaya.dark.svg')
    expect(appIcon('netease', 'dark')).toBe('/icons/westplay/netease.dark.svg')
  })

  it('ensures each role icon is well-formed XML without unclosed tags', () => {
    for (const role of ROLES) {
      for (const look of ['light', 'dark'] as const) {
        const publicPath = `../../public${appIcon(role, look)}`
        const content = RAW_FILES[publicPath]
        expect(content).toBeDefined()
        expect(content.startsWith('<svg')).toBe(true)
        expect(content.trimEnd().endsWith('</svg>')).toBe(true)

        const stack: string[] = []
        const tagRegex = /<(\/)?([a-zA-Z0-9_-]+)(?:\s+[^>]*?)?(\/?)>/g
        let match: RegExpExecArray | null
        while ((match = tagRegex.exec(content)) !== null) {
          const [full, isClose, tag, isSelfClose] = match
          if (full.startsWith('<!--') || full.startsWith('<?')) continue
          if (isSelfClose === '/') continue
          if (isClose === '/') {
            const top = stack.pop()
            expect(top).toBe(tag)
          } else {
            stack.push(tag)
          }
        }
        expect(stack).toEqual([])
      }
    }
  })
})
