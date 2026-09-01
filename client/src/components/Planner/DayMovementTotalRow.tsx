import { Bike, Car, Footprints } from 'lucide-react';
import type { DistanceUnit } from '../../types';
import type { MovementMode, MovementTotal } from '../../utils/movementStats';
import { formatDistance } from '../../utils/units';

export type RouteMetricStatus = 'idle' | 'loading' | 'complete' | 'partial';

interface DayMovementTotalRowProps {
  status: RouteMetricStatus;
  mode: MovementMode;
  total: MovementTotal;
  distanceUnit: DistanceUnit;
  calculatingLabel: string;
  totalLabel: string;
  incompleteLabel: string;
  testId?: string;
}

export function formatMovementDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function formatMovementDistance(meters: number, unit: DistanceUnit): string {
  const safeMeters = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  return formatDistance(safeMeters / 1000, unit);
}

const MODE_ICONS: Record<MovementMode, typeof Car> = {
  driving: Car,
  walking: Footprints,
  cycling: Bike,
};

export default function DayMovementTotalRow({
  status,
  mode,
  total,
  distanceUnit,
  calculatingLabel,
  totalLabel,
  incompleteLabel,
  testId = 'day-movement-total',
}: DayMovementTotalRowProps) {
  if (status === 'idle') return null;
  const Icon = MODE_ICONS[mode];

  if (status === 'loading') {
    return (
      <div
        aria-label={totalLabel}
        className="bg-surface-hover text-content-secondary"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          fontSize: 'calc(12px * var(--fs-scale-body, 1))',
          borderRadius: 8,
          padding: '5px 10px',
        }}
      >
        <Icon size={12} strokeWidth={2} />
        <span>{calculatingLabel}</span>
      </div>
    );
  }

  const hasKnownMetric = total.durationSeconds > 0 || total.distanceMeters > 0;
  if (!hasKnownMetric) return null;

  const duration = `${total.durationComplete ? '' : '≥'}${formatMovementDuration(total.durationSeconds)}`;
  const distance = `${total.distanceComplete ? '' : '≥'}${formatMovementDistance(total.distanceMeters, distanceUnit)}`;
  const incomplete = !total.durationComplete || !total.distanceComplete;

  return (
    <div
      data-testid={testId}
      aria-label={totalLabel}
      title={incomplete ? incompleteLabel : undefined}
      className="bg-surface-hover text-content-secondary"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        fontSize: 'calc(12px * var(--fs-scale-body, 1))',
        borderRadius: 8,
        padding: '5px 10px',
      }}
    >
      <Icon size={12} strokeWidth={2} />
      <span>{`${duration} · ${distance}`}</span>
    </div>
  );
}
