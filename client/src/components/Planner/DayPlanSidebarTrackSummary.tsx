import { Bike, Car, Clock3, Footprints } from 'lucide-react'
import type { TrackMovementPart } from '../../utils/dayMovementPlan'
import { formatDuration, formatRouteDistance } from '../Map/RouteCalculator'

export function DayPlanSidebarTrackSummary({ track }: { track: TrackMovementPart }) {
  const Icon = track.mode === 'cycling' ? Bike : track.mode === 'driving' ? Car : Footprints
  const source = track.durationSource === 'poi-times' ? 'Scheduled trail time' : 'Estimated trail time'

  return (
    <div
      data-testid={`track-summary-${track.assignmentId}`}
      data-track-mode={track.mode}
      title={source}
      className="text-content-muted"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minHeight: 24,
        padding: '2px 12px 2px 42px',
        fontSize: 'calc(10px * var(--fs-scale-caption, 1))',
      }}
    >
      <Icon size={11} strokeWidth={2} aria-hidden />
      <Clock3 size={10} strokeWidth={2} aria-hidden />
      <span>{formatDuration(track.duration)}</span>
      <span aria-hidden>·</span>
      <span>{formatRouteDistance(track.distance)}</span>
    </div>
  )
}
