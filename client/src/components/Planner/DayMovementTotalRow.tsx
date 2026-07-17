import { Car, Footprints } from 'lucide-react'
import type { DistanceUnit } from '../../types'
import { formatDistance } from '../../utils/units'
import type { MovementTotal } from '../../utils/movementStats'

export type RouteMetricStatus = 'idle' | 'loading' | 'complete' | 'partial'

interface DayMovementTotalRowProps {
  status: RouteMetricStatus
  profile: 'walking' | 'driving'
  total: MovementTotal
  distanceUnit: DistanceUnit
  calculatingLabel: string
  totalLabel: string
  incompleteLabel: string
}

export function formatMovementDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const totalMinutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
}

export function formatMovementDistance(meters: number, unit: DistanceUnit): string {
  const safeMeters = Number.isFinite(meters) ? Math.max(0, meters) : 0
  return formatDistance(safeMeters / 1000, unit)
}

export default function DayMovementTotalRow({
  status,
  profile,
  total,
  distanceUnit,
  calculatingLabel,
  totalLabel,
  incompleteLabel,
}: DayMovementTotalRowProps) {
  if (status === 'idle') return null
  const Icon = profile === 'driving' ? Car : Footprints

  if (status === 'loading') {
    return (
      <div
        aria-label={totalLabel}
        className="text-content-secondary bg-surface-hover"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 'calc(12px * var(--fs-scale-body, 1))', borderRadius: 8, padding: '5px 10px' }}
      >
        <Icon size={12} strokeWidth={2} />
        <span>{calculatingLabel}</span>
      </div>
    )
  }

  const hasKnownMetric = total.durationSeconds > 0 || total.distanceMeters > 0
  if (!hasKnownMetric) return null

  const duration = `${total.durationComplete ? '' : '≥'}${formatMovementDuration(total.durationSeconds)}`
  const distance = `${total.distanceComplete ? '' : '≥'}${formatMovementDistance(total.distanceMeters, distanceUnit)}`
  const incomplete = !total.durationComplete || !total.distanceComplete

  return (
    <div
      data-testid="day-movement-total"
      aria-label={totalLabel}
      title={incomplete ? incompleteLabel : undefined}
      className="text-content-secondary bg-surface-hover"
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 'calc(12px * var(--fs-scale-body, 1))', borderRadius: 8, padding: '5px 10px' }}
    >
      <Icon size={12} strokeWidth={2} />
      <span>{`${duration} · ${distance}`}</span>
    </div>
  )
}
