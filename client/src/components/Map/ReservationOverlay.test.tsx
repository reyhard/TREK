import { render, screen } from '../../../tests/helpers/render';
import ReservationOverlay from './ReservationOverlay';
import { describe, expect, it, vi } from 'vitest';

const mapMock = {
  getZoom: () => 13,
  getPane: () => ({ style: {} }),
  createPane: () => ({ style: {} }),
  latLngToContainerPoint: ([lat, lng]: [number, number]) => ({
    x: lng * 100,
    y: lat * 100,
    distanceTo(other: { x: number; y: number }) {
      return Math.hypot(this.x - other.x, this.y - other.y);
    },
  }),
  getSize: () => ({ x: 1200, y: 800 }),
};

vi.mock('react-leaflet', () => ({
  Marker: ({ position, children }: any) => (
    <div data-testid="marker" data-position={JSON.stringify(position)}>{children}</div>
  ),
  Polyline: ({ positions }: any) => (
    <div data-testid="polyline" data-positions={JSON.stringify(positions)} />
  ),
  Tooltip: ({ children }: any) => <div>{children}</div>,
  useMap: () => mapMock,
  useMapEvents: () => ({}),
}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(),
  },
}));

describe('ReservationOverlay', () => {
  it('uses saved endpoint coordinates for markers and the no-geometry fallback line', () => {
    const reservation = {
      id: 24,
      trip_id: 1,
      title: 'Fushimi Inari → Kiyomizu-dera',
      type: 'transit',
      status: 'confirmed',
      metadata: { transit: { legs: [] } },
      endpoints: [
        {
          role: 'from', sequence: 0, name: 'Keihan Fushimi-Inari Station', code: null,
          lat: 35.0, lng: 135.0, timezone: 'Asia/Tokyo',
          local_date: null, local_time: null,
        },
        {
          role: 'to', sequence: 1, name: 'Kiyomizu-dera', code: null,
          lat: 37.5, lng: 138.0, timezone: 'Asia/Tokyo',
          local_date: null, local_time: null,
        },
      ],
    } as any;

    render(<ReservationOverlay reservations={[reservation]} showConnections showStats={false} />);

    expect(screen.getAllByTestId('marker').map((node) => JSON.parse(node.dataset.position!))).toEqual([
      [35.0, 135.0],
      [37.5, 138.0],
    ]);
    expect(screen.getAllByTestId('polyline').map((node) => JSON.parse(node.dataset.positions!))).toContainEqual([
      [35.0, 135.0],
      [37.5, 138.0],
    ]);
  });

  it('keeps provider geometry independent from edited endpoint coordinates', () => {
    const encodedPolyline = '_ogtcA__xkbG_qo]_c`|@';
    const reservation = {
      id: 42,
      trip_id: 1,
      title: 'Kyoto → Osaka',
      type: 'transit',
      status: 'confirmed',
      metadata: {
        transit: {
          legs: [
            { geometry: encodedPolyline, geometry_precision: 6, line_color: '#ff0000', mode: 'RAIL' },
          ],
        },
      },
      endpoints: [
        {
          role: 'from', sequence: 0, name: 'Kyoto Station', code: null,
          lat: 35.0, lng: 135.0, timezone: 'Asia/Tokyo',
          local_date: null, local_time: null,
        },
        {
          role: 'to', sequence: 1, name: 'Osaka Station', code: null,
          lat: 37.0, lng: 138.0, timezone: 'Asia/Tokyo',
          local_date: null, local_time: null,
        },
      ],
    } as any;

    render(<ReservationOverlay reservations={[reservation]} showConnections showStats={false} />);

    const markerPositions = screen.getAllByTestId('marker').map((node) => JSON.parse(node.dataset.position!));
    expect(markerPositions).toEqual([
      [35.0, 135.0],
      [37.0, 138.0],
    ]);

    const polylinePositions = screen.getAllByTestId('polyline').map((node) => JSON.parse(node.dataset.positions!));
    expect(polylinePositions).toContainEqual([
      [36.0, 136.0],
      [36.5, 137.0],
    ]);
    expect(polylinePositions).not.toContainEqual([
      [35.0, 135.0],
      [37.0, 138.0],
    ]);
  });

  it('renders an untouched route with its stored endpoint coordinates', () => {
    const reservation = {
      id: 7,
      trip_id: 1,
      title: 'Original Route',
      type: 'transit',
      status: 'confirmed',
      metadata: null,
      endpoints: [
        {
          role: 'from', sequence: 0, name: 'Station A', code: null,
          lat: 35.0, lng: 135.0, timezone: null,
          local_date: null, local_time: null,
        },
        {
          role: 'to', sequence: 1, name: 'Station B', code: null,
          lat: 38.0, lng: 139.0, timezone: null,
          local_date: null, local_time: null,
        },
      ],
    } as any;

    render(<ReservationOverlay reservations={[reservation]} showConnections showStats={false} />);

    expect(screen.getAllByTestId('marker').map((node) => JSON.parse(node.dataset.position!))).toEqual([
      [35.0, 135.0],
      [38.0, 139.0],
    ]);
    expect(screen.getAllByTestId('polyline').map((node) => JSON.parse(node.dataset.positions!))).toContainEqual([
      [35.0, 135.0],
      [38.0, 139.0],
    ]);
  });
});
