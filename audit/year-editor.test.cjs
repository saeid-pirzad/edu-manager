"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
async function fixture() {
  const effects = [],
    installs = [],
    error = { textContent: "" },
    form = { isConnected: true, querySelector: () => error },
    input = { value: "1406-1407", form },
    modal = { classList: { contains: () => false } },
    rows = [
      {
        id: "first",
        year: "1405-1406",
        term: "اول",
        termKind: "first",
        revision: 1,
      },
    ],
    c = vm.createContext({
      workspace: { ...rows[0] },
      connection: {},
      db: { schools: [{ id: "existing" }], sessions: [{ id: "history" }] },
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
        return true;
      },
      document: {
        getElementById: (id) => (id === "newAcademicYear" ? input : modal),
      },
      beginRecordEditorSave: () => {
        effects.push("begin");
        let finished = false;
        return () => {
          if (finished) return;
          finished = true;
          effects.push("finish");
        };
      },
      rememberRecordEditor: (savedForm) => {
        assert.equal(savedForm, form);
        effects.push("remember");
      },
      v24DefaultDB: () => ({
        schools: [],
        sessions: [],
        masterSchedule: {},
        settings: { password: "" },
      }),
      installWorkspace: async (data, details) => {
        installs.push({
          data: structuredClone(data),
          details: structuredClone(details),
        });
        return {
          id: "created",
          year: details.year,
          term: details.term,
          revision: 1,
        };
      },
      switchPeriod: async (id) => {
        effects.push("switch:" + id);
        c.workspace = {
          id,
          year: installs.at(-1)?.details.year || "1404-1405",
          revision: 1,
        };
      },
      setStatus: () => effects.push("status"),
      scheduleSingleFile: () => effects.push("backup"),
      handleError: (err) => {
        error.textContent = err.message;
      },
      readRecord: async (_store, id) => rows.find((row) => row.id === id),
      rememberAcademicYear: (year) => effects.push("remember:" + year),
    });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "workspace/periods/year-editor.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
    );
  await c.openAcademicYear();
  return { c, effects, installs, error, form, input, rows };
}
test("year navigation exposes the current year and a separate empty-year creation form", async () => {
  const f = await fixture();
  assert.match(f.c.html, /academic-year-hub/);
  assert.match(f.c.html, /newAcademicYear/);
  assert.match(f.c.html, /1406-1407/);
  assert.match(f.c.html, /فهرست خالی/);
  assert.match(f.c.html, /data-key="first" disabled/);
});
test("equivalent Persian year input creates empty records and preserves the previous live data", async () => {
  const f = await fixture(),
    before = JSON.stringify(f.c.db);
  f.input.value = "۱۴۰۶–۱۴۰۷";
  assert.equal(await f.c.createAcademicYear(), true);
  assert.equal(f.installs.length, 1);
  assert.deepEqual(f.installs[0].data.schools, []);
  assert.deepEqual(f.installs[0].data.sessions, []);
  assert.deepEqual(f.installs[0].data.masterSchedule, {});
  assert.equal(f.installs[0].data.settings.academicYear, "1406-1407");
  assert.equal(f.installs[0].details.newAcademicYear, true);
  assert.equal(JSON.stringify(f.c.db), before);
  assert.deepEqual(f.effects, [
    "begin",
    "finish",
    "remember",
    "switch:created",
    "status",
    "backup",
  ]);
});
for (const label of ["1405-1407", "", "not-a-year"])
  test(
    "invalid year refuses creation without any write: " + label,
    async () => {
      const f = await fixture();
      f.input.value = label;
      assert.equal(await f.c.createAcademicYear(), false);
      assert.equal(f.installs.length, 0);
      assert.match(f.error.textContent, /سال تحصیلی/);
      assert.deepEqual(f.effects, ["begin", "finish"]);
    },
  );
