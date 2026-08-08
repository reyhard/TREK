import userEvent from '@testing-library/user-event';

import {
  buildAssignment,
  buildCategory,
  buildDay,
  buildDayNote,
  buildPlace,
  buildReservation,
} from '../../../tests/helpers/factories';
import { fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import type { Assignment } from '../../types';
import { DayTimelinePlanner, type DayTimelinePlannerProps } from './DayTimelinePlanner';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('../shared/Toast', () => ({
  useToast: () => ({ error: toastError, success: vi.fn() }),
}));

const day = buildDay({ id: 10, title: 'Museum day', date: '2026-08-09' });
const museum = buildPlace({ id: 42, name: 'Museum', duration_minutes: 90 });

function timedAssignment(overrides: Partial<Assignment> = {}) {
  return buildAssignment({
    id: 101,
    day_id: day.id,
    place_id: museum.id,
    place: museum,
    assignment_time: '09:00',
    assignment_end_time: '10:30',
    ...overrides,
  });
}

function props(overrides: Partial<DayTimelinePlannerProps> = {}): DayTimelinePlannerProps {
  return {
    day,
    days: [day],
    assignments: [],
    places: [museum],
    categories: [],
    canEdit: true,
    selectedPlaceId: null,
    selectedAssignmentId: null,
    onAssignToDay: vi.fn(),
    onSetAssignmentTime: vi.fn().mockResolvedValue(undefined),
    onPlaceClick: vi.fn(),
    onEditPlace: vi.fn(),
    onSelectDay: vi.fn(),
    ...overrides,
  };
}

function transfer(data: Record<string, string>) {
  return {
    getData: (key: string) => data[key] ?? '',
    setData: vi.fn(),
    effectAllowed: 'all',
    dropEffect: 'none',
  };
}

function dropAt(element: HTMLElement, clientY: number, data: Record<string, string>) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'dataTransfer', { value: transfer(data) });
  fireEvent(element, event);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('DayTimelinePlanner', () => {
  beforeEach(() => {
    toastError.mockClear();
    window.__dragData = null;
  });

  it('navigates ordered days from a sticky header and disables navigation at the endpoints', async () => {
    const user = userEvent.setup();
    const previous = buildDay({ id: 9, title: 'Previous day', date: '2026-08-08' });
    const next = buildDay({ id: 11, title: 'Next day', date: '2026-08-10' });
    const onSelectDay = vi.fn();
    const view = render(<DayTimelinePlanner {...props({ days: [previous, day, next], onSelectDay })} />);

    const header = screen.getByTestId('timeline-day-header');
    expect(header).toHaveStyle({ position: 'sticky', top: '0px' });
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onSelectDay).toHaveBeenNthCalledWith(1, previous.id);
    expect(onSelectDay).toHaveBeenNthCalledWith(2, next.id);

    view.rerender(<DayTimelinePlanner {...props({ day: previous, days: [previous, day, next], onSelectDay })} />);
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });

  it('renders scheduled, unscheduled, and overlapping assignments', () => {
    const first = timedAssignment();
    const second = timedAssignment({
      id: 102,
      place: buildPlace({ id: 43, name: 'Gallery' }),
      place_id: 43,
      assignment_time: '09:30',
      assignment_end_time: '10:00',
    });
    const third = buildAssignment({ id: 103, day_id: day.id, place: buildPlace({ name: 'Cafe' }) });

    render(<DayTimelinePlanner {...props({ assignments: [first, second, third] })} />);

    expect(screen.getByText('Unscheduled')).toBeInTheDocument();
    expect(screen.getByText('09:00 – 10:30')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /2 overlapping activities/i })).toBeInTheDocument();
    expect(screen.getByText('Cafe')).toBeInTheDocument();
    const museumConflict = screen.getByRole('group', { name: 'Museum overlaps another activity' });
    const galleryConflict = screen.getByRole('group', { name: 'Gallery overlaps another activity' });
    expect(within(museumConflict).getByTitle('Overlapping activity')).toBeVisible();
    expect(within(galleryConflict).getByTitle('Overlapping activity')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Cafe overlaps another activity' })).not.toBeInTheDocument();
  });

  it('tints activity cards by category or accent while preserving selected category borders', () => {
    const category = buildCategory({ id: 7, color: '#123456' });
    const categorizedPlace = buildPlace({ id: 43, name: 'Gallery', category_id: category.id });
    const uncategorizedPlace = buildPlace({ id: 44, name: 'Cafe', category_id: null });
    const selectedPlace = buildPlace({ id: 45, name: 'Gardens', category_id: category.id });
    const categorized = timedAssignment({ id: 102, place_id: categorizedPlace.id, place: categorizedPlace });
    const uncategorized = timedAssignment({
      id: 103,
      place_id: uncategorizedPlace.id,
      place: uncategorizedPlace,
      assignment_time: '11:00',
      assignment_end_time: '12:00',
    });
    const selected = timedAssignment({
      id: 104,
      place_id: selectedPlace.id,
      place: selectedPlace,
      assignment_time: '13:00',
      assignment_end_time: '14:00',
    });

    render(
      <DayTimelinePlanner
        {...props({
          assignments: [categorized, uncategorized, selected],
          places: [categorizedPlace, uncategorizedPlace, selectedPlace],
          categories: [category],
          selectedAssignmentId: selected.id,
        })}
      />
    );

    expect(screen.getByRole('group', { name: 'Gallery' })).toHaveStyle({
      background: 'color-mix(in srgb, #123456 10%, transparent)',
    });
    expect(screen.getByRole('group', { name: 'Cafe' })).toHaveStyle({
      background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    });
    expect(screen.getByRole('group', { name: 'Gardens' })).toHaveStyle({
      background: 'var(--bg-selected)',
      border: '2px solid #123456',
    });
  });

  it('does not warn when one activity starts as another ends', () => {
    const next = timedAssignment({
      id: 102,
      place: buildPlace({ id: 43, name: 'Gallery' }),
      place_id: 43,
      assignment_time: '10:30',
      assignment_end_time: '11:00',
    });
    render(<DayTimelinePlanner {...props({ assignments: [timedAssignment(), next] })} />);

    expect(screen.queryByRole('status', { name: /overlapping activities/i })).not.toBeInTheDocument();
  });

  it('renders scheduled and untimed transport and note context as distinct read-only cards', () => {
    const scheduledTransport = buildReservation({
      id: 501,
      day_id: day.id,
      type: 'train',
      title: 'Morning train',
      reservation_time: '07:30',
      reservation_end_time: '08:15',
    });
    const malformedTransport = buildReservation({
      id: 502,
      day_id: day.id,
      type: 'bus',
      title: 'Flexible bus',
      reservation_time: 'after lunch',
    });
    const timedNote = buildDayNote({ id: 601, day_id: day.id, text: 'Board ferry', time: '08:30' });
    const untimedNote = buildDayNote({ id: 602, day_id: day.id, text: 'Buy tickets', time: null });

    render(
      <DayTimelinePlanner
        {...props({
          canEdit: false,
          reservations: [scheduledTransport, malformedTransport],
          notes: [timedNote, untimedNote],
        })}
      />
    );

    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    const transportCard = within(grid).getByRole('group', { name: 'Transport: Morning train' });
    const noteCard = within(grid).getByRole('group', { name: 'Note: Board ferry' });
    expect(within(transportCard).getByText('07:30 – 08:15')).toBeVisible();
    expect(within(noteCard).getByText('08:30 – 08:45')).toBeVisible();
    expect(transportCard).toHaveStyle({
      background: 'color-mix(in srgb, #3b82f6 10%, transparent)',
    });
    expect(transportCard.style.border).toBe('1px solid color-mix(in srgb, rgb(59, 130, 246) 42%, transparent)');
    expect(noteCard).toHaveStyle({ background: 'var(--bg-hover)' });

    const contextTray = screen.getByRole('region', { name: 'Timeline context' });
    expect(within(contextTray).getByRole('group', { name: 'Transport: Flexible bus' })).toBeVisible();
    expect(within(contextTray).getByRole('group', { name: 'Note: Buy tickets' })).toBeVisible();
    for (const card of [transportCard, noteCard, ...within(contextTray).getAllByRole('group')]) {
      expect(card).not.toHaveAttribute('draggable');
      expect(within(card).queryByRole('button', { name: /^(Move|Edit|Remove time)/ })).not.toBeInTheDocument();
    }
  });

  it('renders every synthetic leg but opens saved transit with its original reservation', async () => {
    const user = userEvent.setup();
    const savedTransit = buildReservation({
      id: 503,
      day_id: day.id,
      type: 'flight',
      title: 'Island connection',
      metadata: JSON.stringify({
        legs: [
          { dep_day_id: day.id, arr_day_id: day.id, dep_time: '09:00', arr_time: '10:00' },
          { dep_day_id: day.id, arr_day_id: day.id, dep_time: '11:00', arr_time: '12:30' },
        ],
        transit: { legs: [{ mode: 'rail' }] },
      }),
    });
    const onOpenTransit = vi.fn();
    const onEditTransport = vi.fn();

    render(<DayTimelinePlanner {...props({ reservations: [savedTransit], onOpenTransit, onEditTransport })} />);

    const legs = screen.getAllByRole('button', { name: 'Transport: Island connection' });
    expect(legs).toHaveLength(2);
    expect(screen.getByText('09:00 – 10:00')).toBeVisible();
    expect(screen.getByText('11:00 – 12:30')).toBeVisible();
    await user.click(legs[1]!);
    expect(onOpenTransit).toHaveBeenCalledTimes(1);
    expect(onOpenTransit.mock.calls[0]![0]).toBe(savedTransit);
    expect(onEditTransport).not.toHaveBeenCalled();
  });

  it('edits ordinary transport only through the exact editable callback path', async () => {
    const user = userEvent.setup();
    const transport = buildReservation({
      id: 504,
      day_id: day.id,
      type: 'bus',
      title: 'Airport bus',
      reservation_time: '13:00',
    });
    const onEditTransport = vi.fn();
    const view = render(<DayTimelinePlanner {...props({ reservations: [transport], onEditTransport })} />);

    await user.click(screen.getByRole('button', { name: 'Transport: Airport bus' }));
    expect(onEditTransport).toHaveBeenCalledTimes(1);
    expect(onEditTransport.mock.calls[0]![0]).toBe(transport);

    view.rerender(<DayTimelinePlanner {...props({ reservations: [transport], canEdit: false, onEditTransport })} />);
    expect(screen.queryByRole('button', { name: 'Transport: Airport bus' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Transport: Airport bus' })).toBeVisible();

    view.rerender(<DayTimelinePlanner {...props({ reservations: [transport] })} />);
    expect(screen.queryByRole('button', { name: 'Transport: Airport bus' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Transport: Airport bus' })).toBeVisible();
  });

  it('exposes route state, profile selection, and transit planning through the focused toolbar', async () => {
    const user = userEvent.setup();
    const onToggleRoute = vi.fn();
    const onSetRouteProfile = vi.fn();
    const onPlanTransit = vi.fn();
    const view = render(
      <DayTimelinePlanner
        {...props({
          routeShown: false,
          routeProfile: 'walking',
          onToggleRoute,
          onSetRouteProfile,
          onPlanTransit,
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Route' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Walking' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Driving' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Route' }));
    await user.click(screen.getByRole('button', { name: 'Driving' }));
    await user.click(screen.getByRole('button', { name: 'Public transit' }));
    expect(onToggleRoute).toHaveBeenCalledTimes(1);
    expect(onSetRouteProfile).toHaveBeenCalledWith('driving');
    expect(onPlanTransit).toHaveBeenCalledWith(day.id);

    view.rerender(
      <DayTimelinePlanner
        {...props({
          routeShown: true,
          routeProfile: 'driving',
          onToggleRoute,
          onSetRouteProfile,
          onPlanTransit,
        })}
      />
    );
    expect(screen.getByRole('button', { name: 'Route' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Walking' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Driving' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not render broken route controls when their callbacks are absent', () => {
    render(<DayTimelinePlanner {...props({ routeShown: true, routeProfile: 'walking' })} />);

    expect(screen.queryByRole('button', { name: 'Route' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Walking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Driving' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Public transit' })).not.toBeInTheDocument();
  });

  it('assigns a cross-sidebar POI and schedules the returned assignment at the dropped slot', async () => {
    const created = buildAssignment({ id: 201, day_id: day.id, place: museum, place_id: museum.id });
    const onAssignToDay = vi.fn().mockResolvedValue(created);
    const onSetAssignmentTime = vi.fn().mockResolvedValue(created);
    render(<DayTimelinePlanner {...props({ onAssignToDay, onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 195, { placeId: '42' });

    await waitFor(() => expect(onAssignToDay).toHaveBeenCalledWith(42, 10));
    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, created.id, { place_time: '09:15' }));
  });

  it('schedules an Unscheduled assignment from an HTML drop', async () => {
    const unscheduled = buildAssignment({ id: 202, day_id: day.id, place: museum });
    const onSetAssignmentTime = vi.fn().mockResolvedValue(unscheduled);
    render(<DayTimelinePlanner {...props({ assignments: [unscheduled], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 240, { assignmentId: '202' });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, 202, { place_time: '10:00' }));
  });

  it('moves an Unscheduled assignment into the grid while scheduling is pending and rolls back on failure', async () => {
    const unscheduled = buildAssignment({ id: 202, day_id: day.id, place: museum });
    const response = deferred<Assignment | undefined>();
    const onSetAssignmentTime = vi.fn().mockReturnValue(response.promise);
    render(<DayTimelinePlanner {...props({ assignments: [unscheduled], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    const tray = screen.getByTestId('unscheduled-drop-zone');
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 240, { assignmentId: '202' });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalled());
    expect(grid).toContainElement(screen.getByText('Museum'));
    expect(tray).not.toContainElement(screen.getByText('Museum'));

    response.reject(new Error('schedule failed'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('schedule failed'));
    expect(tray).toContainElement(screen.getByText('Museum'));
  });

  it('renders legacy effective times and preserves their actual duration while a move is pending', async () => {
    const legacyPlace = buildPlace({
      id: museum.id,
      name: museum.name,
      duration_minutes: 60,
      place_time: '09:00',
      end_time: '10:30',
    });
    const legacy = timedAssignment({
      assignment_time: null,
      assignment_end_time: null,
      place: legacyPlace,
    });
    const response = deferred<Assignment | undefined>();
    const onSetAssignmentTime = vi.fn().mockReturnValue(response.promise);
    render(<DayTimelinePlanner {...props({ assignments: [legacy], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    expect(screen.getByText('09:00 – 10:30')).toBeInTheDocument();
    dropAt(grid, 300, { assignmentId: String(legacy.id) });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, legacy.id, { place_time: '11:00' }));
    expect(screen.getByText('11:00 – 12:30')).toBeInTheDocument();
    response.resolve(undefined);
  });

  it('renders a newly assigned POI in the grid while its schedule request is pending and rolls back to Unscheduled', async () => {
    const created = buildAssignment({ id: 205, day_id: day.id, place: museum, place_id: museum.id });
    const response = deferred<Assignment | undefined>();
    const onSetAssignmentTime = vi.fn().mockReturnValue(response.promise);
    render(
      <DayTimelinePlanner {...props({ onAssignToDay: vi.fn().mockResolvedValue(created), onSetAssignmentTime })} />
    );
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    const tray = screen.getByTestId('unscheduled-drop-zone');
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 195, { placeId: '42' });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalled());
    expect(grid).toContainElement(screen.getByText('Museum'));

    response.reject(new Error('schedule failed'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('schedule failed'));
    expect(tray).toContainElement(screen.getByText('Museum'));
  });

  it('recomputes overlap lanes during a pending scheduled move and restores them on rollback', async () => {
    const first = timedAssignment();
    const second = timedAssignment({
      id: 102,
      place: buildPlace({ id: 43, name: 'Gallery' }),
      place_id: 43,
      assignment_time: '09:30',
      assignment_end_time: '10:00',
    });
    const response = deferred<Assignment | undefined>();
    const onSetAssignmentTime = vi.fn().mockReturnValue(response.promise);
    render(<DayTimelinePlanner {...props({ assignments: [first, second], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 300, { assignmentId: '102' });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalled());
    expect(screen.queryByRole('status', { name: /overlapping activities/i })).not.toBeInTheDocument();
    expect(screen.getByText('11:00 – 11:30')).toBeInTheDocument();

    response.reject(new Error('move failed'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('move failed'));
    expect(screen.getByRole('status', { name: /2 overlapping activities/i })).toBeInTheDocument();
  });

  it('moves a scheduled assignment to Unscheduled while removal is pending and restores it on rollback', async () => {
    const response = deferred<Assignment | undefined>();
    const onSetAssignmentTime = vi.fn().mockReturnValue(response.promise);
    render(<DayTimelinePlanner {...props({ assignments: [timedAssignment()], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    const tray = screen.getByTestId('unscheduled-drop-zone');

    fireEvent.click(screen.getByRole('button', { name: 'Remove time' }));

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalled());
    expect(tray).toContainElement(screen.getByText('Museum'));

    response.reject(new Error('remove failed'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('remove failed'));
    expect(grid).toContainElement(screen.getByText('Museum'));
  });

  it('provides an Unscheduled assignment drag handle that can schedule it on the grid', async () => {
    const unscheduled = buildAssignment({ id: 202, day_id: day.id, place: museum });
    const onSetAssignmentTime = vi.fn().mockResolvedValue(unscheduled);
    render(<DayTimelinePlanner {...props({ assignments: [unscheduled], onSetAssignmentTime })} />);
    const handle = screen.getByRole('button', { name: 'Move Museum' });
    const dataTransfer = transfer({ assignmentId: '202' });

    fireEvent.dragStart(handle, { dataTransfer });
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
    dropAt(grid, 240, { assignmentId: '202' });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, 202, { place_time: '10:00' }));
  });

  it('moves a scheduled block and removes its time through dedicated drop targets', async () => {
    const assignment = timedAssignment();
    const onSetAssignmentTime = vi.fn().mockResolvedValue(assignment);
    render(<DayTimelinePlanner {...props({ assignments: [assignment], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 300, { assignmentId: '101' });
    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, 101, { place_time: '11:00' }));

    fireEvent.drop(screen.getByTestId('unscheduled-drop-zone'), {
      dataTransfer: transfer({ assignmentId: '101' }),
    });
    await waitFor(() =>
      expect(onSetAssignmentTime).toHaveBeenCalledWith(10, 101, { place_time: null, end_time: null })
    );
  });

  it('leaves a newly assigned POI Unscheduled and reports a scheduling failure', async () => {
    const created = buildAssignment({ id: 203, day_id: day.id, place: museum });
    const onSetAssignmentTime = vi.fn().mockRejectedValue(new Error('placement conflicts'));
    render(
      <DayTimelinePlanner {...props({ onAssignToDay: vi.fn().mockResolvedValue(created), onSetAssignmentTime })} />
    );
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 195, { placeId: '42' });

    expect(await screen.findByText('Museum')).toBeInTheDocument();
    expect(screen.getByTestId('unscheduled-drop-zone')).toContainElement(screen.getByText('Museum'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('placement conflicts'));
  });

  it('does not retain a locally failed assignment after switching selected days', async () => {
    const created = buildAssignment({ id: 204, day_id: day.id, place: museum });
    const onSetAssignmentTime = vi.fn().mockRejectedValue(new Error('placement conflicts'));
    const view = render(
      <DayTimelinePlanner {...props({ onAssignToDay: vi.fn().mockResolvedValue(created), onSetAssignmentTime })} />
    );
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
    dropAt(grid, 195, { placeId: '42' });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('placement conflicts'));

    view.rerender(
      <DayTimelinePlanner
        {...props({
          day: buildDay({ id: 11, title: 'Next day' }),
          assignments: [],
          onSetAssignmentTime,
        })}
      />
    );

    expect(screen.queryByText('Museum')).not.toBeInTheDocument();
  });

  it('reports a rejected cross-sidebar assignment without an unhandled drop rejection', async () => {
    render(
      <DayTimelinePlanner {...props({ onAssignToDay: vi.fn().mockRejectedValue(new Error('assignment failed')) })} />
    );
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 195, { placeId: '42' });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('assignment failed'));
  });

  it('rejects a move whose duration would pass midnight', async () => {
    const late = timedAssignment({ assignment_time: '23:00', assignment_end_time: '23:45' });
    const onSetAssignmentTime = vi.fn();
    render(<DayTimelinePlanner {...props({ assignments: [late], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);

    dropAt(grid, 1065, { assignmentId: '101' });

    expect(onSetAssignmentTime).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('This activity would end after midnight.');
  });

  it('supports keyboard movement in 15- and 60-minute steps, saving with Enter', async () => {
    const user = userEvent.setup();
    const assignment = timedAssignment();
    const onSetAssignmentTime = vi.fn().mockResolvedValue(assignment);
    render(<DayTimelinePlanner {...props({ assignments: [assignment], onSetAssignmentTime })} />);
    const move = screen.getByRole('button', { name: 'Move Museum' });

    await user.click(move);
    await user.keyboard('{ArrowDown}{PageDown}{Enter}');

    expect(onSetAssignmentTime).toHaveBeenCalledWith(10, 101, { place_time: '10:15' });
    expect(screen.getByText('Proposed time 10:15')).toBeInTheDocument();
  });

  it('uses the visible context-expanded grid start as the keyboard movement lower bound', async () => {
    const user = userEvent.setup();
    const assignment = buildAssignment({ id: 202, day_id: day.id, place: museum });
    const earlyContext = buildDayNote({ id: 603, day_id: day.id, text: 'Early reminder', time: '05:00' });
    const onSetAssignmentTime = vi.fn().mockResolvedValue(assignment);
    render(
      <DayTimelinePlanner {...props({ assignments: [assignment], notes: [earlyContext], onSetAssignmentTime })} />
    );

    await user.click(screen.getByRole('button', { name: 'Move Museum' }));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSetAssignmentTime).toHaveBeenCalledWith(day.id, assignment.id, { place_time: '05:15' });
    expect(screen.getByText('Proposed time 05:15')).toBeInTheDocument();
  });

  it('commits a snapped pointer move only after the handle receives pointer movement', async () => {
    const assignment = timedAssignment();
    const onSetAssignmentTime = vi.fn().mockResolvedValue(assignment);
    render(<DayTimelinePlanner {...props({ assignments: [assignment], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
    const move = screen.getByRole('button', { name: 'Move Museum' });

    fireEvent.pointerDown(move, { pointerId: 7, clientY: 180 });
    fireEvent.pointerMove(move, { pointerId: 7, clientY: 255 });
    fireEvent.pointerUp(move, { pointerId: 7, clientY: 255 });

    await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, 101, { place_time: '10:15' }));
  });

  it('cancels a pointer preview when the browser cancels the gesture', () => {
    const onSetAssignmentTime = vi.fn();
    render(<DayTimelinePlanner {...props({ assignments: [timedAssignment()], onSetAssignmentTime })} />);
    const grid = screen.getByRole('grid', { name: 'Day timeline' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
    const move = screen.getByRole('button', { name: 'Move Museum' });

    fireEvent.pointerDown(move, { pointerId: 7, clientY: 180 });
    fireEvent.pointerMove(move, { pointerId: 7, clientY: 255 });
    expect(screen.getByText('10:15 – 11:45')).toBeInTheDocument();
    fireEvent.pointerCancel(move, { pointerId: 7 });

    expect(screen.getByText('09:00 – 10:30')).toBeInTheDocument();
    expect(onSetAssignmentTime).not.toHaveBeenCalled();
    expect(move).toHaveStyle({ touchAction: 'none' });
  });

  it('clears assignment drag data after a canceled drag and before read-only or unrelated drops return', () => {
    const assignment = timedAssignment();
    const editable = render(<DayTimelinePlanner {...props({ assignments: [assignment] })} />);
    const move = screen.getByRole('button', { name: 'Move Museum' });
    const dataTransfer = transfer({ assignmentId: '101' });

    fireEvent.dragStart(move, { dataTransfer });
    expect(window.__dragData).toMatchObject({ assignmentId: '101' });
    fireEvent.dragEnd(move, { dataTransfer });
    expect(window.__dragData).toBeNull();

    editable.rerender(<DayTimelinePlanner {...props({ assignments: [assignment], canEdit: false })} />);
    window.__dragData = { placeId: '42' };
    fireEvent.drop(screen.getByRole('grid', { name: 'Day timeline' }), { dataTransfer: transfer({}) });
    expect(window.__dragData).toBeNull();

    editable.rerender(<DayTimelinePlanner {...props({ assignments: [assignment] })} />);
    window.__dragData = { placeId: '42' };
    fireEvent.drop(screen.getByTestId('unscheduled-drop-zone'), { dataTransfer: transfer({}) });
    expect(window.__dragData).toBeNull();
  });

  it('cancels keyboard movement with Escape', async () => {
    const user = userEvent.setup();
    const onSetAssignmentTime = vi.fn();
    render(<DayTimelinePlanner {...props({ assignments: [timedAssignment()], onSetAssignmentTime })} />);

    await user.click(screen.getByRole('button', { name: 'Move Museum' }));
    await user.keyboard('{ArrowDown}{Escape}');

    expect(onSetAssignmentTime).not.toHaveBeenCalled();
    expect(screen.getByText('09:00 – 10:30')).toBeInTheDocument();
  });

  it('renders read-only activity details without mutation controls', () => {
    const onSetAssignmentTime = vi.fn();
    render(
      <DayTimelinePlanner {...props({ assignments: [timedAssignment()], canEdit: false, onSetAssignmentTime })} />
    );

    expect(screen.getByText('09:00 – 10:30')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Museum' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove time' })).not.toBeInTheDocument();
  });

  it('keeps true time and all controls visible and focusable in a minimum-height block', () => {
    const short = timedAssignment({
      assignment_time: '09:00',
      assignment_end_time: '09:15',
    });
    render(<DayTimelinePlanner {...props({ assignments: [short] })} />);

    const block = screen.getByRole('group', { name: 'Museum' });
    expect(block).toHaveStyle({ display: 'flex', overflow: 'visible' });
    expect(screen.getByRole('gridcell')).toHaveStyle({ height: '30px' });
    expect(within(block).getByText('09:00 – 09:15')).toBeVisible();
    expect(within(block).getByRole('button', { name: 'Move Museum' })).toHaveAttribute('tabindex', '0');
    expect(within(block).getByRole('button', { name: 'Edit Museum' })).toHaveAttribute('tabindex', '0');
    expect(within(block).getByRole('button', { name: 'Remove time' })).toHaveAttribute('tabindex', '0');
  });

  it('keeps touching minimum-height blocks and their controls visually separated without an overlap warning', () => {
    const first = timedAssignment({ assignment_time: '09:00', assignment_end_time: '09:05' });
    const second = timedAssignment({
      id: 102,
      place_id: 43,
      place: buildPlace({ id: 43, name: 'Gallery' }),
      assignment_time: '09:05',
      assignment_end_time: '09:20',
    });
    render(<DayTimelinePlanner {...props({ assignments: [first, second] })} />);

    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).not.toHaveStyle({ left: cells[1]!.style.left });
    expect(screen.queryByRole('status', { name: /overlapping activities/i })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Museum' })).getByRole('button', { name: 'Remove time' })
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Gallery' })).getByRole('button', { name: 'Remove time' })
    ).toBeVisible();
  });
});
