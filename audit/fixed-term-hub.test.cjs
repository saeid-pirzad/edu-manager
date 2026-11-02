"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture({ closed = true, second = false } = {}) {
  const first = {
      id: "first",
      year: "1405-1406",
      term: "عنوان قدیمی نباید نمایش داده شود",
      termKind: "first",
      revision: 3,
      closed,
    },
    rows = [
      first,
      {
        id: "other-year",
        year: "1404-1405",
        term: "سال دیگر مخفی",
        termKind: "first",
        revision: 8,
      },
    ],
    effects = { modals: [], installs: [], switches: [] },
    nodes = new Map();
  if (second)
    rows.push({
      id: "second",
      year: first.year,
      term: "دوم قدیمی",
      termKind: "second",
      revision: 5,
      closed: false,
    });
  const c = vm.createContext({
    workspace: structuredClone(first),
    connection: {},
    state: {},
    db: {
      schools: [],
      sessions: [],
      settings: { academicYear: first.year, academicTerm: first.term },
    },
    writer: Promise.resolve(),
    fileMode: false,
    clone: structuredClone,
    flushDrafts: async () => {},
    assertWorkspaceReadable() {},
    captureWorkspaceContext: () => ({
      id: c.workspace.id,
      revision: c.workspace.revision,
    }),
    assertWorkspaceContext(context) {
      if (
        context.id !== c.workspace.id ||
        context.revision !== c.workspace.revision
      )
        throw Error("stale context");
    },
    allFrom: async (name) =>
      name === "catalog"
        ? structuredClone(rows)
        : [
            {
              id: "own-report",
              workspace: "first",
              at: "2026-11-01T00:00:00Z",
            },
            {
              id: "foreign-report",
              workspace: "other-year",
              at: "2026-11-01T00:00:00Z",
            },
          ],
    readWorkspaceSnapshot: async (id) => ({
      period: structuredClone(rows.find((row) => row.id === id)),
      data: structuredClone(c.db),
    }),
    esc: (value) =>
      String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    showModal(title, html) {
      effects.modals.push({ title, html });
      if (html.includes('id="secondTermStart"'))
        nodes.set("secondTermStart", { isConnected: true });
      return true;
    },
    document: { getElementById: (id) => nodes.get(id) || null },
    EduAcademicYear: { normalize: (year) => year },
    normalizeDB: (data) => data,
  });
  for (const file of [
    "workspace/core/async-target.js",
    "workspace/periods/install.js",
    "workspace/periods/switch-create.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.installWorkspace = async (data, options) => {
    effects.installs.push({
      data: structuredClone(data),
      options: structuredClone(options),
    });
    return { id: "created-second" };
  };
  c.switchPeriod = async (id) => effects.switches.push(id);
  return { c, rows, first, effects, nodes };
}

test("single-year hub presents exactly two canonical terms and no independent year/name/deletion controls", async () => {
  const f = fixture({ second: true });
  await f.c.openPeriods({ notice: "<notice>" });
  const { title, html } = f.effects.modals[0];
  assert.equal(title, "سال تحصیلی و دو ترم");
  assert.equal((html.match(/<tr><td>/g) || []).length, 2);
  assert.match(html, /ترم اول/);
  assert.match(html, /ترم دوم/);
  assert.match(html, /&lt;notice&gt;/);
  assert.match(html, /own-report/);
  assert.doesNotMatch(
    html,
    /عنوان قدیمی|سال دیگر مخفی|1404-1405|foreign-report|دوره/,
  );
  assert.doesNotMatch(
    html,
    /data-workspace-action="(?:new-period|delete-period|edit-period-label)"|id="period(?:Year|Term)"/,
  );
  assert.deepEqual(f.effects.installs, []);
});

for (const closed of [false, true]) {
  test(`missing second term stays pending and ${closed ? "can" : "cannot"} start after the first closes`, async () => {
    const f = fixture({ closed });
    await f.c.openPeriods();
    const html = f.effects.modals[0].html;
    assert.match(html, /شروع‌نشده/);
    assert.equal(
      html.includes('data-workspace-action="new-second-period"'),
      closed,
    );
    assert.deepEqual(f.effects.installs, []);
  });
}

test("legacy duplicate or unsupported terms are retained but do not get silently selected or enable second-term start", async () => {
  const f = fixture();
  f.rows.push({ ...f.first, id: "duplicate-first" });
  await f.c.openPeriods();
  assert.match(f.effects.modals[0].html, /نیازمند بررسی اطلاعات قبلی/);
  assert.doesNotMatch(
    f.effects.modals[0].html,
    /data-workspace-action="new-second-period"/,
  );
  assert.equal(f.rows.length, 3);
});

for (const change of ["workspace", "revision", "connection"]) {
  test(`hub rejects a stale ${change} after asynchronous record reads`, async () => {
    const f = fixture(),
      original = f.c.allFrom;
    f.c.allFrom = async (name) => {
      const rows = await original(name);
      if (name === "reports") {
        if (change === "workspace") f.c.workspace.id = "other-year";
        else if (change === "revision") f.c.workspace.revision++;
        else f.c.connection = {};
      }
      return rows;
    };
    await assert.rejects(f.c.openPeriods());
    assert.deepEqual(f.effects.modals, []);
  });
}

test("public start dialog fixes the current year and second term without editable identity fields", async () => {
  const f = fixture();
  await f.c.openNewPeriod("first");
  const { title, html } = f.effects.modals[0];
  assert.equal(title, "شروع ترم دوم");
  assert.match(html, /1405-1406/);
  assert.doesNotMatch(
    html,
    /id="periodYear"|id="periodTerm"|<select|<input|دوره/,
  );
  f.nodes.set("periodYear", { value: "1490-1491" });
  f.nodes.set("periodTerm", { value: "اول" });
  await f.c.createNewPeriod({ fromDialog: true });
  assert.equal(f.effects.installs[0].options.year, "1405-1406");
  assert.equal(f.effects.installs[0].options.term, "دوم");
  assert.deepEqual(f.effects.installs[0].options.source, {
    id: "first",
    revision: 3,
  });
  assert.deepEqual(f.effects.switches, ["created-second"]);
});

for (const reason of ["open-first", "second-exists", "foreign-first"]) {
  test(`public second-term dialog rejects ${reason} without changing data`, async () => {
    const f = fixture({
      closed: reason !== "open-first",
      second: reason === "second-exists",
    });
    await assert.rejects(
      f.c.openNewPeriod(reason === "foreign-first" ? "other-year" : "first"),
    );
    assert.deepEqual(f.effects.modals, []);
    assert.deepEqual(f.effects.installs, []);
  });
}

for (const change of [
  "no-dialog",
  "closed-dialog",
  "hidden-dialog",
  "workspace",
  "revision",
  "connection",
  "first-revision",
]) {
  test(`UI confirmation rejects ${change} rather than creating an arbitrary term`, async () => {
    const f = fixture();
    if (change !== "no-dialog") await f.c.openNewPeriod("first");
    if (change === "closed-dialog")
      f.nodes.get("secondTermStart").isConnected = false;
    if (change === "hidden-dialog")
      f.nodes.set("modal", { classList: { contains: () => true } });
    if (change === "workspace") f.c.workspace.id = "other-year";
    if (change === "revision") f.c.workspace.revision++;
    if (change === "connection") f.c.connection = {};
    if (change === "first-revision") f.first.revision++;
    await assert.rejects(f.c.createNewPeriod({ fromDialog: true }));
    assert.deepEqual(f.effects.installs, []);
  });
}
