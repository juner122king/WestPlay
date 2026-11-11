import { afterEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { buildingMeshes } from './buildingMeshes'
import { raisedRoads } from './raisedRoads'

afterEach(() => vi.unstubAllGlobals())

function mapStub() {
  const on = vi.fn()
  const off = vi.fn()
  const repaint = vi.fn()
  const map = { on, off, triggerRepaint: repaint } as unknown as maplibregl.Map
  return { map, on, off, repaint }
}

describe('custom map resource teardown', () => {
  for (const [name, make] of [
    ['buildings', buildingMeshes],
    ['raised roads', raisedRoads],
  ] as const) {
    it(`${name}: aborts pending requests and unregisters layer restoration exactly once`, () => {
      const fetcher = vi.fn(() => new Promise<Response>(() => {}))
      vi.stubGlobal('fetch', fetcher)
      const { map, on, off } = mapStub()
      const resource = make(map, '/map', () => 'dark')
      const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal!
      expect(signal.aborted).toBe(false)
      const restore = on.mock.calls.find(([event]) => event === 'style.load')![1]
      resource.dispose()
      expect(signal.aborted).toBe(true)
      expect(off).toHaveBeenCalledWith('style.load', restore)
      resource.dispose()
      expect(off).toHaveBeenCalledTimes(1)
    })
  }

  it('ignores a building index which finishes after disposal', async () => {
    let resolve!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done
          }),
      ),
    )
    const { map, repaint } = mapStub()
    const resource = buildingMeshes(map, '/map', () => 'dark')
    resource.dispose()
    resolve({ ok: true, json: async () => [[1, 2]] } as Response)
    await new Promise((done) => setTimeout(done, 0))
    expect(resource.stats().known).toBe(-1)
    expect(repaint).not.toHaveBeenCalled()
  })
})
