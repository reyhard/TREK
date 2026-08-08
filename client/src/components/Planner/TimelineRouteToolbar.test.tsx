import userEvent from '@testing-library/user-event';

import { render, screen } from '../../../tests/helpers/render';
import { TimelineRouteToolbar } from './TimelineRouteToolbar';

describe('TimelineRouteToolbar', () => {
  it('renders labelled route controls with transport icons and a tinted surface', () => {
    render(
      <TimelineRouteToolbar
        dayId={10}
        routeShown={false}
        routeProfile="walking"
        onToggleRoute={vi.fn()}
        onSetRouteProfile={vi.fn()}
        onPlanTransit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Route' }).querySelector('svg.lucide-route')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Walking' }).querySelector('svg.lucide-footprints')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Driving' }).querySelector('svg.lucide-car')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Public transit' }).querySelector('svg.lucide-tram-front')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Walking' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('timeline-route-toolbar')).not.toHaveStyle({ background: 'var(--bg-card)' });
  });

  it('forwards route and transit commands through the supplied callbacks', async () => {
    const user = userEvent.setup();
    const onToggleRoute = vi.fn();
    const onSetRouteProfile = vi.fn();
    const onPlanTransit = vi.fn();
    render(
      <TimelineRouteToolbar
        dayId={10}
        routeShown={false}
        routeProfile="walking"
        onToggleRoute={onToggleRoute}
        onSetRouteProfile={onSetRouteProfile}
        onPlanTransit={onPlanTransit}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Route' }));
    await user.click(screen.getByRole('button', { name: 'Driving' }));
    await user.click(screen.getByRole('button', { name: 'Public transit' }));

    expect(onToggleRoute).toHaveBeenCalledOnce();
    expect(onSetRouteProfile).toHaveBeenCalledWith('driving');
    expect(onPlanTransit).toHaveBeenCalledWith(10);
  });
});
