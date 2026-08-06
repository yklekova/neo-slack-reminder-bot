import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEventStart,
  isDeadline,
  selectDigestEvents,
} from "../src/reminders.ts";
import type { GoitEvent } from "../src/types.ts";

const now = new Date("2026-08-06T06:00:00.000Z");

function event(
  start: string,
  type = "lesson",
  title = "Навчальна подія",
): GoitEvent {
  return { title, start, resource: { id: title, type } };
}

describe("GoIT event normalization", () => {
  it("recognizes homework deadlines", () => {
    assert.equal(
      isDeadline(event("2026-08-09T23:45:00.000Z", "lessonHomeworkDeadline")),
      true,
    );
  });

  it("recognizes custom final-project deadlines", () => {
    assert.equal(
      isDeadline({
        title: "Фінальний проєкт",
        resource: { type: "custom", meetType: "finProjectDeadline" },
      }),
      true,
    );
  });

  it("interprets GoIT timestamps as Kyiv wall time", () => {
    assert.equal(
      getEventStart(event("2026-08-07T19:30:00.000Z"))?.toISOString(),
      "2026-08-07T16:30:00.000Z",
    );
  });
});

describe("daily digest selection", () => {
  it("includes lessons in the next 24 hours", () => {
    const digest = selectDigestEvents(
      [event("2026-08-07T08:00:00.000Z")],
      now,
    );
    assert.equal(digest.upcomingEvents.length, 1);
  });

  it("excludes lessons more than 24 hours away", () => {
    const digest = selectDigestEvents(
      [event("2026-08-07T10:00:00.000Z")],
      now,
    );
    assert.equal(digest.upcomingEvents.length, 0);
  });

  it("includes deadlines in the next three days", () => {
    const digest = selectDigestEvents(
      [event("2026-08-09T08:00:00.000Z", "lessonHomeworkDeadline")],
      now,
    );
    assert.equal(digest.upcomingDeadlines.length, 1);
  });

  it("excludes past events", () => {
    const digest = selectDigestEvents(
      [event("2026-08-06T08:00:00.000Z")],
      now,
    );
    assert.deepEqual(digest, { upcomingEvents: [], upcomingDeadlines: [] });
  });

  it("sorts selected events chronologically", () => {
    const later = event("2026-08-07T08:00:00.000Z", "lesson", "Пізніше");
    const sooner = event("2026-08-06T12:00:00.000Z", "lesson", "Раніше");
    const digest = selectDigestEvents([later, sooner], now);
    assert.deepEqual(
      digest.upcomingEvents.map((item) => item.title),
      ["Раніше", "Пізніше"],
    );
  });
});
