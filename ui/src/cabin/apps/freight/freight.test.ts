import { describe, expect, it } from 'vitest'
import {
  calculateJourneyTimeline,
  calculateOverallHealth,
  calculateRate,
  calculateRouteProgress,
  evaluateBuffer,
  evaluateHos,
  evaluateWear,
  formatCargoMass,
  formatDuration,
} from './freight'

describe('freight logic helpers', () => {
  it('calculates kilometer and mile rates accurately', () => {
    expect(calculateRate(10000, 500, false)).toBe('20.0')
    expect(calculateRate(0, 500, false)).toBe('--')
    expect(calculateRate(10000, 0, false)).toBe('--')
    const miRate = calculateRate(10000, 500, true)
    expect(parseFloat(miRate)).toBeGreaterThan(20) // in $/mi it is larger than €/km
  })

  it('formats cargo mass in metric tonnes and imperial pounds', () => {
    expect(formatCargoMass(24500, false)).toBe('24.5 t')
    expect(formatCargoMass(800, false)).toBe('800 kg')
    expect(formatCargoMass(1000, true)).toContain('lbs')
    expect(formatCargoMass(0, false)).toBe('--')
  })

  it('formats duration correctly in Chinese and English', () => {
    expect(formatDuration(1500, true)).toBe('1天 1小时 0分')
    expect(formatDuration(1500, false)).toBe('1d 1h 0m')
    expect(formatDuration(135, true)).toBe('2小时 15分')
    expect(formatDuration(45, true)).toBe('45分钟')
  })

  it('evaluates delivery buffer margins correctly', () => {
    // 3 hours left, 1 hour navigation -> 2 hours buffer (ample)
    const ample = evaluateBuffer(1000, 820, 3600, true)
    expect(ample.status).toBe('ample')
    expect(ample.bufferMinutes).toBe(120)
    expect(ample.bufferRatio).toBeGreaterThan(0.5)

    // 1 hour 10 min left, 1 hour navigation -> 10 min buffer (tight)
    const tight = evaluateBuffer(1000, 930, 3600, true)
    expect(tight.status).toBe('tight')
    expect(tight.bufferMinutes).toBe(10)

    // Overdue or impossible
    const late = evaluateBuffer(1000, 950, 7200, true)
    expect(late.status).toBe('late')
    expect(late.bufferMinutes).toBeLessThan(0)
    expect(late.bufferRatio).toBe(0)
  })

  it('evaluates component wear status with clean thresholds', () => {
    const fresh = evaluateWear('Engine', 0.02)
    expect(fresh.grade).toBe('good')
    expect(fresh.percentText).toBe('2.0%')

    const warning = evaluateWear('Transmission', 0.09)
    expect(warning.grade).toBe('warn')

    const damaged = evaluateWear('Wheels', 0.25)
    expect(damaged.grade).toBe('bad')

    const empty = evaluateWear('Chassis', undefined)
    expect(empty.fraction).toBe(0)
    expect(empty.grade).toBe('good')
  })

  it('evaluates HOS fatigue and generates rest recommendations', () => {
    // 8 hours available, 2 hours trip -> fresh, no need to rest en route
    const ok = evaluateHos(480, 7200, true)
    expect(ok.level).toBe('fresh')
    expect(ok.needRestEnRoute).toBe(false)

    // 1 hour available, 2 hours trip -> tired, must rest en route
    const needRest = evaluateHos(60, 7200, true)
    expect(needRest.level).toBe('tired')
    expect(needRest.needRestEnRoute).toBe(true)
  })

  it('calculates route progress metrics', () => {
    // 1000km planned, 400km left (400,000 meters)
    const prog = calculateRouteProgress(1000, 400000, false)
    expect(prog.progressPercent).toBe(60)
    expect(prog.distanceCoveredKm).toBe(600)
    expect(prog.distanceRemainingKm).toBe(400)
    expect(prog.coveredText).toBe('600 km')
    expect(prog.remainingText).toBe('400 km')

    // Imperial conversion
    const progMph = calculateRouteProgress(1000, 400000, true)
    expect(progMph.coveredText).toContain('mi')
    expect(progMph.remainingText).toContain('mi')

    // Edge cases: 0 planned or no navigation
    const zeroProg = calculateRouteProgress(0, undefined, false)
    expect(zeroProg.progressPercent).toBe(0)
    expect(zeroProg.remainingText).toBe('--')
  })

  it('simulates journey timeline with rest periods', () => {
    // Game time: 1000, Nav: 2 hours (120 min, 7200s), Rest in: 5 hours (300 min), Deadline: 1800
    // Direct ETA: 1120. With 8h rest (480 min): ETA 1600. Deadline: 1800 -> On time!
    const plan = calculateJourneyTimeline(1000, 7200, 300, 1800)
    expect(plan.canDirectDeliver).toBe(true)
    expect(plan.canDeliverAfterRest).toBe(true)
    expect(plan.etaDirectMinutes).toBe(1120)
    expect(plan.etaWithRestMinutes).toBe(1600)
    expect(plan.restMarginMinutes).toBe(200)

    // Very tight deadline: Deadline 1500 -> Rest makes it late!
    const tightPlan = calculateJourneyTimeline(1000, 7200, 300, 1500)
    expect(tightPlan.canDeliverAfterRest).toBe(false)
    expect(tightPlan.restMarginMinutes).toBeLessThan(0)
  })

  it('calculates composite vehicle health score', () => {
    const truckItems = [evaluateWear('Engine', 0.01), evaluateWear('Transmission', 0.02), evaluateWear('Chassis', 0.01)]
    const trailerItems = [evaluateWear('Trailer Body', 0.02)]
    const healthy = calculateOverallHealth(truckItems, trailerItems)
    expect(healthy.score).toBeGreaterThan(90)
    expect(healthy.rating).toBe('excellent')

    const damagedTruck = [
      evaluateWear('Engine', 0.28), // ruinous damage
      evaluateWear('Transmission', 0.1),
    ]
    const bad = calculateOverallHealth(damagedTruck, [])
    expect(bad.rating).toBe('critical')
    expect(bad.maxWearComponent).toBe('Engine')
  })
})
