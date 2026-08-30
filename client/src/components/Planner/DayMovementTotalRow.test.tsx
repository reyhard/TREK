import type { ComponentProps } from 'react'
import { render, screen } from '../../../tests/helpers/render'
import type { MovementTotal } from '../../utils/movementStats'
import DayMovementTotalRow from './DayMovementTotalRow'

const complete: MovementTotal = {
  mode: 'walking',
  durationSeconds: 600,
  distanceMeters: 2000,
  durationComplete: true,
  distanceComplete: true,
  contributionCount: 1,
}

function renderRow(overrides: Partial<ComponentProps<typeof DayMovementTotalRow>> = {}) {
  return render(
    <DayMovementTotalRow
      status="complete"
      mode="walking"
      total={complete}
      distanceUnit="metric"
      calculatingLabel="Calculating..."
      totalLabel="Walking movement total"
      incompleteLabel="Incomplete movement statistics"
      {...overrides}
    />,
  )
}

describe('DayMovementTotalRow', () => {
  it('renders a concise complete daily total', () => {
    renderRow()
    expect(screen.getByText('10 min · 2 km')).toBeInTheDocument()
    expect(screen.getByLabelText('Walking movement total')).toBeInTheDocument()
  })

  it('shows independent minimum markers for incomplete metrics', () => {
    renderRow({
      status: 'partial',
      total: { ...complete, durationComplete: false, distanceComplete: false },
    })
    expect(screen.getByText('≥10 min · ≥2 km')).toBeInTheDocument()
    expect(screen.getByLabelText('Walking movement total')).toHaveAttribute('title', 'Incomplete movement statistics')
  })
})
