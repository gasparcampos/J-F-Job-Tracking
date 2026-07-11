/**
 * Shop working-hours calendar.
 *
 * Worked time only accumulates inside these windows (shop local time):
 *   Mon–Fri   7:00 AM – 5:30 PM
 *   Saturday  7:00 AM – 2:30 PM
 *   Sunday    closed
 * minus the 30-minute lunch break (12:00 – 12:30 PM) on every working day.
 *
 * All math is done in SHOP_TZ wall-clock time so the result is identical in
 * the browser (shop machines, Central Time) and on the server (Firebase App
 * Hosting runs in UTC).
 */

export const SHOP_TZ = 'America/Chicago';

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

const INTERVALS_BY_DAY: Record<string, Array<[number, number]>> = {
  Mon: WEEKDAY,
  Tue: WEEKDAY,
  Wed: WEEKDAY,
  Thu: WEEKDAY,
  Fri: WEEKDAY,
  Sat: SATURDAY,
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
 * fall inside the shop schedule count. Nights, Sundays, and lunch are skipped,
 * so a clock left running Thursday 5:00 PM through Monday morning only counts
 * Thu 5:00–5:30 PM, all of Friday, Saturday until 2:30 PM, and Monday from
 * 7:00 AM.
 */
export function workingMsBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

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

    for (const [a, b] of INTERVALS_BY_DAY[day.weekday] ?? []) {
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
