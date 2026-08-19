import type { GoitEvent } from "./types.ts";

const DEADLINE_TYPES = new Set([
  "lessonHomeworkDeadline",
  "deadlineAllCourseHomeworks",
]);

const DEADLINE_MEET_TYPES = new Set([
  "hwDeadline",
  "finProjectDeadline",
  "finTestDeadline",
]);

const GOIT_TIME_ZONE = "Europe/Kyiv";

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return (
    Date.UTC(
      values.year!,
      values.month! - 1,
      values.day!,
      values.hour!,
      values.minute!,
      values.second!,
    ) - date.getTime()
  );
}

function goitWallTimeToDate(value: string): Date {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return new Date(value);

  const wallTimeAsUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
  );
  const firstGuess = new Date(wallTimeAsUtc);
  const firstOffset = timeZoneOffsetMs(firstGuess, GOIT_TIME_ZONE);
  const candidate = new Date(wallTimeAsUtc - firstOffset);

  // A second pass handles dates close to daylight-saving transitions.
  const correctedOffset = timeZoneOffsetMs(candidate, GOIT_TIME_ZONE);
  return new Date(wallTimeAsUtc - correctedOffset);
}

export function getEventStart(event: GoitEvent): Date | null {
  const value = event.start ?? event.startUtcDateTime;
  if (!value) return null;

  // GoIT labels event timestamps with Z, but its calendar renders the numeric
  // clock value as Europe/Kyiv local time. Treat the API value as a Kyiv wall
  // time so reminders match what the student sees in the LMS.
  const date = goitWallTimeToDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getEventId(event: GoitEvent): string {
  const raw = event.resource?.id ?? event.id;
  return raw == null ? "" : String(raw);
}

export function getEventTitle(event: GoitEvent): string {
  return (
    event.resource?.moduleName ??
    event.title ??
    event.resource?.courseName ??
    "Подія GoIT"
  );
}

export function isDeadline(event: GoitEvent): boolean {
  const type = event.resource?.type ?? "";
  const meetType = event.resource?.meetType ?? "";
  const title = getEventTitle(event).toLocaleLowerCase("uk");

  return (
    DEADLINE_TYPES.has(type) ||
    DEADLINE_MEET_TYPES.has(meetType) ||
    title.includes("дедлайн") ||
    title.includes("deadline")
  );
}

export interface DigestEvents {
  upcomingEvents: GoitEvent[];
  upcomingDeadlines: GoitEvent[];
}

export function selectDigestEvents(events: GoitEvent[], now: Date): DigestEvents {
  const nowMs = now.getTime();
  const upcomingEvents: GoitEvent[] = [];
  const upcomingDeadlines: GoitEvent[] = [];

  for (const event of events) {
    const start = getEventStart(event);
    if (!start || start.getTime() <= nowMs) continue;
    if (isDeadline(event)) {
      upcomingDeadlines.push(event);
    } else {
      upcomingEvents.push(event);
    }
  }

  const byStart = (left: GoitEvent, right: GoitEvent) =>
    getEventStart(left)!.getTime() - getEventStart(right)!.getTime();

  // TEMPORARY TEST MODE: show only the single nearest event/deadline,
  // ignoring the normal 24h / 3-day windows. Revert before going live.
  return {
    upcomingEvents: upcomingEvents.sort(byStart).slice(0, 1),
    upcomingDeadlines: upcomingDeadlines.sort(byStart).slice(0, 1),
  };
}
