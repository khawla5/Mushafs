/**
 * Time helpers. The center operates in Saudi Arabia (UTC+3, no DST); "today", recording
 * days and working-day counting are evaluated in that zone.
 */
export const CENTER_OFFSET_MIN = 180;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Shift a UTC instant into "center local" wall-clock (as a UTC-based Date). */
function toLocal(d: Date) {
  return new Date(d.getTime() + CENTER_OFFSET_MIN * 60_000);
}
function fromLocal(d: Date) {
  return new Date(d.getTime() - CENTER_OFFSET_MIN * 60_000);
}

/** 'YYYY-MM-DD' in center local time. */
export function centerDate(d: Date = new Date()): string {
  return toLocal(d).toISOString().slice(0, 10);
}

/** Weekday 0=Sunday..6=Saturday for a 'YYYY-MM-DD' date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Center-local midnight at the start of `date`, as a real instant. */
export function startOfCenterDay(date: string): Date {
  return fromLocal(new Date(`${date}T00:00:00Z`));
}

/** Instant for `date` at 'HH:MM' center time. */
export function centerDateTime(date: string, hhmm: string): Date {
  return fromLocal(new Date(`${date}T${hhmm}:00Z`));
}

/**
 * Adds `hours` to `start`. With 'working' day counting, configured weekend days
 * are skipped entirely (open question 7: holidays / Ramadan are not yet defined).
 */
export function addDuration(start: Date, hours: number, dayCounting: 'calendar' | 'working', weekendDays: number[]): Date {
  if (dayCounting === 'calendar' || weekendDays.length === 0) return new Date(start.getTime() + hours * HOUR);
  let remaining = hours * HOUR;
  let cursor = toLocal(start).getTime();
  // Safety: at most ~10 years of iterations
  for (let i = 0; i < 4000 && remaining > 0; i++) {
    const day = new Date(cursor);
    const nextMidnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + DAY;
    if (weekendDays.includes(day.getUTCDay())) {
      cursor = nextMidnight;
      continue;
    }
    const chunk = Math.min(remaining, nextMidnight - cursor);
    cursor += chunk;
    remaining -= chunk;
  }
  return fromLocal(new Date(cursor));
}

/** Iterates 'YYYY-MM-DD' dates from `from` to `to` inclusive. */
export function* eachDate(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
