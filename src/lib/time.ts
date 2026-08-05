/**
 * One timezone for every timestamp the platform displays.
 *
 * Without this, a date rendered on the server used the server's zone (UTC on a
 * typical VPS) and the same date rendered in the browser used the visitor's.
 * For an operator in Tehran that moved every evening timestamp forward a day:
 * 22:40 UTC is 02:10 the following morning at +03:30, so a deal delivered last
 * night appeared to have been delivered today.
 *
 * A deal's history is evidence in a dispute, so it has to read the same for
 * everyone looking at it. Pinning the zone is what makes that true; the buyer
 * and the operator arguing over what time a password arrived cannot be looking
 * at two different answers.
 */
export const DISPLAY_TIME_ZONE = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || "Asia/Tehran";

/** e.g. "Aug 4, 2026, 10:40 PM" */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** e.g. "Aug 4, 10:40 PM" — for rows and chat bubbles, where the year is noise. */
export function formatDayTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** How far the zone is ahead of UTC at a given instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, number>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = Number(part.value);
      return acc;
    }, {});

  // "24" is how en-US with hour12:false spells midnight.
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/**
 * The instant at which the clock in `timeZone` reads the given wall time.
 *
 * `new Date(y, m, d, h, min)` would interpret those numbers in whatever zone
 * the process happens to run in, which is the bug this module exists to stop.
 */
export function zonedTime(
  parts: { year: number; month: number; day: number; hours: number; minutes: number },
  timeZone: string = DISPLAY_TIME_ZONE,
): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes);
  // Applying the offset moves the instant, which can cross a DST boundary and
  // change the offset. Iran has had no DST since 2022, but resolving against
  // the corrected instant costs nothing and keeps this honest elsewhere.
  const first = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(first, timeZone));
}

/** Day of the week in `timeZone`, 0 = Sunday, matching Date#getDay. */
export function weekdayIn(timeZone: string = DISPLAY_TIME_ZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Today's date as the calendar in `timeZone` sees it. */
export function todayIn(timeZone: string = DISPLAY_TIME_ZONE): {
  year: number;
  month: number;
  day: number;
} {
  // en-CA formats as YYYY-MM-DD, which parses without ambiguity.
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { year, month, day };
}
