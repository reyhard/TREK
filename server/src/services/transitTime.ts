import tzlookup from 'tz-lookup';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
  } catch {
    throw new Error(`Invalid IANA timezone: ${timeZone}`);
  }
}

export function assertTransitCoordinate(lat: number, lng: number, label = 'Transit endpoint'): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error(`${label} coordinates are invalid`);
  }
}

export function resolveTransitTimezone(lat: number, lng: number): string {
  assertTransitCoordinate(lat, lng);
  try {
    return tzlookup(lat, lng);
  } catch {
    throw new Error('Could not resolve a timezone for the transit endpoint');
  }
}

function localParts(instantMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}`;
}

function offsetMinutesAt(instantMs: number, timeZone: string): number {
  const value =
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date(instantMs))
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  if (value === 'GMT' || value === 'UTC') return 0;
  const match = value.match(/^GMT([+-])(\d{2}):?(\d{2})$/);
  if (!match) throw new Error(`Could not determine UTC offset for ${timeZone}`);
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string): string {
  if (!DATE_RE.test(date)) throw new Error('date must use YYYY-MM-DD format');
  if (!TIME_RE.test(time)) throw new Error('time must use HH:mm format');
  assertTimeZone(timeZone);

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsets = new Set<number>([
    offsetMinutesAt(naiveUtc - 12 * 60 * 60 * 1000, timeZone),
    offsetMinutesAt(naiveUtc, timeZone),
    offsetMinutesAt(naiveUtc + 12 * 60 * 60 * 1000, timeZone),
  ]);
  const expected = `${date}T${time}`;
  const matches = [...offsets]
    .map((offset) => naiveUtc - offset * 60_000)
    .filter((candidate) => localParts(candidate, timeZone) === expected)
    .sort((a, b) => a - b);
  if (matches.length === 0) throw new Error(`Local time does not exist in ${timeZone}`);
  return new Date(matches[0]).toISOString();
}

function formatPart(iso: string, timeZone: string, dateOnly: boolean): string {
  assertTimeZone(timeZone);
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Transit timestamp must be an ISO date-time');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: dateOnly ? 'numeric' : undefined,
    month: dateOnly ? '2-digit' : undefined,
    day: dateOnly ? '2-digit' : undefined,
    hour: dateOnly ? undefined : '2-digit',
    minute: dateOnly ? undefined : '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return dateOnly ? `${read('year')}-${read('month')}-${read('day')}` : `${read('hour')}:${read('minute')}`;
}

export function formatTransitDate(iso: string, timeZone: string): string {
  return formatPart(iso, timeZone, true);
}

export function formatTransitTime(iso: string, timeZone: string): string {
  return formatPart(iso, timeZone, false);
}
