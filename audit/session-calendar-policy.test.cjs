"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const scheduled = { schoolId: "s", classId: "c", lessonId: "l" },
    form = {
      dataset: { sessionSchool: "s", sessionClass: "c", sessionLesson: "l" },
    },
    root = {
      dataset: { sessionDay: "3", sessionPeriod: "0" },
      querySelector: (selector) => ({
        value: selector === "#sessNewClass" ? "c" : "l",
      }),
    };
  const context = vm.createContext({
    db: {
      settings: { academicYear: "1405-1406", weekStartDate: "2026-10-31" },
      activeDays: [0, 1, 2, 3, 4, 5],
      periods: 2,
      masterSchedule: {
        "3-0-all": scheduled,
        "3-0-even": { ...scheduled, lessonId: "other" },
      },
      schools: [{ id: "s", classes: [{ id: "c" }] }],
      sessions: [],
    },
    currentSessionId: "old",
    getSessionById: (id) =>
      context.db.sessions.find((session) => session.id === id),
    getDayIdxFromDate: (date) =>
      (new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7,
  });
  for (const file of [
    "src/domain/calendar.js",
    "src/domain/academic-year.js",
    "src/domain/session-slots.js",
    "src/legacy/ui/lesson.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      context,
    );
  const input = (mode) => ({
    dataset: { sessionCalendar: mode, sessionId: "old" },
    closest: () => (mode === "master" ? root : form),
  });
  return { context, input, root };
}
test("session date policy follows weekday, exact lesson, parity, active days and school year", () => {
  const { context: c, input } = fixture(),
    field = input("lesson");
  assert.equal(c.sessionCalendarDateAllowed(field, "2026-11-03"), true);
  assert.equal(c.sessionCalendarDateAllowed(field, "2026-11-04"), false);
  assert.equal(c.sessionCalendarDateAllowed(field, "2026-11-10"), false);
  assert.equal(c.sessionCalendarDateAllowed(field, "2026-11-17"), true);
  assert.equal(c.sessionCalendarDateAllowed(field, "2025-11-04"), false);
  c.db.activeDays = [];
  assert.equal(c.sessionCalendarDateAllowed(field, "2026-11-03"), false);
});
test("stored session can be continued after schedule changes, but editing to another unscheduled date is denied", () => {
  const { context: c, input } = fixture();
  c.db.sessions.push({
    id: "old",
    schoolId: "s",
    classId: "c",
    lessonId: "l",
    date: "2026-11-04",
    period: 0,
  });
  assert.equal(
    c.sessionCalendarDateAllowed(input("lesson"), "2026-11-04"),
    true,
  );
  assert.equal(c.sessionCalendarDateAllowed(input("edit"), "2026-11-04"), true);
  assert.equal(
    c.sessionCalendarDateAllowed(input("edit"), "2026-11-05"),
    false,
  );
  assert.equal(c.sessionCalendarDateAllowed(input("edit"), "2026-11-03"), true);
  c.currentSessionId = "different";
  assert.equal(
    c.sessionCalendarDateAllowed(input("edit"), "2026-11-03"),
    false,
  );
});
test("master date picker requires its clicked weekday and bell and reads the current lesson selection", () => {
  const { context: c, input, root } = fixture();
  assert.equal(
    c.sessionCalendarDateAllowed(input("master"), "2026-11-03"),
    true,
  );
  root.dataset.sessionPeriod = "1";
  assert.equal(
    c.sessionCalendarDateAllowed(input("master"), "2026-11-03"),
    false,
  );
  root.dataset.sessionPeriod = "0";
  root.dataset.sessionDay = "4";
  assert.equal(
    c.sessionCalendarDateAllowed(input("master"), "2026-11-03"),
    false,
  );
  root.dataset.sessionDay = "3";
  root.querySelector = (selector) => ({
    value: selector === "#sessNewClass" ? "c" : "other",
  });
  assert.equal(
    c.sessionCalendarDateAllowed(input("master"), "2026-11-10"),
    true,
  );
});
