/**
 * Clean SVG Glyphs for Automotive Freight In-Cabin HUD
 * Only glyphs actively used by FreightApp.tsx are retained.
 */

export function ShieldAlertGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

export function ShieldCheckGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

export function CargoBoxGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

export function BedRestGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 4v16" />
      <path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <path d="M2 17h20" />
      <circle cx="6" cy="11" r="2" />
    </svg>
  )
}

export function SpeedGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v4" />
      <path d="m4.93 4.93 2.83 2.83" />
      <path d="M2 12h4" />
      <path d="m4.93 19.07 2.83-2.83" />
      <path d="M12 22v-4" />
      <path d="m19.07 19.07-2.83-2.83" />
      <path d="M22 12h-4" />
      <path d="m19.07 4.93-2.83 2.83" />
    </svg>
  )
}

export function ClockRingGlyph({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden>
      <circle cx="19" cy="19" r="14" stroke="#6366f1" strokeWidth="2.2" strokeOpacity="0.4" />
      <path d="M19 5 A 14 14 0 0 1 33 19" stroke="#818cf8" strokeWidth="2.4" strokeLinecap="round" />
      <polyline
        points="19 11 19 19 25 19"
        stroke="#c7d2fe"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TruckLineGlyph({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden>
      <rect x="5" y="11" width="17" height="14" rx="2" stroke="#38bdf8" strokeWidth="2.2" />
      <path d="M22 17h6l4 4v4h-10v-8z" stroke="#38bdf8" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="11" cy="27" r="3" stroke="#38bdf8" strokeWidth="2.2" />
      <circle cx="27" cy="27" r="3" stroke="#38bdf8" strokeWidth="2.2" />
    </svg>
  )
}

export function EngineCheckGlyph({ size = 18, color = '#34d399' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M2 9v6" />
      <path d="M22 10v4" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

export function NavigationArrowGlyph({ size = 18, color = '#34d399' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  )
}

export function TachographRing({
  fatiguePercent,
  level,
  restDueText,
  size = 76,
}: {
  fatiguePercent: number
  level: 'fresh' | 'normal' | 'tired'
  restDueText: string
  size?: number
}) {
  const r = 54
  const circumference = 2 * Math.PI * r
  const remainingPercent = Math.max(0, Math.min(100, 100 - fatiguePercent))
  const dashOffset = circumference - (remainingPercent / 100) * circumference

  const ringColor = level === 'fresh' ? '#30d158' : level === 'normal' ? '#0091ff' : '#ff453a'

  return (
    <div className="tachograph-ring-wrapper" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 140 140" className="tachograph-svg" aria-hidden>
        <defs>
          <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>

        {/* Background Track */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="10" />

        {/* Active Driving Window Arc */}
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          className="tachograph-active-arc"
          filter="url(#ring-glow)"
        />
      </svg>

      <div className="tachograph-center-content">
        <span className="tachograph-time">{restDueText}</span>
        <span className={`tachograph-load-pill level-${level}`}>{fatiguePercent}% 负荷</span>
      </div>
    </div>
  )
}
