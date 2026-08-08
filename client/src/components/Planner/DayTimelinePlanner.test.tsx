import userEvent from '@testing-library/user-event';

import { buildAssignment, buildDay, buildPlace } from '../../../tests/helpers/factories';
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
});
