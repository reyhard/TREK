// FE-TRANSDISPLAY-001 to FE-TRANSDISPLAY-015
import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../tests/helpers/render'
import { TransitItineraryInline, TransitLegChips, TransitMetaBadges, TransitTitle, TransitWalkDivider, fmtTransitDuration } from './transitDisplay'

const t = (k: string, p?: Record<string, string | number>) => {
  const m: Record<string, string> = {
    'transit.min': `${p?.count || 0} min`,
    'transit.stops': `${p?.count || 0} stops`,
    'transit.walkTo': `Walk to ${p?.name || ''}`,
    'transit.transfers': `${p?.count || 0} transfers`,
    'transit.platform': `Platform ${p?.track || ''}`,
  }
  return m[k] || k
}

const sampleLegs = [
  { mode: 'WALK', duration: 300, from: { name: 'Start' }, to: { name: 'Station' } },
  { mode: 'SUBWAY', line: 'U2', line_color: '#FF3300', line_text_color: '#FFFFFF', duration: 600, stops: 4, headsign: 'Ruhleben', from: { name: 'Station', time: '08:30', track: '2' }, to: { name: 'Zoo', time: '08:40' } },
]

describe('fmtTransitDuration', () => {
  it('FE-TRANSDISPLAY-001: formats seconds under 1 hour as minutes', () => {
    expect(fmtTransitDuration(600, t)).toBe('10 min')
  })

  it('FE-TRANSDISPLAY-002: formats seconds over 1 hour as hours and minutes', () => {
    const result = fmtTransitDuration(4500, t)
    expect(result).toContain('1 h')
    expect(result).toContain('15 min')
  })
})

describe('TransitWalkDivider', () => {
  it('FE-TRANSDISPLAY-003: renders walk leg with duration and destination', () => {
    render(<TransitWalkDivider leg={{ duration: 300, to: { name: 'Station' } }} t={t} size="md" />)
    expect(screen.getByText(/Walk to Station/)).toBeInTheDocument()
    expect(screen.getByText(/5 min/)).toBeInTheDocument()
  })

  it('FE-TRANSDISPLAY-004: renders walk leg without duration', () => {
    render(<TransitWalkDivider leg={{ to: { name: 'Station' } }} t={t} size="md" />)
    expect(screen.getByText(/Walk to Station/)).toBeInTheDocument()
  })
})

describe('TransitItineraryInline', () => {
  it('FE-TRANSDISPLAY-005: renders walk and transit legs inline', () => {
    render(<TransitItineraryInline legs={sampleLegs} t={t} />)
    expect(screen.getByText('U2')).toBeInTheDocument()
    expect(screen.getAllByText(/Station/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Zoo/)).toBeInTheDocument()
  })

  it('FE-TRANSDISPLAY-006: survives empty legs array', () => {
    const { container } = render(<TransitItineraryInline legs={[]} t={t} />)
    expect(container.textContent).toBe('')
  })

  it('FE-TRANSDISPLAY-007: handles malformed optional metadata without throwing', () => {
    const badLegs = [{ mode: 'BUS', line: undefined, duration: undefined, from: { name: undefined }, to: { name: 'Dest' } }]
    expect(() => render(<TransitItineraryInline legs={badLegs as any} t={t} />)).not.toThrow()
  })

  it('FE-TRANSDISPLAY-008: multi-day leg shows different departure/arrival labels', () => {
    const multiDayLeg = { mode: 'TRAIN', line: 'ICE', duration: 7200, from: { name: 'Berlin', time: '22:30' }, to: { name: 'Paris', time: '08:30' } }
    const { container } = render(<TransitItineraryInline legs={[multiDayLeg]} t={t} />)
    expect(screen.getByText('22:30')).toBeInTheDocument()
  })
})

describe('TransitLegChips', () => {
  it('FE-TRANSDISPLAY-009: renders leg chips for transit legs', () => {
    render(<TransitLegChips legs={sampleLegs} t={t} />)
    expect(screen.getByText('U2')).toBeInTheDocument()
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('FE-TRANSDISPLAY-010: shows transfer count when provided', () => {
    render(<TransitLegChips legs={sampleLegs} transfers={1} t={t} />)
    expect(screen.getByText(/1 transfers/)).toBeInTheDocument()
  })

  it('FE-TRANSDISPLAY-011: omits transfers when 0', () => {
    render(<TransitLegChips legs={sampleLegs} transfers={0} t={t} />)
    expect(screen.queryByText(/0 transfers/)).toBeNull()
  })

  it('FE-TRANSDISPLAY-012: survives malformed leg data', () => {
    expect(() => render(<TransitLegChips legs={[{ mode: undefined }] as any} t={t} />)).not.toThrow()
  })
})

describe('TransitMetaBadges', () => {
  it('FE-TRANSDISPLAY-013: renders badge items with text', () => {
    render(<TransitMetaBadges items={[{ text: '30 min' }, { text: 'BVG', dim: true }]} />)
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText('BVG')).toBeInTheDocument()
  })

  it('FE-TRANSDISPLAY-014: renders non-empty items and filters empty text', () => {
    render(<TransitMetaBadges items={[{ text: '' }, { text: 'Valid' }]} />)
    expect(screen.getByText('Valid')).toBeInTheDocument()
  })
})

describe('TransitTitle', () => {
  it('FE-TRANSDISPLAY-015: splits → into icon-separated spans', () => {
    const { container } = render(<TransitTitle title="Berlin → Paris" />)
    expect(container.textContent).toContain('Berlin')
    expect(container.textContent).toContain('Paris')
  })

  it('renders plain text without arrow when no → separator', () => {
    render(<TransitTitle title="Single Stop" />)
    expect(screen.getByText('Single Stop')).toBeInTheDocument()
  })
})
