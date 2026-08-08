import userEvent from '@testing-library/user-event';

import { render, screen } from '../../../tests/helpers/render';
import { DayPlanModeSwitch } from './DayPlanModeSwitch';

describe('DayPlanModeSwitch', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to List mode when the trip has no saved preference', () => {
    render(<DayPlanModeSwitch tripId={17} />);

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('persists Timeline mode for the trip', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DayPlanModeSwitch tripId={17} />);

    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(localStorage.getItem('day-plan-mode-17')).toBe('timeline');
    unmount();

    render(<DayPlanModeSwitch tripId={17} />);
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true');
  });
});
