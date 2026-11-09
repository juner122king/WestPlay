/**
 * Automotive In-Cabin Fullscreen Freight HUD Logic & Calculation Engine
 * Contains strictly the domain models and calculations required for:
 * - Route progress & delivery buffer margin
 * - Cargo manifest formatting & unit rate calculation
 * - Vehicle health & individual component wear evaluation
 * - Driver HOS fatigue countdown & journey Gantt timeline simulation
 */

/** Calculates unit rate earnings (€/km or $/mi). */
export function calculateRate(income: number, plannedKm: number, isMph: boolean): string {
  if (plannedKm <= 0 || income <= 0) return '--'
  const distance = isMph ? plannedKm * 0.621371 : plannedKm
  const rate = income / distance
  return rate.toFixed(1)
}

/** Formats cargo mass for display in metric tonnes/kg or imperial lbs. */
export function formatCargoMass(kg: number, isMph: boolean): string {
  if (kg <= 0) return '--'
  if (isMph) {
    const lbs = Math.round(kg * 2.20462)
    return `${lbs.toLocaleString()} lbs`
  }
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} t`
  }
  return `${Math.round(kg)} kg`
}

/** Formats remaining game duration into localized days, hours, and minutes. */
export function formatDuration(totalMinutes: number, isZh: boolean): string {
  if (totalMinutes <= 0) return isZh ? '0 分钟' : '0 min'
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const mins = Math.floor(totalMinutes % 60)

  if (isZh) {
    if (days > 0) return `${days}天 ${hours}小时 ${mins}分`
    if (hours > 0) return `${hours}小时 ${mins}分`
    return `${mins}分钟`
  }
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins} min`
}

export type BufferStatus = 'ample' | 'tight' | 'late'

export interface BufferResult {
  bufferMinutes: number
  status: BufferStatus
  remainingText: string
  /** Safety margin ratio compared to route navigation time (0..1+). */
  bufferRatio: number
}

/**
 * Evaluates delivery time margin by comparing remaining deadline window
 * against active GPS navigation route time.
 */
export function evaluateBuffer(
  deliveryTime: number,
  gameTime: number,
  navTimeSeconds: number,
  isZh: boolean,
): BufferResult {
  const windowMinutes = deliveryTime - gameTime
  const navMinutes = Math.ceil(Math.max(0, navTimeSeconds) / 60)
  const bufferMinutes = windowMinutes - navMinutes

  let status: BufferStatus = 'ample'
  if (windowMinutes <= 0 || bufferMinutes < 0) {
    status = 'late'
  } else if (bufferMinutes <= 75) {
    status = 'tight'
  }

  const remainingText = formatDuration(Math.max(0, windowMinutes), isZh)
  const total = Math.max(1, navMinutes + Math.max(0, bufferMinutes))
  const bufferRatio = Math.max(0, Math.min(1, Math.max(0, bufferMinutes) / total))

  return { bufferMinutes, status, remainingText, bufferRatio }
}

export type WearGrade = 'good' | 'warn' | 'bad'

export interface ComponentWear {
  name: string
  fraction: number
  percentText: string
  grade: WearGrade
}

/** Evaluates component wear condition (0.0 = brand new, 1.0 = ruined). */
export function evaluateWear(name: string, rawFraction: number | undefined): ComponentWear {
  const fraction = Math.max(0, Math.min(1, rawFraction ?? 0))
  const percentText = `${(fraction * 100).toFixed(1)}%`
  let grade: WearGrade = 'good'
  if (fraction >= 0.2) {
    grade = 'bad'
  } else if (fraction >= 0.06) {
    grade = 'warn'
  }
  return { name, fraction, percentText, grade }
}

export interface HosEvaluation {
  restDueMinutes: number
  restDueText: string
  fatiguePercent: number
  level: 'fresh' | 'normal' | 'tired'
  needRestEnRoute: boolean
}

/** Evaluates driver HOS / fatigue status and generates smart rest advice. */
export function evaluateHos(nextRestStop: number | undefined, navTimeSeconds: number, isZh: boolean): HosEvaluation {
  const restDueMinutes = nextRestStop ?? 0
  // Standard max driving cycle: ~11h (660 min)
  const maxCycle = 660
  const fatigueRatio = Math.max(0, Math.min(1, (maxCycle - Math.max(0, restDueMinutes)) / maxCycle))
  const fatiguePercent = Math.round(fatigueRatio * 100)

  let level: 'fresh' | 'normal' | 'tired' = 'normal'
  if (restDueMinutes > 300) {
    level = 'fresh'
  } else if (restDueMinutes <= 90) {
    level = 'tired'
  }

  const navMinutes = Math.ceil(Math.max(0, navTimeSeconds) / 60)
  // Need rest if remaining driving hours are less than destination route + 30 min buffer
  const needRestEnRoute = restDueMinutes > 0 && navMinutes > 0 && restDueMinutes <= navMinutes + 30
  const restDueText = restDueMinutes > 0 ? formatDuration(restDueMinutes, isZh) : isZh ? '已达上限' : 'Overdue'

  return {
    restDueMinutes,
    restDueText,
    fatiguePercent,
    level,
    needRestEnRoute,
  }
}

export interface RouteProgress {
  progressRatio: number
  progressPercent: number
  distanceCoveredKm: number
  distanceRemainingKm: number
  plannedDistanceKm: number
  coveredText: string
  remainingText: string
  totalText: string
}

