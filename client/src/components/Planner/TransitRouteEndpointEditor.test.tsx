import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useSettingsStore } from '../../store/settingsStore';
import TransitRouteEndpointEditor from './TransitRouteEndpointEditor';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = {
  role: 'from' as const, sequence: 0, name: 'Fushimi Inari', code: null,
  lat: 34.967, lng: 135.773, timezone: 'Asia/Tokyo',
  local_date: '2026-10-09', local_time: '09:00',
};
const to = {
  role: 'to' as const, sequence: 1, name: 'Kiyomizu-dera', code: null,
  lat: 34.994, lng: 135.785, timezone: 'Asia/Tokyo',
  local_date: '2026-10-09', local_time: '09:45',
};

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  seedStore(useSettingsStore, { settings: { time_format: '24h' } } as any);
});

it('shows the map-only warning and submits only the changed origin', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({});
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={onSave} onCancel={vi.fn()} />);

  expect(screen.getByText(/changes map pinning only/i)).toBeInTheDocument();
  const originName = screen.getByLabelText('Origin — Place or station label');
  const originLat = screen.getByLabelText('Origin — Latitude');
  const originLng = screen.getByLabelText('Origin — Longitude');
  await user.clear(originName);
  await user.type(originName, 'Keihan Fushimi-Inari Station');
  await user.clear(originLat);
  await user.type(originLat, '34.9685211');
  await user.clear(originLng);
  await user.type(originLng, '135.7691251');
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith({
    from: {
      name: 'Keihan Fushimi-Inari Station',
      lat: 34.9685211,
      lng: 135.7691251,
    },
  }));
});

it('blocks invalid coordinates and unchanged values', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={onSave} onCancel={vi.fn()} />);

  expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  const latitude = screen.getByLabelText('Destination — Latitude');
  await user.clear(latitude);
  await user.type(latitude, '91');
  expect(screen.getByText('Latitude must be a number from -90 to 90.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  expect(onSave).not.toHaveBeenCalled();
});

it('cancels without saving', async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={vi.fn()} onCancel={onCancel} />);
  await user.click(screen.getByRole('button', { name: /^Cancel$/ }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