test("a year represented only by its second term still blocks duplicate year creation", async () => {
  const f = await fixture();
  f.rows.push({
    id: "second",
    year: "1406-1407",
    term: "دوم",
    termKind: "second",
  });
  assert.equal(await f.c.createAcademicYear(), false);
  assert.equal(f.installs.length, 0);
  assert.match(f.error.textContent, /قبلاً/);
});
test("stale context during grade flush cannot create or switch a year", async () => {
  const f = await fixture();
  f.c.flushDrafts = async () => {
    f.c.workspace = { ...f.c.workspace, id: "changed" };
  };
  assert.equal(await f.c.createAcademicYear(), false);
  assert.equal(f.installs.length, 0);
  assert.match(f.error.textContent, /stale/);
});
test("a detached form during asynchronous preparation cannot install a year", async () => {
  const f = await fixture();
  f.c.flushDrafts = async () => {
    f.form.isConnected = false;
  };
  assert.equal(await f.c.createAcademicYear(), false);
  assert.equal(f.installs.length, 0);
  assert.match(f.error.textContent, /فرم سال/);
});
test("rapid repeated submission creates the year once and releases the editor saving guard", async () => {
  const f = await fixture();
  let release;
  f.c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = f.c.createAcademicYear();
  assert.equal(await f.c.createAcademicYear(), false);
  release();
  assert.equal(await first, true);
  assert.equal(f.installs.length, 1);
  assert.equal(vm.runInContext("academicYearSaving", f.c), false);
});
test("a declined modal replacement keeps the previously accepted editor identity", async () => {
  const f = await fixture(),
    accepted = vm.runInContext("academicYearEditing", f.c);
  f.c.showModal = () => false;
  await f.c.openAcademicYear();
  assert.equal(vm.runInContext("academicYearEditing", f.c), accepted);
});
test("failed installation preserves the selected year and exposes an inline error", async () => {
  const f = await fixture();
  f.c.installWorkspace = async () => {
    throw Error("atomic duplicate year");
  };
  assert.equal(await f.c.createAcademicYear(), false);
  assert.equal(f.c.workspace.id, "first");
  assert.equal(f.error.textContent, "atomic duplicate year");
  assert.deepEqual(f.effects, ["begin", "finish"]);
});

test("a closed active term offers explicit continuation into the unique open term of the same year", async () => {
  const f = await fixture();
  f.c.workspace.closed = true;
  f.rows[0].closed = true;
  f.rows.push({
    id: "open-second",
    year: "1405-1406",
    term: "دوم",
    termKind: "second",
    closed: false,
    revision: 1,
  });
  await f.c.openAcademicYear();
  assert.match(
    f.c.html,
    /data-key="open-second">ادامهٔ ثبت روزانه در همین سال/,
  );
  assert.equal(f.c.workspace.id, "first");
  assert.deepEqual(f.effects, []);
});
for (const state of ["closed", "ambiguous", "other-year"])
  test(
    "no continuation invents an open term when alternatives are " + state,
    async () => {
      const f = await fixture();
      f.c.workspace.closed = true;
      f.rows[0].closed = true;
      f.rows.push({
        id: "second",
        year: state === "other-year" ? "1406-1407" : "1405-1406",
        term: "دوم",
        termKind: "second",
        closed: state === "closed",
      });
      if (state === "ambiguous")
        f.rows.push({
          id: "duplicate",
          year: "1405-1406",
          term: "دوم",
          termKind: "second",
          closed: false,
        });
      await f.c.openAcademicYear();
      assert.doesNotMatch(f.c.html, /ادامهٔ ثبت روزانه در همین سال/);
      assert.equal(f.c.workspace.id, "first");
    },
  );

test("a successfully installed year releases its editor lock and acknowledges saved input before navigation", async () => {
  const f = await fixture();
  f.c.switchPeriod = async () => {
    assert.deepEqual(f.effects, ["begin", "finish", "remember"]);
    assert.equal(f.installs.length, 1);
    assert.equal(vm.runInContext("academicYearSaving", f.c), true);
    assert.equal(vm.runInContext("academicYearEditing", f.c), null);
    f.effects.push("switch:created");
  };
  assert.equal(await f.c.createAcademicYear(), true);
  assert.equal(f.effects.filter((entry) => entry === "finish").length, 1);
});
