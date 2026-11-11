import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpeedDisplayView } from './SpeedDisplay'

const view = (props: Partial<Parameters<typeof SpeedDisplayView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(SpeedDisplayView, {
      speed: 90,
      limit: 90,
      mph: false,
      american: false,
      limitLabel: 'Speed limit 90',
      ...props,
    }),
  )
describe('CabPlay speed capsule', () => {
  it('shows zero speed and an explicit unit when stopped', () => {
    expect(view({ speed: 0 })).toContain('class="speed-badge">0</span>')
    expect(view({ speed: 0 })).toContain('km/h')
  })
  it('chooses the sign by game, independently of speed units', () => {
    expect(view({ american: true, mph: false })).toContain('SPEED<br/>LIMIT')
    expect(view({ american: false, mph: true })).not.toContain('SPEED<br/>LIMIT')
    expect(view({ american: false, mph: true })).toContain('mph')
  })
  it('omits an unknown limit without hiding the actual speed', () => {
    const html = view({ limit: 0 })
    expect(html).not.toContain('class="speed-limit"')
    expect(html).toContain('class="speed-badge">90</span>')
  })
  it('only colours the actual speed when over the limit', () => {
    expect(view({ speed: 91 })).toContain('speed-badge over')
    expect(view({ speed: 90 })).not.toContain('speed-badge over')
    expect(view({ speed: 91 })).toContain('class="speed-limit"')
  })
})
