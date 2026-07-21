// FE-PLANNER-TRANSITJOURNEY-001 to 005 — the journey view for a saved transit entry.
import userEvent from '@testing-library/user-event';
import { buildReservation, buildUser } from '../../../tests/helpers/factories';
import { render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import TransitJourneyModal from './TransitJourneyModal';

function makeReservation() {
  return {
    ...buildReservation({
      id: 7,
      type: 'transit',
      title: 'Fernsehturm → Zoo',
      reservation_time: '2025-06-01T08:30:00',
      status: 'confirmed',
    }),
    metadata: {
      transit: {
        provider: 'transitous',
        duration: 1800,
        transfers: 1,
        walk_seconds: 240,
        legs: [
          { mode: 'WALK', duration: 240, from: { name: 'Start' }, to: { name: 'Alexanderplatz' } },
          {
            mode: 'SUBWAY',
            line: 'U2',
            line_color: '#FF3300',
            line_text_color: '#FFFFFF',
            headsign: 'Ruhleben',
            agency: 'BVG',
            duration: 1440,
            stops: 6,
            from: { name: 'Alexanderplatz', time: '08:36', track: '2' },
            to: { name: 'Zoo', time: '09:00' },
          },
        ],
      },
    },
    endpoints: [
      {
        role: 'from',
        sequence: 0,
        name: 'Fernsehturm',
        code: null,
        lat: 52.52,
        lng: 13.4,
        timezone: 'Europe/Berlin',
        local_date: null,
        local_time: null,
      },
      {
        role: 'to',
        sequence: 1,
        name: 'Zoo',
        code: null,
        lat: 52.5,
        lng: 13.33,
        timezone: 'Europe/Berlin',
        local_date: null,
        local_time: null,
      },
    ],
  } as any;
}

function makeProps(overrides = {}) {
  return {
    reservation: makeReservation(),
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue({}),
    onDelete: vi.fn().mockResolvedValue({}),
    onChangeRoute: vi.fn(),
    canEdit: true,
    onUpdateEndpoints: vi.fn().mockResolvedValue({}),
    canEditEndpoints: true,
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useSettingsStore, { settings: { time_format: '24h' } } as any);
});