/**
 * Calculates current journey route progress percentage and dual odometer figures.
 */
export function calculateRouteProgress(
  plannedDistanceKm: number,
  navigationDistanceMeters: number | undefined,
  isMph: boolean,
): RouteProgress {
  const plannedMeters = Math.max(0, plannedDistanceKm * 1000)
  const navMeters = Math.max(0, navigationDistanceMeters ?? 0)
  const distanceRemainingKm = navMeters / 1000

  // Calculate covered distance
  const distanceCoveredMeters =
    plannedMeters > 0 && navMeters > 0 ? Math.max(0, Math.min(plannedMeters, plannedMeters - navMeters)) : 0
  const distanceCoveredKm = distanceCoveredMeters / 1000
  const progressRatio = plannedMeters > 0 ? distanceCoveredMeters / plannedMeters : 0
  const progressPercent = Math.round(progressRatio * 100)

  const distUnit = isMph ? 'mi' : 'km'
  const scale = isMph ? 0.621371 : 1
  const coveredText = `${Math.round(distanceCoveredKm * scale).toLocaleString()} ${distUnit}`
  const remainingText = navMeters > 0 ? `${Math.round(distanceRemainingKm * scale).toLocaleString()} ${distUnit}` : '--'
  const totalText = `${Math.round(plannedDistanceKm * scale).toLocaleString()} ${distUnit}`

  return {
    progressRatio,
    progressPercent,
    distanceCoveredKm,
    distanceRemainingKm,
    plannedDistanceKm,
    coveredText,
    remainingText,
    totalText,
  }
}

export interface JourneyTimeline {
  canDirectDeliver: boolean
  canDeliverAfterRest: boolean
  etaDirectMinutes: number
  etaWithRestMinutes: number
  restMarginMinutes: number
  simulatedRestMinutes: number
  restDueMinutes: number
  navMinutes: number
  windowMinutes: number
  /** Normalized ratios (0..1) for timeline segment visualization. */
  navRatio: number
  restRatio: number
  bufferRatio: number
}

/**
 * Simulates journey schedule with an optional 8-hour (480 min) tachograph rest stop.
 */
export function calculateJourneyTimeline(
  gameTime: number,
  navTimeSeconds: number,
  nextRestStop: number | undefined,
  deliveryTime: number,
): JourneyTimeline {
  const navMinutes = Math.ceil(Math.max(0, navTimeSeconds) / 60)
  const restDueMinutes = Math.max(0, nextRestStop ?? 0)
  const windowMinutes = Math.max(0, deliveryTime - gameTime)
  const simulatedRestMinutes = 480 // 8 hours standard rest

  const etaDirectMinutes = gameTime + navMinutes
  const etaWithRestMinutes = gameTime + navMinutes + simulatedRestMinutes
  const restMarginMinutes = deliveryTime - etaWithRestMinutes

  const canDirectDeliver = restDueMinutes >= navMinutes
  const canDeliverAfterRest = restMarginMinutes >= 0

  const totalHorizon = Math.max(windowMinutes, navMinutes + simulatedRestMinutes, 1)
  const navRatio = Math.min(0.65, Math.max(0.15, navMinutes / totalHorizon))
  const restRatio = Math.min(0.45, Math.max(0.15, simulatedRestMinutes / totalHorizon))
  const bufferRatio = Math.max(0, 1 - navRatio - restRatio)

  return {
    canDirectDeliver,
    canDeliverAfterRest,
    etaDirectMinutes,
    etaWithRestMinutes,
    restMarginMinutes,
    simulatedRestMinutes,
    restDueMinutes,
    navMinutes,
    windowMinutes,
    navRatio,
    restRatio,
    bufferRatio,
  }
}

export type OverallHealthRating = 'excellent' | 'good' | 'fair' | 'critical'

export interface OverallVehicleHealth {
  score: number // 0 to 100
  rating: OverallHealthRating
  maxWearComponent: string
  maxWearPercent: string
}

/**
 * Computes an executive composite vehicle health score from all component wear.
 */
export function calculateOverallHealth(
  truckItems: ComponentWear[],
  trailerItems: ComponentWear[],
): OverallVehicleHealth {
  const allItems = [...truckItems, ...trailerItems]
  if (allItems.length === 0) {
    return { score: 100, rating: 'excellent', maxWearComponent: '--', maxWearPercent: '0%' }
  }

  let totalWear = 0
  let maxWear = 0
  let maxComponent = allItems[0].name

  for (const item of allItems) {
    totalWear += item.fraction
    if (item.fraction > maxWear) {
      maxWear = item.fraction
      maxComponent = item.name
    }
  }

  const avgWear = totalWear / allItems.length
  // Score drops faster if a single critical component has high wear
  const penalty = Math.max(avgWear * 0.6, maxWear * 0.8)
  const score = Math.max(0, Math.min(100, Math.round((1 - penalty) * 100)))

  let rating: OverallHealthRating = 'excellent'
  if (score < 65 || maxWear >= 0.2) {
    rating = 'critical'
  } else if (score < 80 || maxWear >= 0.1) {
    rating = 'fair'
  } else if (score < 94 || maxWear >= 0.05) {
    rating = 'good'
  }

  return {
    score,
    rating,
    maxWearComponent: maxComponent,
    maxWearPercent: `${(maxWear * 100).toFixed(1)}%`,
  }
}
