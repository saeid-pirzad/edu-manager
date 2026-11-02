"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const c = vm.createContext({
    root: {},
    esc: String,
    faDate: String,
    modeLabel: String,
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "reports/periodic/date-range.js",
    "reports/periodic/model.js",
    "reports/periodic/text.js",
    "reports/periodic/document.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  const data = {
    settings: { academicYear: "1405-1406", academicTerm: "دوم" },
    schools: [
      {
        id: "school",
        name: "SCHOOL",
        classes: [{ id: "class", name: "CLASS", students: [], lessons: [] }],
      },
    ],
    sessions: [],
  };
  return { c, data };
}

for (const mode of ["daily", "weekly", "monthly"]) {
  test(`${mode} empty report explicitly retains selected term in JSON, HTML, text and deputy output`, () => {
    const { c, data } = fixture(),
      before = JSON.stringify(data),
      model = c.build(data, {
        mode,
        date: "2026-10-31",
        schoolId: "school",
        audience: "management",
      });
    assert.equal(JSON.parse(JSON.stringify(model)).academicTerm, "دوم");
    assert.equal(model.summary.sessions, 0);
    assert.match(c.documentHtml(model), /ترم دوم/);
    assert.match(c.textReport(model), /ترم: دوم/);
    assert.match(c.deputyReport(model), /ترم: دوم/);
    assert.equal(JSON.stringify(data), before);
  });
}

test("annual report labels both terms rather than implying the selected term only", () => {
  const { c, data } = fixture();
  data.settings.academicTerm = "اول و دوم";
  const model = c.build(data, {
    mode: "annual",
    date: "2026-10-31",
    schoolId: "school",
    audience: "management",
  });
  assert.equal(model.academicTerm, "اول و دوم");
  assert.match(c.documentHtml(model), /ترم اول و دوم/);
  assert.match(c.textReport(model), /ترم: اول و دوم/);
  assert.match(c.deputyReport(model), /ترم: اول و دوم/);
});
