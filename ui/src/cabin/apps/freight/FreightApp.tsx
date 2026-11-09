import { useMemo } from 'react'
import { formatDeadline } from '../../dashboard/destination'
import { useClockStyle } from '../../state/hooks'
import { useLive } from '../../state/store'
import { useLanguage, useText } from '../../state/text'
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
import {
  BedRestGlyph,
  CargoBoxGlyph,
  ClockRingGlyph,
  EngineCheckGlyph,
  NavigationArrowGlyph,
  ShieldAlertGlyph,
  ShieldCheckGlyph,
  SpeedGlyph,
  TachographRing,
  TruckLineGlyph,
} from './glyphs'
import './freight.css'

/**
 * Automotive In-Cabin Fullscreen Freight HUD Cockpit
 * Designed specifically for vehicle displays:
 * - 4 core quadrants: Route Process, Cargo Details, Vehicle Condition, HOS Fatigue.
 * - Vehicle condition ONLY displays overall health and component wear bars.
 * - Spacious, elegant, breathable typography and generous padding.
 */
export function FreightApp() {
  const text = useText()
  const language = useLanguage()
  const isZh = language === 'zh_cn' || language.startsWith('zh')
  const clockStyle = useClockStyle()

  // Live simulator telemetry
  const rawJob = useLive((state) => state.job)
  const telemetry = useLive((state) => state.telemetry)
  const truck = useLive((state) => state.truck)
  const mph = useLive((state) => state.mph)

  const hasLiveJob = Boolean(rawJob && rawJob.active)

  // Job data: live game job or realistic standby fallback
  const job = useMemo(() => {
    if (hasLiveJob) return rawJob!
    return {
      active: true,
      cargoLoaded: true,
      special: false,
      cargo: isZh ? '堆场卡车' : 'Yard Truck',
      cargoMass: 18500,
      sourceCity: 'Las Vegas',
      sourceCompany: 'Apade Logistics',
      destinationCity: 'Los Angeles',
      destinationCompany: 'LA Seaport',
      deliveryTime: (telemetry?.gameTime ?? 823) + 480, // delivery window
      plannedDistanceKm: 531, // ~330 miles
      income: 31832,
    }
  }, [hasLiveJob, rawJob, isZh, telemetry?.gameTime])

  const gameTime = telemetry?.gameTime ?? 823
  const navSeconds = telemetry?.navigationTime ?? 24480 // ~6h 48m
  const navDistance = telemetry?.navigationDistance ?? 531000 // 531 km / 330 mi

  // Route Progress
  const progress = useMemo(() => {
    if (!job) {
      return {
        progressRatio: 0,
        progressPercent: 0,
        distanceCoveredKm: 0,
        distanceRemainingKm: 0,
        plannedDistanceKm: 0,
        coveredText: '--',
        remainingText: '--',
        totalText: '--',
      }
    }
    const navMeters = hasLiveJob ? telemetry?.navigationDistance : navDistance
    return calculateRouteProgress(job.plannedDistanceKm, navMeters, mph)
  }, [job, hasLiveJob, telemetry?.navigationDistance, navDistance, mph])

  // Delivery Buffer Margin
  const buffer = useMemo(() => {
    if (!job) {
      return { bufferMinutes: 0, status: 'ample' as const, remainingText: '--', bufferRatio: 0 }
    }
    const navSec = hasLiveJob ? (telemetry?.navigationTime ?? 0) : navSeconds
    return evaluateBuffer(job.deliveryTime, gameTime, navSec, isZh)
  }, [job, hasLiveJob, telemetry?.navigationTime, navSeconds, gameTime, isZh])

  // Cargo & payout formatting
  const cargoMassText = job ? formatCargoMass(job.cargoMass, mph) : '--'
  const payoutStr = job && job.income > 0 ? `${job.income.toLocaleString()} €` : '--'
  const rateUnit = mph ? (isZh ? '€/mi' : '€/mi') : isZh ? '€/km' : '€/km'
  const rateStr = job ? `${calculateRate(job.income, job.plannedDistanceKm, mph)} ${rateUnit}` : '--'
  const deadlineStr = job ? formatDeadline(job.deliveryTime, gameTime, text.days, clockStyle) : '--'

  const cargoDamage = telemetry?.cargoDamage ?? 0
  const isSafeCargo = cargoDamage <= 0.001
  const damagePercentText = `${(cargoDamage * 100).toFixed(1)}%`
  const estimatedDeduction = job && job.income > 0 && cargoDamage > 0.001 ? Math.round(job.income * cargoDamage) : 0

  // Vehicle Condition: Individual Component Wear
  const truckWears = [
    evaluateWear(isZh ? '发动机' : 'Engine', telemetry?.wearEngine ?? 0.0),
    evaluateWear(isZh ? '变速箱' : 'Gearbox', telemetry?.wearTransmission ?? 0.0),
    evaluateWear(isZh ? '驾驶室' : 'Cabin', telemetry?.wearCabin ?? 0.0),
    evaluateWear(isZh ? '底盘' : 'Chassis', telemetry?.wearChassis ?? 0.0),
    evaluateWear(isZh ? '轮胎' : 'Wheels', telemetry?.wearWheels ?? 0.0),
    evaluateWear(isZh ? '挂车货厢' : 'Trailer', telemetry?.wearTrailerBody ?? 0.0),
  ]

  const hasTrailer =
    telemetry?.wearTrailerChassis != null || telemetry?.wearTrailerWheels != null || Boolean(job?.active)

  const overallHealth = calculateOverallHealth(truckWears.slice(0, 5), hasTrailer ? [truckWears[5]] : [])

  // HOS Driver & Fatigue Planning
  const nextRestStopMinutes = telemetry?.nextRestStop ?? 804 // default 13h 24m
  const hos = evaluateHos(nextRestStopMinutes, navSeconds, isZh)

  const timeline = calculateJourneyTimeline(
    gameTime,
    navSeconds,
    nextRestStopMinutes,
    job?.deliveryTime ?? gameTime + 480,
  )

  // Truck Model
  const truckTitle = truck ? `${truck.brand} ${truck.name}` : 'Volvo VNL'

  return (
    <section className="app-panel freight-app logitrack-fullscreen-hud" aria-label={text.freight.title}>
      {/* 2x2 Clean, Spacious Cockpit HUD Grid */}
      <main className="hud-main-grid">
        {/* =================================================================
            1. 装卸地流程状态 (Pickup / Delivery Process & Route Progress)
            ================================================================= */}
        <section className="hud-card card-route-process">
          <div className="card-header-line">
            <div className="card-title-badge">
              <NavigationArrowGlyph size={20} color="#38bdf8" />
              <h2 className="panel-title">{isZh ? '装卸地流程状态' : 'Route & Delivery Progress'}</h2>
            </div>
            <span className={`status-pill ${job?.cargoLoaded ? 'in-transit' : 'pickup'}`}>
              {job?.cargoLoaded ? (isZh ? '运送中' : 'In Transit') : isZh ? '前往装货' : 'To Pickup'}
            </span>
          </div>

          <div className="process-body">
            {/* Origin -> Destination Stepper Row */}
            <div className="process-stepper-row">
              <div className="step-node origin">
                <span className="node-kicker">{isZh ? '装货地' : 'Pickup'}</span>
                <div className="node-city">{job?.sourceCity}</div>
                <div className="node-company">{job?.sourceCompany || '--'}</div>
              </div>

              <div className="step-connector">
                <div className="connector-line">
                  <div
                    className="connector-active-flow"
                    style={{ width: `${Math.max(5, progress.progressPercent)}%` }}
                  />
                </div>
                <div
                  className="truck-stepper-icon"
                  style={{ left: `${Math.max(5, Math.min(95, progress.progressPercent))}%` }}
                >
                  <TruckLineGlyph size={22} />
                </div>
              </div>

              <div className="step-node destination">
                <span className="node-kicker">{isZh ? '卸货地' : 'Delivery'}</span>
                <div className="node-city">{job?.destinationCity}</div>
                <div className="node-company">{job?.destinationCompany || '--'}</div>
              </div>
            </div>

            {/* Relaxed Progress Bar and Metrics */}
            <div className="progress-metrics-block">
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progress.progressPercent}%` }} />
              </div>

              <div className="progress-stats-row">
                <div className="pstat-item">
                  <span className="pstat-label">{isZh ? '已行驶' : 'Covered'}</span>
                  <span className="pstat-val">{progress.coveredText}</span>
                </div>

                <div className="pstat-item main-percent">
                  <span className="huge-percent-num">{progress.progressPercent}%</span>
                </div>

                <div className="pstat-item right">
                  <span className="pstat-label">{isZh ? '剩余路程' : 'Remaining'}</span>
                  <span className="pstat-val highlight">{progress.remainingText}</span>
                </div>
              </div>
            </div>

            {/* Deadline & Buffer Margin */}
            <div className="deadline-buffer-strip">
              <div className="deadline-cell">
                <ClockRingGlyph size={18} />
                <div className="cell-texts">
                  <span className="cell-sub">{isZh ? '交付期限' : 'Delivery Deadline'}</span>
                  <span className="cell-main">{deadlineStr}</span>
                </div>
              </div>

              <div className={`buffer-cell buffer-${buffer.status}`}>
                <span className="buffer-kicker">{isZh ? '时效缓冲' : 'Buffer'}</span>
                <span className="buffer-val">{formatDuration(Math.max(0, buffer.bufferMinutes), isZh)}</span>
                <span className="buffer-tag">
                  {buffer.status === 'ample' && (isZh ? '时间充裕' : 'On Schedule')}
                  {buffer.status === 'tight' && (isZh ? '时效紧迫' : 'Tight')}
                  {buffer.status === 'late' && (isZh ? '延误预警' : 'Delayed')}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            2. 货物明细与收益 (Cargo Details & Payout)
            ================================================================= */}
        <section className="hud-card card-cargo-details">
          <div className="card-header-line">
            <div className="card-title-badge">
              <CargoBoxGlyph size={20} />
              <h2 className="panel-title">{isZh ? '货物明细与收益' : 'Cargo Manifest & Financials'}</h2>
            </div>
            {job?.special && (
              <span className="special-transport-badge">{isZh ? '特种大件运输' : 'Special Transport'}</span>
            )}
          </div>

          <div className="cargo-body">
            {/* Cargo Hero Information */}
            <div className="cargo-hero-row">
              <div className="cargo-primary-info">
                <span className="cargo-kicker">{isZh ? '装载货物' : 'Cargo Manifest'}</span>
                <h3 className="cargo-huge-title">{job?.cargo}</h3>
              </div>
              <div className="cargo-weight-chip">
                <span className="weight-label">{isZh ? '货物净重' : 'Net Weight'}</span>
                <span className="weight-val">{cargoMassText}</span>
              </div>
            </div>

            {/* Payout & Cargo Integrity Split Cells */}
            <div className="cargo-twin-cards">
              {/* Financial Contract Payout */}
              <div className="twin-cell payout-cell">
                <span className="twin-label">{isZh ? '合同运费收益' : 'Contract Payout'}</span>
                <div className="huge-payout-num">{payoutStr}</div>
                <div className="rate-subtext">
                  {isZh ? '结算单价' : 'Unit Rate'}: {rateStr}
                </div>
              </div>

              {/* Cargo Damage & Intact Status */}
              <div className={`twin-cell damage-cell ${isSafeCargo ? 'safe' : 'damaged'}`}>
                <span className="twin-label">{isZh ? '货物完好状态' : 'Cargo Integrity'}</span>
                <div className="damage-stat-row">
                  {isSafeCargo ? (
                    <>
                      <ShieldCheckGlyph size={24} />
                      <span className="damage-status-text safe">{isZh ? '100% 完好无损' : '100% Intact'}</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlertGlyph size={24} />
                      <span className="damage-status-text damaged">
                        {isZh ? `受损 ${damagePercentText}` : `Damage ${damagePercentText}`}
                      </span>
                    </>
                  )}
                </div>
                {estimatedDeduction > 0 ? (
                  <div className="deduction-warn">
                    {isZh
                      ? `预估扣除运费: -${estimatedDeduction.toLocaleString()} €`
                      : `Penalty: -${estimatedDeduction.toLocaleString()} €`}
                  </div>
                ) : (
                  <div className="damage-safe-sub">{isZh ? '交付无扣款风险' : 'Zero payout penalty'}</div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            3. 卡车车况检测 (Vehicle Health & Component Wear ONLY)
            ================================================================= */}
        <section className="hud-card card-vehicle-condition">
          <div className="card-header-line">
            <div className="card-title-badge">
              <EngineCheckGlyph size={20} color="#34d399" />
              <h2 className="panel-title">{isZh ? '卡车车况检测' : 'Vehicle Health & Condition'}</h2>
            </div>
            <span className="truck-model-pill">{truckTitle}</span>
          </div>

          <div className="condition-body">
            {/* Top: 综合车况核心指标 */}
            <div className="overall-health-card">
              <div className="health-lead-group">
                <div className={`health-dial-ring rating-${overallHealth.rating}`}>
                  <span className="health-score-huge">{overallHealth.score}</span>
                  <span className="health-unit">%</span>
                </div>
                <div className="health-dial-text">
                  <div className="hdial-kicker">{isZh ? '机件综合健康度' : 'Overall Health Rating'}</div>
                  <div className={`hdial-rating rating-${overallHealth.rating}`}>
                    {overallHealth.rating === 'excellent' &&
                      (isZh ? '车况优良 · 性能处于最佳状态' : 'Excellent Condition')}
                    {overallHealth.rating === 'good' && (isZh ? '车况良好 · 各机件工况正常' : 'Good Condition')}
                    {overallHealth.rating === 'fair' && (isZh ? '需要维保 · 注意核心机件磨损' : 'Needs Service')}
                    {overallHealth.rating === 'critical' &&
                      (isZh ? '严重损耗 · 建议立即进站检修' : 'Critical Wear Alert')}
                  </div>
                </div>
              </div>
              <span className={`health-status-badge rating-${overallHealth.rating}`}>
                {overallHealth.rating === 'excellent' && (isZh ? '状态极佳' : 'Optimal')}
                {overallHealth.rating === 'good' && (isZh ? '工况正常' : 'Normal')}
                {overallHealth.rating === 'fair' && (isZh ? '注意保养' : 'Warning')}
                {overallHealth.rating === 'critical' && (isZh ? '建议检修' : 'Urgent')}
              </span>
            </div>

            {/* Bottom: 各核心机件损耗条 (6 Components expanding to fully utilize space) */}
            <div className="wear-grid-list">
              {truckWears.map((item) => (
                <div key={item.name} className="wear-item">
                  <div className="witem-header">
                    <div className="witem-name-group">
                      <span className={`witem-dot grade-${item.grade}`} />
                      <span className="wname">{item.name}</span>
                    </div>
                    <span className={`wval grade-${item.grade}`}>{item.percentText}</span>
                  </div>
                  <div className="wbar-track">
                    <div
                      className={`wbar-fill grade-${item.grade}`}
                      style={{ width: `${Math.max(4, item.fraction * 100)}%` }}
                    />
                  </div>
                  <div className="witem-footer">
                    <span className="witem-sub-label">{isZh ? '损耗状态' : 'Condition'}</span>
                    <span className={`witem-tag grade-${item.grade}`}>
                      {item.grade === 'good' && (isZh ? '正常' : 'Good')}
                      {item.grade === 'warn' && (isZh ? '预警' : 'Caution')}
                      {item.grade === 'bad' && (isZh ? '需检修' : 'Service')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            4. 驾驶工时与疲劳规划 (HOS Rest Countdown & Fatigue Planning)
            ================================================================= */}
        <section className="hud-card card-hos-fatigue">
          <div className="card-header-line">
            <div className="card-title-badge">
              <BedRestGlyph size={20} />
              <h2 className="panel-title">{isZh ? '驾驶工时与疲劳规划' : 'HOS & Fatigue Planning'}</h2>
            </div>
            <span className={`fatigue-badge level-${hos.level}`}>
              {hos.level === 'fresh' && (isZh ? '精力充沛' : 'Rested')}
              {hos.level === 'normal' && (isZh ? '工时正常' : 'Normal')}
              {hos.level === 'tired' && (isZh ? '疲劳警示' : 'Fatigued')}
            </span>
          </div>

          <div className="hos-body">
            {/* Hero Rest Timer & Tachograph Ring */}
            <div className="hos-hero-cluster">
              <TachographRing
                fatiguePercent={hos.fatiguePercent}
                level={hos.level}
                restDueText={hos.restDueText}
                size={76}
              />

              <div className="rest-timer-box">
                <span className="rtimer-sub">{isZh ? '距强制休整剩余驾驶工时' : 'Mandatory Rest Due In'}</span>
                <div className="huge-rest-timer">{hos.restDueText}</div>
                <div className="rtimer-note">
                  {isZh ? '卡车工时规范：连续驾驶上限 11小时' : 'Rule: 11h max continuous driving'}
                </div>
              </div>
            </div>

            {/* Journey Gantt Timeline */}
            <div className="rest-timeline-bar-wrapper">
              <div className="gantt-strip">
                <div className="gsegment nav" style={{ flex: timeline.navRatio }} title="驾驶时间">
                  <SpeedGlyph size={13} />
                  <span>
                    {isZh ? '航程' : 'Drive'} {formatDuration(timeline.navMinutes, isZh)}
                  </span>
                </div>

                <div className="gsegment rest" style={{ flex: timeline.restRatio }} title="8小时法定休整">
                  <BedRestGlyph size={13} />
                  <span>{isZh ? '8h 休整' : '8h Rest'}</span>
                </div>

                {timeline.bufferRatio > 0 && (
                  <div className="gsegment buffer" style={{ flex: timeline.bufferRatio }} title="时效富余">
                    <span>{isZh ? '时效富余' : 'Buffer'}</span>
                  </div>
                )}
              </div>

              <div className="gantt-strip-labels">
                <span>{isZh ? '当前' : 'Now'}</span>
                <span>{isZh ? '中途休整点' : 'Rest Stop'}</span>
                <span>{isZh ? '交单截止' : 'Deadline'}</span>
              </div>
            </div>

            {/* Smart Dispatch Advice */}
            <div className={`smart-advice-pill ${hos.needRestEnRoute ? 'warning' : 'safe'}`}>
              <div className="advice-icon-cell">
                {hos.needRestEnRoute ? <ShieldAlertGlyph size={18} /> : <ShieldCheckGlyph size={18} />}
              </div>
              <div className="advice-msg">
                {hos.needRestEnRoute
                  ? isZh
                    ? '驾驶工时不足以直达，建议在沿途服务区休整 8 小时，避免违规罚款。'
                    : 'Remaining hours insufficient. Plan an 8h sleep break at next service plaza.'
                  : isZh
                    ? '可用工时充裕，无需中途进站休整，可一趟直达目的地交付！'
                    : 'Driving hours ample. Direct non-stop delivery feasible without rest.'}
              </div>
            </div>
          </div>
        </section>
      </main>
    </section>
  )
}
