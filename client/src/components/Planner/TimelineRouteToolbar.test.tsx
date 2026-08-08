import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '../../../tests/helpers/render';
import { useSettingsStore } from '../../store/settingsStore';
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
    expect(screen.getByRole('button', { name: 'Public transit' })).toHaveStyle({ color: 'var(--text-primary)' });
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

  it('keeps all labelled controls touch-safe and able to wrap in 200px and 320px containers', () => {
    for (const width of [200, 320]) {
      const { unmount } = render(
        <div style={{ width }}>
          <TimelineRouteToolbar
            dayId={10}
            routeShown={false}
            routeProfile="walking"
            onToggleRoute={vi.fn()}
            onSetRouteProfile={vi.fn()}
            onPlanTransit={vi.fn()}
          />
        </div>
      );

      const toolbar = screen.getByTestId('timeline-route-toolbar');
      expect(toolbar).toHaveStyle({ display: 'flex', flexWrap: 'wrap', width: '100%', minWidth: '0px' });
      expect(toolbar).toHaveStyle({ boxSizing: 'border-box', overflow: 'visible' });
      for (const name of ['Route', 'Walking', 'Driving', 'Public transit']) {
        const control = screen.getByRole('button', { name });
        expect(control).toHaveTextContent(name);
        expect(control).toHaveStyle({ minHeight: '44px', maxWidth: '100%', whiteSpace: 'normal' });
      }
      unmount();
    }
  });

  it('keeps the long German public-transit label visible and touch-safe', async () => {
    useSettingsStore.setState((state) => ({ settings: { ...state.settings, language: 'de' } }));
    render(
      <div style={{ width: 200 }}>
        <TimelineRouteToolbar
          dayId={10}
          routeShown={false}
          routeProfile="walking"
          onToggleRoute={vi.fn()}
          onSetRouteProfile={vi.fn()}
          onPlanTransit={vi.fn()}
        />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Öffentliche Verkehrsmittel' })).toBeVisible();
    });
    expect(screen.getByRole('button', { name: 'Öffentliche Verkehrsmittel' })).toHaveStyle({
      maxWidth: '100%',
      minHeight: '44px',
      whiteSpace: 'normal',
    });
  });
});
