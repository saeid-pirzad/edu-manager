"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
async function fixture() {
  const rows = [
      {
        id: "first",
        year: "1405-1406",
        term: "اول",
        termKind: "first",
        revision: 1,
      },
      {
        id: "historical",
        year: "1404-1405",
        term: "اول",
        termKind: "first",
        revision: 8,
      },
    ],
    c = vm.createContext({
      workspace: { ...rows[0] },
      connection: {},
      writer: Promise.resolve(),
      assertWorkspaceReadable() {},
      flushDrafts: async () => {},
      captureWorkspaceContext: () => ({
        id: c.workspace.id,
        revision: c.workspace.revision,
      }),
      assertWorkspaceContext: (origin) => {
        if (
          c.workspace.id !== origin.id ||
          c.workspace.revision !== origin.revision
        )
          throw Error("stale context");
      },
      allFrom: async () => rows,
      academicTermKind: (term) => ({ اول: "first", دوم: "second" })[term],
      esc: String,
      showModal: (_title, html) => {
        c.html = html;
      },
    });
  vm.runInContext(source("core/icons.js"), c);
  vm.runInContext(source("workspace/periods/year-editor.js"), c);
  await c.openAcademicYear();
  return { c, rows };
}

test("year navigation exposes only the existing academic year and retains assessment/frozen-report controls", async () => {
  const { c } = await fixture();
  assert.match(c.html, /academic-year-hub/);
  assert.match(c.html, /1405-1406/);
  assert.match(
    c.html,
    /میان‌ترم اول، پایان‌ترم اول، میان‌ترم دوم و پایان‌ترم دوم/,
  );
  assert.match(c.html, /data-workspace-action="term-records"/);
  assert.doesNotMatch(
    c.html,
    /newAcademicYear|create-academic-year|open-academic-year|سال‌های ثبت‌شده|ایجاد سال|1404-1405/,
  );
});

test("opening the year hub never mutates, deletes or re-anchors historical catalog rows", async () => {
  const { c, rows } = await fixture(),
    before = JSON.stringify(rows);
  await c.openAcademicYear();
  assert.equal(JSON.stringify(rows), before);
  assert.equal(c.workspace.id, "first");
  assert.equal(c.workspace.year, "1405-1406");
  assert.equal(c.createAcademicYear, undefined);
  assert.equal(c.openStoredAcademicYear, undefined);
});

test("a context changed during catalog read cannot display a stale year hub", async () => {
  const { c, rows } = await fixture();
  c.html = "unchanged";
  c.allFrom = async () => {
    c.workspace = { ...c.workspace, id: "changed" };
    return rows;
  };
  await assert.rejects(c.openAcademicYear(), /stale context/);
  assert.equal(c.html, "unchanged");
});

test("a retired database during catalog read cannot display a stale year hub", async () => {
  const { c, rows } = await fixture();
  c.html = "unchanged";
  c.allFrom = async () => {
    c.connection = {};
    return rows;
  };
  await assert.rejects(c.openAcademicYear(), /اتصال سال تغییر/);
  assert.equal(c.html, "unchanged");
});

test("a closed active term offers explicit continuation into the unique open term of the same year", async () => {
  const { c, rows } = await fixture();
  c.workspace.closed = true;
  rows[0].closed = true;
  rows.push({
    id: "open-second",
    year: "1405-1406",
    term: "دوم",
    termKind: "second",
    closed: false,
    revision: 1,
  });
  await c.openAcademicYear();
  assert.match(
    c.html,
    /data-workspace-action="switch-period" data-key="open-second">ادامهٔ ثبت روزانه در همین سال/,
  );
  assert.equal(c.workspace.id, "first");
});
for (const state of ["closed", "ambiguous", "other-year"])
  test(
    "no continuation invents an open term when alternatives are " + state,
    async () => {
      const { c, rows } = await fixture();
      c.workspace.closed = true;
      rows[0].closed = true;
      rows[1].closed = true;
      rows.push({
        id: "second",
        year: state === "other-year" ? "1406-1407" : "1405-1406",
        term: "دوم",
        termKind: "second",
        closed: state === "closed",
      });
      if (state === "ambiguous")
        rows.push({
          id: "duplicate",
          year: "1405-1406",
          term: "دوم",
          termKind: "second",
          closed: false,
        });
      await c.openAcademicYear();
      assert.doesNotMatch(c.html, /ادامهٔ ثبت روزانه در همین سال/);
      assert.equal(c.workspace.id, "first");
    },
  );

test("production action dispatch and facade have no year creation or year selection entry point", () => {
  for (const name of [
    "workspace/ui/actions.js",
    "workspace/core/public-api.js",
  ])
    assert.doesNotMatch(
      source(name),
      /createAcademicYear|openStoredAcademicYear|create-academic-year|open-academic-year/,
    );
  assert.match(
    source("workspace/core/public-api.js"),
    /switchPeriod:\s*\(id\) => switchPeriod\(id\)/,
    "the ordinary facade must not forward a caller-supplied legacy permission",
  );
});