describe('TransitJourneyModal', () => {
  it('FE-PLANNER-TRANSITJOURNEY-001: shows summary, line badge, platform and legs', () => {
    render(<TransitJourneyModal {...makeProps()} />);
    expect(screen.getByText('U2')).toBeInTheDocument();
    // stat tiles: value + caption
    expect(screen.getByText('Transfers')).toBeInTheDocument();
    expect(screen.getByText('Walking')).toBeInTheDocument();
    expect(screen.getByText(/Platform 2/)).toBeInTheDocument();
    expect(screen.getByText(/Ruhleben/)).toBeInTheDocument();
    expect(screen.getByText(/BVG/)).toBeInTheDocument();
  });

  it('FE-PLANNER-TRANSITJOURNEY-002: inline title rename + notes save as a minimal field payload', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({});
    render(<TransitJourneyModal {...makeProps({ onSave })} />);
    // The title renames inline in the header via its pencil.
    await user.click(screen.getByLabelText('Edit'));
    const titleInput = screen.getByDisplayValue('Fernsehturm → Zoo');
    await user.clear(titleInput);
    await user.type(titleInput, 'Zum Zoo');
    await user.keyboard('{Enter}');
    await user.type(screen.getByPlaceholderText(/notes/i), 'Take **coffee**');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      title: 'Zum Zoo',
      notes: 'Take **coffee**',
      status: 'confirmed',
      confirmation_number: null,
    });
  });

  it('FE-PLANNER-TRANSITJOURNEY-006: status and confirmation fields are editable; notes support a markdown preview', async () => {
    const user = userEvent.setup();
    render(<TransitJourneyModal {...makeProps()} />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText(/Booking Code/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/notes/i), '**bold** note');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const bold = document.querySelector('.collab-note-md strong');
    expect(bold?.textContent).toBe('bold');
  });

  it('FE-PLANNER-TRANSITJOURNEY-008: existing notes open rendered as markdown, not raw text', () => {
    const res = { ...makeReservation(), notes: 'bring **wefwe** along' };
    render(<TransitJourneyModal {...makeProps({ reservation: res })} />);
    // Preview tab is active on open: bold is rendered, no raw asterisks visible.
    const bold = document.querySelector('.collab-note-md strong');
    expect(bold?.textContent).toBe('wefwe');
    expect(screen.queryByDisplayValue(/\*\*wefwe\*\*/)).not.toBeInTheDocument();
  });

  it('FE-PLANNER-TRANSITJOURNEY-007: the markdown toolbar wraps the note text', async () => {
    const user = userEvent.setup();
    render(<TransitJourneyModal {...makeProps()} />);
    const area = screen.getByPlaceholderText(/notes/i) as HTMLTextAreaElement;
    await user.type(area, 'coffee');
    area.setSelectionRange(0, 6);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(area.value).toBe('**coffee**');
    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    expect((screen.getByPlaceholderText(/notes/i) as HTMLTextAreaElement).value).toMatch(/^- \[ \] /);
  });

  it('FE-PLANNER-TRANSITJOURNEY-003: change route triggers onChangeRoute', async () => {
    const user = userEvent.setup();
    const onChangeRoute = vi.fn();
    render(<TransitJourneyModal {...makeProps({ onChangeRoute })} />);
    await user.click(screen.getByRole('button', { name: /Change route/ }));
    expect(onChangeRoute).toHaveBeenCalled();
  });

  it('FE-PLANNER-TRANSITJOURNEY-004: delete asks for confirmation, then calls onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue({});
    render(<TransitJourneyModal {...makeProps({ onDelete })} />);
    await user.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(onDelete).not.toHaveBeenCalled();
    // Confirm dialog appears — confirm it.
    const confirmBtns = await screen.findAllByRole('button', { name: /Delete/ });
    await user.click(confirmBtns[confirmBtns.length - 1]);
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('offers a distinct endpoint editor and keeps Change route available', async () => {
    const user = userEvent.setup();
    render(<TransitJourneyModal {...makeProps()} />);
    expect(screen.getByRole('button', { name: /Change route/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Edit route endpoints/ }));
    expect(screen.getByText('Map route endpoints')).toBeInTheDocument();
    expect(screen.getByText(/changes map pinning only/i)).toBeInTheDocument();
  });

  it('hides endpoint editing without reservation_edit permission', () => {
    render(<TransitJourneyModal {...makeProps({ canEditEndpoints: false })} />);
    expect(screen.queryByRole('button', { name: /Edit route endpoints/ })).not.toBeInTheDocument();
  });

  it('does not offer endpoint editing when from or to is missing', () => {
    const reservation = {
      ...makeReservation(),
      endpoints: makeReservation().endpoints.filter((endpoint: any) => endpoint.role !== 'to'),
    };
    render(<TransitJourneyModal {...makeProps({ reservation })} />);
    expect(screen.queryByRole('button', { name: /Edit route endpoints/ })).not.toBeInTheDocument();
  });

  it('FE-PLANNER-TRANSITJOURNEY-005: read-only without day_edit — no delete/save/change-route, but endpoint editor is shown with reservation_edit alone', () => {
    render(<TransitJourneyModal {...makeProps({ canEdit: false })} />);
    expect(screen.queryByRole('button', { name: /^Delete$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change route/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    // Endpoint editing is gated by reservation_edit (canEditEndpoints), not day_edit
    expect(screen.getByRole('button', { name: /Edit route endpoints/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close/ })).toBeInTheDocument();
  });

  it('hides endpoint editing when reservation_edit is missing even with day_edit', () => {
    render(<TransitJourneyModal {...makeProps({ canEdit: true, canEditEndpoints: false })} />);
    expect(screen.getByRole('button', { name: /Change route/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit route endpoints/ })).not.toBeInTheDocument();
  });
});
