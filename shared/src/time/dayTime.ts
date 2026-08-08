export interface DayTimeOptions {
  allowEndOfDay?: boolean;
}

export function parseDayTime(value: unknown, options: DayTimeOptions = {}): number | null {
  if (typeof value !== 'string') return null;
  if (options.allowEndOfDay && value === '24:00') return 1440;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

export function formatDayTime(total: number, options: DayTimeOptions = {}): string | null {
  if (!Number.isInteger(total) || total < 0 || total > 1440) return null;
  if (total === 1440) return options.allowEndOfDay ? '24:00' : null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function addDayDuration(start: string, durationMinutes: number): string | null {
  const parsed = parseDayTime(start);
  if (parsed === null || !Number.isInteger(durationMinutes) || durationMinutes <= 0) return null;
  return formatDayTime(parsed + durationMinutes, { allowEndOfDay: true });
}
