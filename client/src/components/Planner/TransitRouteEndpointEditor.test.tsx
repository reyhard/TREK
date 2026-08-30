// FE-PLANNER-TRANSITEDITOR-001 to 006 — the map-only route-endpoint editor for a stored
// transit journey. It edits ONLY the origin/destination pins and never triggers a provider
// search: the parent builds the full endpoints[] and calls the canonical reservation update.
import userEvent from '@testing-library/user-event';
import en from '@trek/shared/i18n/en';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useSettingsStore } from '../../store/settingsStore';
import TransitRouteEndpointEditor from './TransitRouteEndpointEditor';

const from = {
  role: 'from' as const,
  sequence: 0,
  name: 'Fushimi Inari',
  code: null,
  lat: 34.967,
  lng: 135.773,
  timezone: 'Asia/Tokyo',
  local_date: '2026-10-09',
  local_time: '09:00',
};
const to = {
  role: 'to' as const,
  sequence: 1,
  name: 'Kiyomizu-dera',
  code: null,
  lat: 34.994,
  lng: 135.785,
  timezone: 'Asia/Tokyo',
  local_date: '2026-10-09',
  local_time: '09:45',
};

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  seedStore(useSettingsStore, { settings: { time_format: '24h' } } as any);
});

it('FE-PLANNER-TRANSITEDITOR-001: shows the map-only warning and submits only the changed origin', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({});
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={onSave} onCancel={vi.fn()} />);

  expect(screen.getByText(/changes only the origin and destination pins/i)).toBeInTheDocument();
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

  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      from: {
        name: 'Keihan Fushimi-Inari Station',
        lat: 34.9685211,
        lng: 135.7691251,
      },
    })
  );
});

it('FE-PLANNER-TRANSITEDITOR-002: edits only the destination endpoint', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({});
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={onSave} onCancel={vi.fn()} />);

  const destLat = screen.getByLabelText('Destination — Latitude');
  const destLng = screen.getByLabelText('Destination — Longitude');
  await user.clear(destLat);
  await user.type(destLat, '34.995');
  await user.clear(destLng);
  await user.type(destLng, '135.786');
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      to: { name: 'Kiyomizu-dera', lat: 34.995, lng: 135.786 },
    })
  );
});

it('FE-PLANNER-TRANSITEDITOR-003: blocks invalid coordinates and unchanged values', async () => {
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

it('FE-PLANNER-TRANSITEDITOR-004: cancels without saving', async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={vi.fn()} onCancel={onCancel} />);
  await user.click(screen.getByRole('button', { name: /^Cancel$/ }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('FE-PLANNER-TRANSITEDITOR-005: does not submit an accidental zero for blank coordinates', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({});
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={onSave} onCancel={vi.fn()} />);
  const lngInput = screen.getByLabelText('Origin — Longitude');
  await user.clear(lngInput);
  // Save must be blocked — blank longitude must not coerce to 0
  await user.click(screen.getByRole('button', { name: /^Save$/ }));
  expect(onSave).not.toHaveBeenCalled();
});

it('FE-PLANNER-TRANSITEDITOR-006: renders text from i18n keys rather than hardcoded English', async () => {
  const user = userEvent.setup();
  render(<TransitRouteEndpointEditor from={from} to={to} onSave={vi.fn()} onCancel={vi.fn()} />);

  // aria-labels and placeholders flow through t()
  expect(screen.getByLabelText(`Origin — ${en['transit.endpointName'] as string}`)).toBeInTheDocument();
  expect(screen.getByLabelText(`Origin — ${en['transit.endpointLatitude'] as string}`)).toBeInTheDocument();
  expect(screen.getByLabelText(`Origin — ${en['transit.endpointLongitude'] as string}`)).toBeInTheDocument();
  expect(screen.getAllByPlaceholderText(en['transit.endpointLatitude'] as string)).toHaveLength(2);
  expect(screen.getAllByPlaceholderText(en['transit.endpointLongitude'] as string)).toHaveLength(2);

  const latInput = screen.getByLabelText(`Origin — ${en['transit.endpointLatitude'] as string}`);
  await user.clear(latInput);
  expect(screen.getByText(en['transit.endpointInvalidLatitude'] as string)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
});