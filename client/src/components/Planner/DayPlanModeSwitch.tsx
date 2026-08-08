import React, { useState } from 'react';

import { useTranslation } from '../../i18n';

export type DayPlanMode = 'list' | 'timeline';

interface DayPlanModeSwitchProps {
  tripId: number;
  mode?: DayPlanMode;
  onModeChange?: (mode: DayPlanMode) => void;
}

export function readDayPlanMode(tripId: number): DayPlanMode {
  try {
    return localStorage.getItem(`day-plan-mode-${tripId}`) === 'timeline' ? 'timeline' : 'list';
  } catch {
    return 'list';
  }
}

export const DayPlanModeSwitch = React.memo(function DayPlanModeSwitch({
  tripId,
  mode: controlledMode,
  onModeChange,
}: DayPlanModeSwitchProps) {
  const { t } = useTranslation();
  const [internalMode, setInternalMode] = useState<DayPlanMode>(() => readDayPlanMode(tripId));
  const mode = controlledMode ?? internalMode;

  const selectMode = (nextMode: DayPlanMode) => {
    try {
      localStorage.setItem(`day-plan-mode-${tripId}`, nextMode);
    } catch {}
    if (controlledMode === undefined) setInternalMode(nextMode);
    onModeChange?.(nextMode);
  };

  return (
    <div
      role="group"
      aria-label={t('trip.timeline.viewMode')}
      style={{
        display: 'inline-flex',
        padding: 2,
        borderRadius: 8,
        background: 'var(--bg-hover)',
        border: '1px solid var(--border-faint)',
      }}
    >
      {(['list', 'timeline'] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          onClick={() => selectMode(item)}
          className="text-content"
          style={{
            border: 0,
            borderRadius: 6,
            background: mode === item ? 'var(--bg-card)' : 'transparent',
            boxShadow: mode === item ? 'var(--shadow-sm)' : 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 10px',
          }}
        >
          {t(`trip.timeline.mode.${item}`)}
        </button>
      ))}
    </div>
  );
});
