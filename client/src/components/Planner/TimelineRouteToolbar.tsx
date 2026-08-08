import { Car, Footprints, Route, TramFront } from 'lucide-react';

import { useTranslation } from '../../i18n';

export interface TimelineRouteToolbarProps {
  dayId: number;
  routeShown: boolean;
  routeProfile: 'driving' | 'walking';
  onToggleRoute?: () => void;
  onSetRouteProfile?: (profile: 'driving' | 'walking') => void;
  onPlanTransit?: (dayId: number) => void;
}

export function TimelineRouteToolbar({
  dayId,
  routeShown,
  routeProfile,
  onToggleRoute,
  onSetRouteProfile,
  onPlanTransit,
}: TimelineRouteToolbarProps) {
  const { t } = useTranslation();
  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 8px',
    border: '1px solid var(--border-faint)',
    borderRadius: 7,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 600,
  };

  return (
    <div
      role="toolbar"
      data-testid="timeline-route-toolbar"
      aria-label={t('dayplan.route')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderBottom: '1px solid var(--border-faint)',
        background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-card))',
      }}
    >
      {onToggleRoute && (
        <button
          type="button"
          aria-pressed={routeShown}
          className={routeShown ? 'bg-accent text-accent-text' : 'bg-surface text-content'}
          onClick={onToggleRoute}
          style={{ ...buttonStyle, background: routeShown ? undefined : 'var(--bg-surface)' }}
        >
          <Route size={14} aria-hidden="true" />
          {t('dayplan.route')}
        </button>
      )}
      {onSetRouteProfile && (
        <div
          role="group"
          aria-label={t('dayplan.route')}
          style={{ display: 'flex', border: '1px solid var(--border-faint)', borderRadius: 7, overflow: 'hidden' }}
        >
          <button
            type="button"
            aria-label={t('dayplan.movement.walking')}
            aria-pressed={routeProfile === 'walking'}
            className={routeProfile === 'walking' ? 'bg-accent text-accent-text' : 'bg-surface text-content'}
            onClick={() => onSetRouteProfile('walking')}
            style={{ ...buttonStyle, border: 0, borderRadius: 0, background: routeProfile === 'walking' ? undefined : 'var(--bg-surface)' }}
          >
            <Footprints size={14} aria-hidden="true" />
            {t('dayplan.movement.walking')}
          </button>
          <button
            type="button"
            aria-label={t('dayplan.movement.driving')}
            aria-pressed={routeProfile === 'driving'}
            className={routeProfile === 'driving' ? 'bg-accent text-accent-text' : 'bg-surface text-content'}
            onClick={() => onSetRouteProfile('driving')}
            style={{
              ...buttonStyle,
              border: 0,
              borderLeft: '1px solid var(--border-faint)',
              borderRadius: 0,
              background: routeProfile === 'driving' ? undefined : 'var(--bg-surface)',
            }}
          >
            <Car size={14} aria-hidden="true" />
            {t('dayplan.movement.driving')}
          </button>
        </div>
      )}
      {onPlanTransit && (
        <button
          type="button"
          onClick={() => onPlanTransit(dayId)}
          style={{
            ...buttonStyle,
            marginLeft: 'auto',
            borderColor: '#7c3aed',
            background: 'rgba(124, 58, 237, 0.12)',
            color: 'var(--text-primary)',
          }}
        >
          <TramFront size={14} aria-hidden="true" />
          {t('transit.title')}
        </button>
      )}
    </div>
  );
}
