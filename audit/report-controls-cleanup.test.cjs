"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture(audience, { prepared = false } = {}) {
  const filters = {
      schoolId: "school",
      classId: "class",
      studentId: "student",
      date: "2026-11-03",
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      audience,
      detailLevel: "summary",
      author: "EXISTING AUTHOR",
    },
    model = {
      author: "EXISTING AUTHOR",
      note: "EXISTING REPORT NOTE",
      sessions: [{ teacher: "LESSON TEACHER", note: "SESSION NOTE" }],
    },
    context = vm.createContext({
      filters,
      db: {
        settings: { academicYear: "1405-1406" },
        sessions: [],
        schools: [
          {
            id: "school",
            name: "SCHOOL",
            classes: [
              {
                id: "class",
                name: "CLASS",
                students: [{ id: "student", name: "STUDENT", code: "001" }],
              },
            ],
          },
        ],
      },
      initialize() {},
      setTimeout() {},
      loadAnnualPeriodChoices() {},
      modeLabel: (mode) => mode,
      reportSignature: () => "unchanged",
      last: prepared ? { signature: "unchanged", model } : null,
      busy: false,
      esc: String,
      noteWarning: () => '<p role="alert">PRESERVED NOTE RECOVERY</p>',
      // Simplifying the controls must not load, overwrite, or clear old notes.
      readNote() {
        throw Error("Report controls must not read old report notes.");
      },
      documentHtml: (report) =>
        report.author +
        report.note +
        report.sessions[0].teacher +
        report.sessions[0].note,
    });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/render.js"),
      "utf8",
    ),
    context,
  );
  return { context, filters, model };
}

for (const mode of ["daily", "weekly", "monthly", "annual"])
  for (const audience of ["management", "parent"])
    test(`${mode} ${audience} controls omit redundant manual author and note fields`, () => {
      const { context, filters } = fixture(audience),
        before = JSON.stringify(filters),
        html = context.render(mode);
      assert.doesNotMatch(
        html,
        /نام دبیر \/ تنظیم‌کننده|توضیحات این گزارش|reports-periodic-render:[78]|<textarea/,
      );
      assert.match(html, /reports-periodic-render:9/);
      assert.match(html, /periodicNoteStatus/);
      assert.match(html, /PRESERVED NOTE RECOVERY/);
      assert.equal(JSON.stringify(filters), before);
    });

test("simpler controls preserve already prepared report metadata and genuine notes", () => {
  const { context, filters, model } = fixture("management", { prepared: true }),
    before = JSON.stringify({ filters, model }),
    html = context.render("daily");
  for (const value of [
    model.author,
    model.note,
    model.sessions[0].teacher,
    model.sessions[0].note,
  ])
    assert.ok(html.includes(value));
  assert.equal(JSON.stringify({ filters, model }), before);
});
