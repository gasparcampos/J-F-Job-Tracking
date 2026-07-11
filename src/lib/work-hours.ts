/**
 * Shop working-hours calendar.
 *
 * Worked time only accumulates inside these windows (shop local time):
 *
 * DAY shift (every department except Night Shift):
 *   Mon–Fri   7:00 AM – 5:30 PM
 *   Saturday  7:00 AM – 2:30 PM
 *   Sunday    closed
 * minus the 30-minute lunch break (12:00 – 12:30 PM) on every working day.
 *
 * NIGHT shift (the Night Shift department):
 *   Mon, Tue, Thu, Fri   6:00 PM – 2:30 AM (they rest Wednesday)
 * minus a 30-minute lunch break at 10:00 – 10:30 PM.
 *
 * All math is done in SHOP_TZ wall-clock time so the result is identical in
 * the browser (shop machines, Central Time) and on the server (Firebase App
 * Hosting runs in UTC).
 */

export const SHOP_TZ = 'America/Chicago';

export type Shift = 'day' | 'night';

// Departments whose jobs run on the night schedule (d4 = "Night shift" in
// the seeded board). Every other department uses the day schedule.
const NIGHT_DEPT_IDS = new Set(['d4']);

export function shiftForDepartment(deptId?: string): Shift {
  return deptId && NIGHT_DEPT_IDS.has(deptId) ? 'night' : 'day';
}

// ---------- Day shift ----------

// Lunch break, minutes-of-day. Change here if the shop eats at another time.
const LUNCH_START = 12 * 60; // 12:00 PM
const LUNCH_END = 12 * 60 + 30; // 12:30 PM

// Working intervals per weekday as [start, end] minutes-of-day, with lunch
// already carved out.
const WEEKDAY: Array<[number, number]> = [
  [7 * 60, LUNCH_START], // 7:00 AM – 12:00 PM
  [LUNCH_END, 17 * 60 + 30], // 12:30 PM – 5:30 PM
];
const SATURDAY: Array<[number, number]> = [
  [7 * 60, LUNCH_START], // 7:00 AM – 12:00 PM
  [LUNCH_END, 14 * 60 + 30], // 12:30 PM – 2:30 PM
];

const DAY_INTERVALS: Record<string, Array<[number, number]>> = {
  Mon: WEEKDAY,
  Tue: WEEKDAY,
  Wed: WEEKDAY,
  Thu: WEEKDAY,
  Fri: WEEKDAY,
  Sat: SATURDAY,
  Sun: [],
};

// ---------- Night shift ----------

// The night shift crosses midnight (6:00 PM – 2:30 AM), so each shift is
// split into an evening block on the start day and a tail (12:00 – 2:30 AM)
// on the following calendar day. They rest Wednesday, which is why Thursday
// has no tail (no shift started Wednesday evening).
const NIGHT_LUNCH_START = 22 * 60; // 10:00 PM
const NIGHT_LUNCH_END = 22 * 60 + 30; // 10:30 PM

const NIGHT_EVENING: Array<[number, number]> = [
  [18 * 60, NIGHT_LUNCH_START], // 6:00 PM – 10:00 PM
  [NIGHT_LUNCH_END, 24 * 60], // 10:30 PM – midnight
];
const NIGHT_TAIL: Array<[number, number]> = [
  [0, 2 * 60 + 30], // midnight – 2:30 AM
];

const NIGHT_INTERVALS: Record<string, Array<[number, number]>> = {
  Mon: NIGHT_EVENING,
  Tue: [...NIGHT_TAIL, ...NIGHT_EVENING],
  Wed: NIGHT_TAIL,
  Thu: NIGHT_EVENING,
  Fri: [...NIGHT_TAIL, ...NIGHT_EVENING],
  Sat: NIGHT_TAIL,
  Sun: [],
};

// Cached formatter — constructing Intl.DateTimeFormat is expensive and the
// live card counters call this every second.
const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TZ,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Shop-local calendar date, weekday and minutes-of-day for an instant. */
function shopParts(ms: number): { dateKey: string; weekday: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    // Some engines report midnight as hour "24".
    minutes: ((Number(parts.hour) % 24) * 60) + Number(parts.minute) + Number(parts.second) / 60,
  };
}

/**
 * Milliseconds of WORKING time between two instants: only the portions that
 * fall inside the shop schedule count. Off-hours, rest days, and lunch are
 * skipped, so a day-shift clock left running Thursday 5:00 PM through Monday
 * morning only counts Thu 5:00–5:30 PM, all of Friday, Saturday until
 * 2:30 PM, and Monday from 7:00 AM. Pass shift 'night' for the Night Shift
 * department's schedule.
 */
export function workingMsBetween(startMs: number, endMs: number, shift: Shift = 'day'): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  const intervals = shift === 'night' ? NIGHT_INTERVALS : DAY_INTERVALS;
  const end = shopParts(endMs);
  let cursor = startMs;
  let first = true;
  let total = 0;

  // Day-by-day walk; the cap bounds runaway loops (~1.5 years is far longer
  // than any job lives on the board — beyond that the count just stops).
  for (let i = 0; i < 550; i++) {
    const day = shopParts(cursor);
    const isLastDay = day.dateKey === end.dateKey;
    const from = first ? day.minutes : 0;
    const to = isLastDay ? end.minutes : 24 * 60;

    for (const [a, b] of intervals[day.weekday] ?? []) {
      const lo = Math.max(a, from);
      const hi = Math.min(b, to);
      if (hi > lo) total += (hi - lo) * 60000;
    }

    if (isLastDay) break;
    // Jump to (about) the next shop-local midnight. DST shifts can land this
    // slightly before/after midnight, but the affected hours (late night /
    // early morning, and only around Sunday 2 AM) are outside working windows,
    // so the total is unaffected.
    cursor += (24 * 60 - day.minutes) * 60000 + 1000;
    first = false;
  }

  return Math.round(total);
}
