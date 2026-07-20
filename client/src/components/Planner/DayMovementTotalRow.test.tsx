import type { ComponentProps } from 'react';
import { render, screen } from '../../../tests/helpers/render';
import type { MovementTotal } from '../../utils/movementStats';
import DayMovementTotalRow from './DayMovementTotalRow';

const complete: MovementTotal = {
  mode: 'walking',
  durationSeconds: 600,
  distanceMeters: 2000,
  durationComplete: true,
  distanceComplete: true,
  contributionCount: 1,
};

function renderRow(overrides: Partial<ComponentProps<typeof DayMovementTotalRow>> = {}) {
  return render(
    <DayMovementTotalRow
      status="complete"
      profile="walking"
      total={complete}
      distanceUnit="metric"
      calculatingLabel="Calculating..."
      totalLabel="Walking movement total"
      incompleteLabel="Incomplete movement statistics"
      {...overrides}
    />
  );
}

describe('DayMovementTotalRow', () => {
  it('renders nothing while idle', () => {
    const { container } = renderRow({ status: 'idle' });
    expect(container.firstChild).toBeNull();
  });

  it('renders a compact loading state', () => {
    renderRow({ status: 'loading' });
    expect(screen.getByText('Calculating...')).toBeInTheDocument();
  });

  it('formats a complete metric total as one combined text node', () => {
    renderRow();
    expect(screen.getByText('10 min · 2 km')).toBeInTheDocument();
    expect(screen.getByLabelText('Walking movement total')).toBeInTheDocument();
  });

  it('shows independent minimum markers and the incomplete tooltip', () => {
    renderRow({
      status: 'partial',
      total: { ...complete, durationComplete: false, distanceComplete: false },
    });
    const row = screen.getByLabelText('Walking movement total');
    expect(screen.getByText('≥10 min · ≥2 km')).toBeInTheDocument();
    expect(row).toHaveAttribute('title', 'Incomplete movement statistics');
  });

  it('formats imperial distance', () => {
    renderRow({ distanceUnit: 'imperial' });
    expect(screen.getByText('10 min · 1.2 mi')).toBeInTheDocument();
  });

  it('hides a completed total with no known duration or distance', () => {
    const { container } = renderRow({
      total: { ...complete, durationSeconds: 0, distanceMeters: 0, contributionCount: 0 },
    });
    expect(container.firstChild).toBeNull();
  });

  it('uses the driving label and icon branch', () => {
    renderRow({ profile: 'driving', total: { ...complete, mode: 'driving' }, totalLabel: 'Driving movement total' });
    expect(screen.getByLabelText('Driving movement total')).toBeInTheDocument();
  });
});
