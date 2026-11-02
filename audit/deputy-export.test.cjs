"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(
  path.join(__dirname, "../src/workspace/reports/deputy-export.js"),
  "utf8",
);
const snapshotSource = fs.readFileSync(
  path.join(__dirname, "../src/workspace/reports/snapshots.js"),
  "utf8",
);

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

function fixture({ profile = null, legacy = null } = {}) {
  const downloads = [],
    errors = [],
    writes = [],
    builds = [],
    snapshots = [],
    observers = [],
    panels = [],
    identityReads = [],
    identitySaves = [],
    catalogChecks = [],
    scheduled = [],
    local = new Map();
  if (legacy !== null)
    local.set("EduDeputy.teacherExport.v1", JSON.stringify(legacy));
  const parts = [
    {
      period: {
        id: "first",
        year: "1405-1406",
        revision: 1,
        termKind: "first",
      },
      data: {
        schools: [
          { id: "school", name: "هنرستان یک", classes: [] },
          { id: "other", name: '<script>alert("other")</script>', classes: [] },
        ],
        sessions: [],
        settings: { password: "never-export-password" },
      },
    },
    {
      period: {
        id: "second",
        year: "1405-1406",
        revision: 2,
        termKind: "second",
      },
      data: {
        schools: [{ id: "school", name: "هنرستان یک", classes: [] }],
        sessions: [],
        settings: { password: "another-password" },
      },
    },
  ];
  const modal = { hidden: false, classList: { contains: () => modal.hidden } };
  let panel;
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const c = vm.createContext({
    workspace: {
      id: "first",
      year: "1405-1406",
      revision: 1,
      termKind: "first",
    },
    liveCatalog: structuredClone(parts.map((part) => part.period)),
    busy: false,
    drafts: new Map(),
    assessmentContext: { hasDrafts: () => !!c.assessmentDrafts },
    connection: {},
    state: { schoolId: "school", classId: "one-class" },
    blocked: false,
    authenticated: true,
    scope: "report-scope",
    structuredClone,
    crypto,
    uid: () => crypto.randomUUID(),
    confirm: () => true,
    esc: escape,
    db: { settings: { password: "password" }, schools: [] },
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => {
        writes.push({ key, value: JSON.parse(value) });
        local.set(key, value);
      },
      removeItem: (key) => local.delete(key),
    },
    MutationObserver: class {
      constructor(callback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
    document: {
      getElementById: (id) =>
        id === "modal" ? modal : id === "modalBody" ? {} : panel,
    },
    showModal(title, html) {
      if (c.rejectModal) return false;
      if (panel) panel.isConnected = false;
      modal.hidden = false;
      const nodes = new Map(),
        events = new Map();
      panel = {
        html,
        title,
        isConnected: true,
        events,
        addEventListener: (event, callback) => events.set(event, callback),
        querySelector: (selector) => {
          if (!nodes.has(selector)) {
            const nodeEvents = new Map();
            nodes.set(selector, {
              value: "",
              checked: false,
              hidden: true,
              disabled: true,
              innerHTML: "",
              textContent: "",
              open: false,
              readOnly: false,
              classList: { add() {}, remove() {}, toggle() {} },
              setAttribute() {},
              removeAttribute() {},
              events: nodeEvents,
              addEventListener: (event, callback) =>
                nodeEvents.set(event, callback),
            });
          }
          return nodes.get(selector);
        },
      };
      panels.push(panel);
      return true;
    },
    assertWorkspaceReadable: () => {
      if (c.blocked || !c.authenticated) throw Error("unreadable");
    },
    assertWorkspaceContext: (context) => {
      c.assertWorkspaceReadable();
      if (
        context.id !== c.workspace.id ||
        context.revision !== c.workspace.revision
      )
        throw Error("stale context");
    },
    reportCopyScope: () => c.scope,
    allFrom: async (store) => {
      assert.equal(store, "catalog");
      return structuredClone(c.liveCatalog);
    },
    readRecord: async (store, id) => {
      assert.equal(store, "catalog");
      return structuredClone(c.liveCatalog.find((row) => row.id === id));
    },
    markWorkspaceConflict: () => {
      c.blocked = true;
    },
    prepareReportSnapshot: async (options) => {
      snapshots.push(options);
      return {
        context: {
          id: c.workspace.id,
          revision: c.workspace.revision,
          yearScope: c.workspace.year,
          members: parts.map((part) => ({
            id: part.period.id,
            revision: part.period.revision,
          })),
        },
        parts,
      };
    },
    beginRecordEditorSave: () => () => {},
    scheduleSingleFile: (...args) => scheduled.push(args),
    EduDeputyExchange: {
      validate: (packet) => structuredClone(packet),
      build: (options) => {
        builds.push(options);
        if (
          !options.schoolCode ||
          !options.sender.code ||
          !options.sender.name ||
          !options.schoolId
        )
          throw Error("شناسهٔ معتبر مدرسه و فرستنده الزامی است.");
        return {
          format: "EduManager.DeputyExchange",
          version: 1,
          id: "packet",
          exportedAt: "2026-11-02T09:00:00.000Z",
          academicYear: "1405-1406",
          sender: {
            name: options.sender.name.trim(),
            code: c.EduDeputyExportIdentity.code(options.sender.code),
          },
          school: {
            id: options.schoolId,
            code: c.EduDeputyExportIdentity.code(options.schoolCode),
            name: "هنرستان یک",
          },
          scope: "school-year",
          periods: [],
        };
      },
      plan: () => ({
        counts: {
          periods: 2,
          classes: 1,
          students: 3,
          lessons: 2,
          sessions: 5,
          activities: 0,
        },
      }),
    },
    downloadJSON: (value, name, options) =>
      downloads.push({ value, name, options }),
    handleError: (error) => errors.push(error.message),
  });
  c.window = c;
  for (const name of ["calendar", "academic-year", "deputy-export-identity"])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/domain", name + ".js"),
        "utf8",
      ),
      c,
    );
  c.savedIdentity = profile && c.EduDeputyExportIdentity.normalize(profile);
  // Exercise the production catalog/revision/year-scope guards, not a no-op
  // snapshot mock. Only transport and unrelated workspace side effects are fake.
  vm.runInContext(
    snapshotSource.slice(
      snapshotSource.indexOf("function assertLiveWorkspace("),
      snapshotSource.indexOf("function selectAnnualPeriods("),
    ) +
      snapshotSource.slice(
        snapshotSource.indexOf("function selectYearActivityPeriods("),
        snapshotSource.indexOf("async function prepareKarnamehSnapshot("),
      ),
    c,
  );
  c.readDeputyExportIdentity = async ({
    check = () => {},
    validateCatalog = null,
  } = {}) => {
    identityReads.push(c.savedIdentity?.token || null);
    check();
    if (c.readIdentityFailure) throw Error("identity read failed");
    if (c.beforeIdentityRead) await c.beforeIdentityRead();
    check();
    if (validateCatalog) {
      catalogChecks.push("read");
      validateCatalog(structuredClone(c.liveCatalog));
    }
    return c.savedIdentity && structuredClone(c.savedIdentity);
  };
  c.saveDeputyExportIdentity = async (
    next,
    { expectedToken = null, check = () => {}, validateCatalog = null } = {},
  ) => {
    check();
    if (c.saveIdentityFailure) throw Error("identity save failed");
    if (c.beforeIdentitySave) await c.beforeIdentitySave();
    check();
    if (validateCatalog) {
      catalogChecks.push("save");
      validateCatalog(structuredClone(c.liveCatalog));
    }
    if ((c.savedIdentity?.token || null) !== expectedToken)
      throw Error("identity changed in another window");
    const saved = c.EduDeputyExportIdentity.normalize({
      ...next,
      token: "saved-" + (identitySaves.length + 1),
    });
    identitySaves.push(structuredClone(saved));
    c.savedIdentity = saved;
    check();
    return structuredClone(saved);
  };
  const formHelpers = path.join(
    __dirname,
    "../src/workspace/reports/deputy-export-form.js",
  );
  vm.runInContext(fs.readFileSync(formHelpers, "utf8"), c);
  vm.runInContext(source, c);
  const node = (name) => panel.querySelector('[name="' + name + '"]');
  const fill = () => {
    node("deputySchool").value = "school";
    node("deputyIdentityMode").value = "existing";
    node("deputySchoolCode").value = "SCHOOL-1";
    node("deputySenderName").value = "دبیر نمونه";
    node("deputySenderCode").value = "TEACHER-1";
    node("deputyConsent").checked = true;
  };
  return {
    c,
    parts,
    node,
    fill,
    builds,
    writes,
    local,
    identityReads,
    identitySaves,
    catalogChecks,
    scheduled,
    panels,
    snapshots,
    downloads,
    panel: () => panel,
    async ready() {
      assert.equal(await c.openDeputyExport("school"), true);
      fill();
    },
    close() {
      modal.hidden = true;
      for (const observer of observers) observer();
    },
    status: () =>
      panel.querySelector("[data-deputy-export-status]").textContent,
    error: () => panel.querySelector("[data-deputy-export-error]").textContent,
  };
}

function savedProfile() {
  return {
    version: 1,
    token: "stored-1",
    sender: { name: "دبیر ثابت", code: "TEACHER-OLD" },
    schools: [{ year: "1405-1406", id: "school", code: "SCHOOL-1" }],
  };
}

test("fresh setup requires choosing a new or existing sender rather than silently forking identity", async () => {
  const f = fixture();
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.node("deputyIdentityMode").value, "");
  assert.equal(f.node("deputySenderCode").value, "");
  f.node("deputySchoolCode").value = "SCHOOL-1";
  f.node("deputySenderName").value = "دبیر تازه";
  f.node("deputyConsent").checked = true;
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(f.identitySaves.length, 0);
  assert.equal(f.downloads.length, 0);
});

test("a newly generated sender code remains stable across reopening and repeat sends", async () => {
  const f = fixture();
  assert.equal(await f.c.openDeputyExport("school"), true);
  const mode = f.node("deputyIdentityMode");
  mode.value = "new";
  mode.events.get("change")?.({ target: mode });
  f.node("deputySchoolCode").value = "SCHOOL-1";
  f.node("deputySenderName").value = "دبیر تازه";
  f.node("deputyConsent").checked = true;
  const generated = f.node("deputySenderCode").value;
  assert.match(generated, /^[A-Z0-9][A-Z0-9_-]{0,63}$/);
  assert.equal(f.node("deputySenderCode").readOnly, true);
  const packet = await f.c.prepareDeputyPacket();
  assert.notEqual(packet, false, f.error());
  assert.equal(packet.sender.code, generated);
  await f.c.exportDeputyPacket();
  f.close();
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.node("deputySenderCode").value, generated);
  assert.equal(f.node("deputyIdentityMode").disabled, true);
  f.node("deputyConsent").checked = true;
  assert.equal((await f.c.prepareDeputyPacket()).sender.code, generated);
  assert.notEqual(await f.c.exportDeputyPacket(), false, f.error());
  assert.equal(f.identitySaves.length, 1);
  assert.equal(f.downloads.length, 2);
});

test("valid remembered legacy codes migrate without replacing the sender or school identity", async () => {
  const f = fixture({
    legacy: {
      sender: { name: "دبیر قدیمی", code: " teacher-۷ " },
      schools: [{ year: "1405-1406", id: "school", code: " school-۱ " }],
    },
  });
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.node("deputyIdentityMode").value, "existing");
  assert.equal(f.node("deputySenderName").value, "دبیر قدیمی");
  assert.equal(
    f.c.EduDeputyExportIdentity.code(f.node("deputySenderCode").value),
    "TEACHER-7",
  );
  assert.equal(
    f.c.EduDeputyExportIdentity.code(f.node("deputySchoolCode").value),
    "SCHOOL-1",
  );
  f.node("deputyConsent").checked = true;
  const packet = await f.c.prepareDeputyPacket();
  assert.notEqual(packet, false, f.error());
  assert.equal(packet.sender.code, "TEACHER-7");
  assert.equal(f.c.savedIdentity.sender.code, "TEACHER-7");
  assert.equal(f.local.has("EduDeputy.teacherExport.v1"), false);
});

test("migrating one school retains the other valid legacy school codes", async () => {
  const f = fixture({
    legacy: {
      sender: { name: "دبیر قدیمی", code: "TEACHER-OLD" },
      schools: [
        { year: "1405-1406", id: "school", code: "SCHOOL-1" },
        { year: "1405-1406", id: "other", code: "SCHOOL-2" },
      ],
    },
  });
  assert.equal(await f.c.openDeputyExport("school"), true);
  f.node("deputyConsent").checked = true;
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.equal(f.c.savedIdentity.schools.length, 2);
  f.close();
  assert.equal(await f.c.openDeputyExport("other"), true);
  assert.equal(f.node("deputySchoolCode").value, "SCHOOL-2");
  assert.equal(
    f.panel().querySelector("[data-deputy-export-identity]").open,
    false,
  );
});

test("invalid unrelated legacy rows warn without blocking a valid selected school", async () => {
  const f = fixture({
    legacy: {
      sender: { name: "دبیر قدیمی", code: "TEACHER-OLD" },
      schools: [
        { year: "1405-1406", id: "school", code: "SCHOOL-1" },
        { year: "1405-1406", id: "deleted-school", code: "invalid code" },
        { year: "invalid", id: "deleted-year", code: "OTHER" },
      ],
    },
  });
  assert.equal(await f.c.openDeputyExport("school"), true, f.error());
  assert.equal(f.node("deputySchoolCode").value, "SCHOOL-1");
  const warning = f.panel().querySelector("[data-deputy-legacy-warning]");
  assert.notEqual(warning.textContent, "");
  f.node("deputyConsent").checked = true;
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.equal(f.c.savedIdentity.schools.length, 1);
  assert.equal(warning.textContent, "");
  assert.notEqual(await f.c.exportDeputyPacket(), false, f.error());
});

test("identical legacy school rows are deduplicated safely", async () => {
  const school = { year: "1405-1406", id: "school", code: "SCHOOL-1" };
  const f = fixture({
    legacy: {
      sender: { name: "دبیر قدیمی", code: "TEACHER-OLD" },
      schools: [school, { ...school, code: " school-۱ " }],
    },
  });
  assert.equal(await f.c.openDeputyExport("school"), true, f.error());
  assert.equal(f.node("deputySchoolCode").value, "SCHOOL-1");
  f.node("deputyConsent").checked = true;
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.equal(f.c.savedIdentity.schools.length, 1);
});

for (const conflicting of [
  { year: "1405-1406", id: "school", code: "CONFLICT" },
  { year: "1405-1406", id: "other", code: "SCHOOL-1" },
]) {
  test(`conflicting legacy school mapping ${JSON.stringify(conflicting)} is not guessed`, async () => {
    const f = fixture({
      legacy: {
        sender: { name: "دبیر قدیمی", code: "TEACHER-OLD" },
        schools: [
          { year: "1405-1406", id: "school", code: "SCHOOL-1" },
          conflicting,
        ],
      },
    });
    assert.equal(await f.c.openDeputyExport("school"), true, f.error());
    assert.equal(f.node("deputySchoolCode").value, "");
    assert.notEqual(
      f.panel().querySelector("[data-deputy-legacy-warning]").textContent,
      "",
    );
    f.node("deputyConsent").checked = true;
    assert.equal(await f.c.prepareDeputyPacket(), false);
    assert.equal(f.identitySaves.length, 0);
    assert.equal(f.downloads.length, 0);
  });
}

for (const schools of [{ invalid: true }, "invalid", null]) {
  test(`malformed legacy school defaults (${JSON.stringify(schools)}) do not break a fresh setup`, async () => {
    const f = fixture({
      legacy: { sender: { code: { invalid: true }, name: 100 }, schools },
    });
    assert.equal(await f.c.openDeputyExport("school"), true, f.error());
    assert.equal(f.node("deputySenderCode").value, "");
    assert.equal(f.node("deputyIdentityMode").disabled, false);
    assert.equal(f.node("deputyIdentityMode").value, "");
    f.fill();
    assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
    assert.notEqual(await f.c.exportDeputyPacket(), false, f.error());
  });
}

for (const [teachers, expected] of [
  [["دبیر الف", " دبیر الف "], "دبیر الف"],
  [["دبیر الف", "دبیر ب"], ""],
]) {
  test(`sender name inference is safe for ${expected ? "one unique teacher" : "ambiguous teachers"}`, async () => {
    const f = fixture();
    f.parts[0].data.schools[0].classes = [
      { id: "class", lessons: teachers.map((teacher) => ({ teacher })) },
    ];
    assert.equal(await f.c.openDeputyExport("school"), true);
    assert.equal(f.node("deputySenderName").value, expected);
    assert.equal(f.node("deputySenderCode").value, "");
    assert.equal(f.identitySaves.length, 0);
  });
}

test("persisted sender details take precedence over lesson-name inference", async () => {
  const f = fixture({ profile: savedProfile() });
  f.parts[0].data.schools[0].classes = [
    { id: "class", lessons: [{ teacher: "نام دیگر در درس" }] },
  ];
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.node("deputySenderName").value, "دبیر ثابت");
  assert.equal(f.node("deputySenderCode").value, "TEACHER-OLD");
});

test("selecting another school needs its code once without losing the saved sender or prior school", async () => {
  const f = fixture({ profile: savedProfile() });
  assert.equal(await f.c.openDeputyExport("school"), true);
  const select = f.node("deputySchool");
  select.value = "other";
  select.events.get("change")?.({ target: select });
  assert.equal(f.node("deputySchoolCode").value, "");
  assert.equal(f.node("deputySenderCode").value, "TEACHER-OLD");
  assert.equal(
    f.panel().querySelector("[data-deputy-export-identity]").open,
    true,
  );
  f.node("deputyConsent").checked = true;
  assert.equal(await f.c.prepareDeputyPacket(), false);
  f.node("deputySchoolCode").value = "SCHOOL-2";
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.equal(f.c.savedIdentity.schools.length, 2);
  assert.equal(f.c.savedIdentity.sender.code, "TEACHER-OLD");
  f.close();
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.node("deputySchoolCode").value, "SCHOOL-1");
  f.close();
  assert.equal(await f.c.openDeputyExport("other"), true);
  assert.equal(f.node("deputySchoolCode").value, "SCHOOL-2");
  assert.equal(
    f.panel().querySelector("[data-deputy-export-identity]").open,
    false,
  );
});

for (const phase of ["prepare", "download"]) {
  test(`a sender profile changed in another window blocks ${phase}`, async () => {
    const f = fixture({ profile: savedProfile() });
    assert.equal(await f.c.openDeputyExport("school"), true);
    f.node("deputyConsent").checked = true;
    if (phase === "download")
      assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
    f.c.savedIdentity = { ...f.c.savedIdentity, token: "changed-elsewhere" };
    assert.equal(
      await (phase === "prepare"
        ? f.c.prepareDeputyPacket()
        : f.c.exportDeputyPacket()),
      false,
    );
    assert.equal(f.downloads.length, 0);
    assert.equal(f.identitySaves.length, 0);
  });
}

const catalogMutations = {
  "peer term revision": (catalog) =>
    catalog.find((row) => row.id === "second").revision++,
  "peer term deletion": (catalog) =>
    catalog.splice(
      catalog.findIndex((row) => row.id === "second"),
      1,
    ),
  "new same-year term": (catalog) =>
    catalog.push({
      id: "new-second",
      year: "1405-1406",
      termKind: "second",
      revision: 1,
    }),
  "peer term moves to another year": (catalog) => {
    catalog.find((row) => row.id === "second").year = "1406-1407";
  },
};
for (const phase of ["prepare", "download"]) {
  for (const [reason, mutate] of Object.entries(catalogMutations)) {
    test(`final atomic catalog validation rejects ${reason} during ${phase} with an unchanged local workspace`, async () => {
      const f = fixture({ profile: savedProfile() });
      assert.equal(await f.c.openDeputyExport("school"), true);
      f.node("deputyConsent").checked = true;
      if (phase === "download")
        assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
      const originalWorkspace = structuredClone(f.c.workspace);
      f.c.beforeIdentityRead = () => {
        mutate(f.c.liveCatalog);
        f.c.beforeIdentityRead = null;
      };
      assert.equal(
        await (phase === "prepare"
          ? f.c.prepareDeputyPacket()
          : f.c.exportDeputyPacket()),
        false,
      );
      assert.deepEqual(structuredClone(f.c.workspace), originalWorkspace);
      assert.ok(f.catalogChecks.includes("read"));
      assert.equal(f.identitySaves.length, 0);
      assert.equal(f.downloads.length, 0);
    });
  }
}

for (const [reason, mutate] of [
  [
    "record save in progress",
    (c) => {
      c.busy = true;
    },
  ],
  ["new grade draft", (c) => c.drafts.set("grade", { value: 0 })],
  [
    "assessment draft",
    (c) => {
      c.assessmentDrafts = true;
    },
  ],
]) {
  test(`final identity validation refuses a ${reason} that appears after the report snapshot check`, async () => {
    const f = fixture({ profile: savedProfile() });
    assert.equal(await f.c.openDeputyExport("school"), true);
    f.node("deputyConsent").checked = true;
    assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
    f.c.beforeIdentityRead = () => {
      mutate(f.c);
      f.c.beforeIdentityRead = null;
    };
    assert.equal(await f.c.exportDeputyPacket(), false);
    assert.equal(f.downloads.length, 0);
  });
}

test("catalog changes during the identity save abort setup before writing the profile", async () => {
  const f = fixture();
  await f.ready();
  f.c.beforeIdentitySave = () => {
    f.c.liveCatalog.find((row) => row.id === "second").revision++;
  };
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.ok(f.catalogChecks.includes("save"));
  assert.equal(f.identitySaves.length, 0);
  assert.equal(f.downloads.length, 0);
});

test("identity compare-and-swap refuses a concurrent first setup instead of overwriting it", async () => {
  const f = fixture();
  await f.ready();
  f.c.beforeIdentitySave = () => {
    f.c.savedIdentity = savedProfile();
  };
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(f.c.savedIdentity.token, "stored-1");
  assert.equal(f.identitySaves.length, 0);
  assert.equal(f.downloads.length, 0);
});

for (const [acknowledged, confirmed] of [
  [false, true],
  [true, false],
]) {
  test(`changing a saved sender code requires ${acknowledged ? "final confirmation" : "explicit acknowledgement"}`, async () => {
    const f = fixture({ profile: savedProfile() });
    assert.equal(await f.c.openDeputyExport("school"), true);
    f.node("deputySenderCode").value = "TEACHER-REPLACED";
    f.node("deputyChangeIdentity").checked = acknowledged;
    f.node("deputyConsent").checked = true;
    f.c.confirm = () => confirmed;
    assert.equal(await f.c.prepareDeputyPacket(), false);
    assert.equal(f.c.savedIdentity.sender.code, "TEACHER-OLD");
    assert.equal(f.identitySaves.length, 0);
    assert.equal(f.downloads.length, 0);
  });
}

test("an explicitly confirmed identity correction preserves other school mappings", async () => {
  const profile = savedProfile();
  profile.schools.push({ year: "1405-1406", id: "other", code: "SCHOOL-2" });
  const f = fixture({ profile });
  assert.equal(await f.c.openDeputyExport("school"), true);
  f.node("deputySenderCode").value = "TEACHER-REPLACED";
  f.node("deputySchoolCode").value = "SCHOOL-NEW";
  f.node("deputyChangeIdentity").checked = true;
  f.node("deputyConsent").checked = true;
  const confirmations = [];
  f.c.confirm = (message) => {
    confirmations.push(message);
    return true;
  };
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.equal(f.c.savedIdentity.sender.code, "TEACHER-REPLACED");
  assert.equal(
    f.c.savedIdentity.schools.find((school) => school.id === "other").code,
    "SCHOOL-2",
  );
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /TEACHER-OLD/);
  assert.match(confirmations[0], /TEACHER-REPLACED/);
  assert.match(confirmations[0], /SCHOOL-1/);
  assert.match(confirmations[0], /SCHOOL-NEW/);
});

test("teacher deputy export opens a separate whole-year flow without sending or remembering anything", async () => {
  const f = fixture();
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.snapshots.length, 1);
  assert.equal(f.snapshots[0].yearWide, true);
  assert.equal(f.node("deputySchool").value, "school");
  assert.equal(f.downloads.length, 0);
  assert.equal(f.writes.length, 0);
  assert.match(f.panel().html, /محدودیت تاریخ گزارش روی آن اعمال نمی‌شود/);
  assert.match(f.panel().html, /این فایل پشتیبان نیست/);
  assert.match(f.node("deputySchool").innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(f.node("deputySchool").innerHTML, /<script>/);
});

test("teacher deputy export has separate preview and download with stable explicit sender and school codes", async () => {
  const f = fixture();
  await f.ready();
  const packet = await f.c.prepareDeputyPacket();
  assert.equal(packet.format, "EduManager.DeputyExchange");
  assert.equal(f.builds[0].parts, f.parts);
  assert.equal(f.builds[0].schoolId, "school");
  assert.equal(f.builds[0].sender.code, "TEACHER-1");
  assert.equal(f.downloads.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(
    f.panel().querySelector("[data-deputy-export-preview]").hidden,
    false,
  );
  assert.match(
    f.panel().querySelector("[data-deputy-export-preview]").innerHTML,
    /رمزها، تنظیمات، پیش‌نویس‌ها، پشتیبان‌ها و مدارس دیگر در فایل نیستند/,
  );
  assert.deepEqual(await f.c.exportDeputyPacket(), packet);
  assert.equal(f.downloads.length, 1);
  assert.equal(
    f.downloads[0].name,
    "edu-deputy-SCHOOL-1-TEACHER-1-1405-1406-20261102090000Z.json",
  );
  assert.deepEqual(f.downloads[0].value, packet);
  assert.equal(f.downloads[0].options.compact, true);
  assert.equal(f.writes.length, 0);
  assert.match(f.status(), /دریافت فایل درخواست شد/);
  assert.doesNotMatch(
    JSON.stringify(packet),
    /never-export-password|another-password/,
  );
});

test("actual JSON download preserves pretty defaults but deputy machine files are compact UTF-8", async () => {
  const f = fixture(),
    delivered = [];
  f.c.Blob = Blob;
  f.c.downloadLocalFile = (blob, name) => delivered.push({ blob, name });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/local.js"),
      "utf8",
    ),
    f.c,
  );
  const sample = { text: "هنرجو 😀", score: 0, cleared: null };
  f.c.downloadJSON(sample, "regular-backup.json");
  assert.equal(await delivered[0].blob.text(), JSON.stringify(sample, null, 2));
  await f.ready();
  const packet = await f.c.prepareDeputyPacket();
  await f.c.exportDeputyPacket();
  assert.equal(await delivered[1].blob.text(), JSON.stringify(packet));
  assert.equal(
    delivered[1].blob.size,
    Buffer.byteLength(JSON.stringify(packet), "utf8"),
  );
  assert.equal(delivered[1].blob.type, "application/json;charset=utf-8");
});

test("teacher exporter handshake uses the actual exchange builder, validator and preview counts without a domain stub", async () => {
  const f = fixture();
  for (const name of [
    "calendar",
    "academic-year",
    "data-boundary",
    "grade-math",
    "grade-policy",
    "reporting/academic-results",
    "deputy-exchange",
  ])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/domain", name + ".js"),
        "utf8",
      ),
      f.c,
    );
  await f.ready();
  f.node("deputySchoolCode").value = " school-۱ ";
  f.node("deputySenderCode").value = " teacher-۱ ";
  const preview = await f.c.prepareDeputyPacket();
  assert.notEqual(preview, false, f.error());
  assert.equal(preview.school.code, "SCHOOL-1");
  assert.equal(preview.sender.code, "TEACHER-1");
  assert.equal(preview.periods.length, 2);
  assert.equal(preview.periods[0].school.id, "school");
  assert.doesNotMatch(
    JSON.stringify(preview),
    /never-export-password|another-password|other/,
  );
  assert.match(
    f.panel().querySelector("[data-deputy-export-preview]").innerHTML,
    /۲ ترم/,
  );
  assert.match(
    f.panel().querySelector("[data-deputy-export-preview]").innerHTML,
    /ترم اول · نسخهٔ ۱.*ترم دوم · نسخهٔ ۲/,
  );
  const exported = await f.c.exportDeputyPacket();
  assert.deepEqual(exported, preview);
  assert.equal(f.downloads.length, 1);
  assert.equal(
    f.c.EduDeputyExchange.validate(f.downloads[0].value).school.code,
    "SCHOOL-1",
  );
});

test("exchange filenames distinguish senders and snapshots without exposing student or sender names", async () => {
  const first = fixture(),
    second = fixture();
  await first.ready();
  await second.ready();
  second.node("deputySenderCode").value = "TEACHER-2";
  await first.c.prepareDeputyPacket();
  await second.c.prepareDeputyPacket();
  await first.c.exportDeputyPacket();
  await second.c.exportDeputyPacket();
  assert.notEqual(first.downloads[0].name, second.downloads[0].name);
  assert.match(
    first.downloads[0].name,
    /SCHOOL-1-TEACHER-1-1405-1406-20261102090000Z\.json$/,
  );
  assert.match(
    second.downloads[0].name,
    /SCHOOL-1-TEACHER-2-1405-1406-20261102090000Z\.json$/,
  );
  assert.doesNotMatch(first.downloads[0].name, /دبیر|نمونه|هنرجو/);
});

test("teacher deputy identity is durably saved by preparation and reused without any remember option", async () => {
  const f = fixture();
  await f.ready();
  assert.equal(f.identitySaves.length, 0);
  await f.c.prepareDeputyPacket();
  assert.equal(f.identitySaves.length, 1);
  assert.deepEqual(structuredClone(f.c.savedIdentity.sender), {
    name: "دبیر نمونه",
    code: "TEACHER-1",
  });
  assert.deepEqual(structuredClone(f.c.savedIdentity.schools), [
    { year: "1405-1406", id: "school", code: "SCHOOL-1" },
  ]);
  assert.doesNotMatch(f.panel().html, /name="deputyRemember"/);
  await f.c.exportDeputyPacket();
  assert.equal(f.identitySaves.length, 1);
  assert.equal(f.scheduled.length, 1);
  assert.equal(f.writes.length, 0);
  f.close();
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.node("deputySenderName").value, "دبیر نمونه");
  assert.equal(f.node("deputySenderCode").value, "TEACHER-1");
  assert.equal(f.node("deputySchoolCode").value, "SCHOOL-1");
  assert.equal(
    f.panel().querySelector("[data-deputy-export-identity]").open,
    false,
  );
  f.node("deputyConsent").checked = true;
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.notEqual(await f.c.exportDeputyPacket(), false, f.error());
  assert.equal(f.identitySaves.length, 1);
  assert.equal(f.downloads.length, 2);
});

test("malformed legacy preferences do not prevent a new durable setup", async () => {
  const f = fixture();
  f.c.localStorage.getItem = () => "invalid json";
  await f.ready();
  f.c.localStorage.setItem = () => {
    throw Error("storage denied");
  };
  await f.c.prepareDeputyPacket();
  assert.equal((await f.c.exportDeputyPacket()).id, "packet");
  assert.equal(f.downloads.length, 1);
  assert.equal(f.identitySaves.length, 1);
});

test("denied legacy browser preferences do not block a successful IndexedDB identity setup", async () => {
  const f = fixture();
  f.c.localStorage.getItem = () => {
    throw Error("local preferences denied");
  };
  f.c.localStorage.removeItem = () => {
    throw Error("local preferences denied");
  };
  await f.ready();
  assert.notEqual(await f.c.prepareDeputyPacket(), false, f.error());
  assert.notEqual(await f.c.exportDeputyPacket(), false, f.error());
  assert.equal(f.identitySaves.length, 1);
  assert.equal(f.downloads.length, 1);
});

test("failed migration preserves legacy identity preferences for retry", async () => {
  const f = fixture({
    legacy: {
      sender: { name: "دبیر قبلی", code: "TEACHER-OLD" },
      schools: [{ year: "1405-1406", id: "school", code: "SCHOOL-1" }],
    },
  });
  assert.equal(await f.c.openDeputyExport("school"), true);
  f.node("deputyConsent").checked = true;
  f.c.saveIdentityFailure = true;
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(f.local.has("EduDeputy.teacherExport.v1"), true);
  assert.equal(f.identitySaves.length, 0);
  assert.equal(f.downloads.length, 0);
});

test("a failed durable identity write prevents preview and file download", async () => {
  const f = fixture();
  await f.ready();
  f.c.saveIdentityFailure = true;
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.identitySaves.length, 0);
  assert.equal(f.downloads.length, 0);
});

test("a failed identity read cannot silently fall back to a new sender", async () => {
  const f = fixture();
  f.c.readIdentityFailure = true;
  assert.equal(await f.c.openDeputyExport("school"), false);
  f.fill();
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(f.identitySaves.length, 0);
  assert.equal(f.downloads.length, 0);
});

for (const field of [
  "deputySchool",
  "deputySchoolCode",
  "deputySenderName",
  "deputySenderCode",
  "deputyIdentityMode",
  "deputyConsent",
]) {
  test(`teacher deputy preparation requires ${field} and never guesses an identity`, async () => {
    const f = fixture();
    await f.ready();
    if (field === "deputyConsent") f.node(field).checked = false;
    else f.node(field).value = "";
    assert.equal(await f.c.prepareDeputyPacket(), false);
    assert.equal(await f.c.exportDeputyPacket(), false);
    assert.equal(f.downloads.length, 0);
    assert.equal(f.writes.length, 0);
  });
}

for (const phase of ["prepare", "download"]) {
  for (const reason of [
    "blocked",
    "locked",
    "workspace",
    "revision",
    "connection",
    "scope",
    "closed",
    "selection",
    "sender",
    "profile",
  ]) {
    test(`teacher deputy ${phase} rejects ${reason} changed during final validation`, async () => {
      const f = fixture();
      await f.ready();
      if (phase === "download") await f.c.prepareDeputyPacket();
      const original = f.c.assertReportSnapshot;
      f.c.assertReportSnapshot = async (context) => {
        await original(context);
        if (reason === "blocked") f.c.blocked = true;
        if (reason === "locked") f.c.authenticated = false;
        if (reason === "workspace") f.c.workspace.id = "another";
        if (reason === "revision") f.c.workspace.revision++;
        if (reason === "connection") f.c.connection = {};
        if (reason === "scope") f.c.scope = "different-report";
        if (reason === "closed") f.close();
        if (reason === "selection") f.node("deputySchool").value = "other";
        if (reason === "sender") f.node("deputySenderCode").value = "OTHER";
        if (reason === "profile")
          f.c.savedIdentity = {
            ...(f.c.savedIdentity || savedProfile()),
            token: "changed-during-validation",
          };
      };
      assert.equal(
        await (phase === "prepare"
          ? f.c.prepareDeputyPacket()
          : f.c.exportDeputyPacket()),
        false,
      );
      assert.equal(f.downloads.length, 0);
      assert.equal(f.writes.length, 0);
    });
  }
}

test("consent withdrawn while export is validating prevents download", async () => {
  const f = fixture();
  await f.ready();
  await f.c.prepareDeputyPacket();
  f.c.assertReportSnapshot = async () => {
    f.node("deputyConsent").checked = false;
  };
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.downloads.length, 0);
});

test("consent withdrawn while preview is validating prevents preparation", async () => {
  const f = fixture();
  await f.ready();
  f.c.assertReportSnapshot = async () => {
    f.node("deputyConsent").checked = false;
  };
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(f.downloads.length, 0);
});

test("returned preview and export packets cannot mutate the prepared download", async () => {
  const f = fixture();
  await f.ready();
  const preview = await f.c.prepareDeputyPacket();
  preview.sender.name = "changed preview caller";
  const exported = await f.c.exportDeputyPacket();
  assert.equal(exported.sender.name, "دبیر نمونه");
  exported.sender.name = "changed export caller";
  await f.c.exportDeputyPacket();
  assert.equal(f.downloads.at(-1).value.sender.name, "دبیر نمونه");
});

test("changed form invalidates preview and requires another explicit preparation", async () => {
  const f = fixture();
  await f.ready();
  await f.c.prepareDeputyPacket();
  f.node("deputySenderName").value = "دبیر دیگر";
  f.panel().events.get("input")();
  assert.equal(
    f.panel().querySelector("[data-deputy-export-preview]").hidden,
    true,
  );
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.downloads.length, 0);
  assert.equal((await f.c.prepareDeputyPacket()).sender.name, "دبیر دیگر");
});

test("deputy export never bypasses failed strict draft persistence", async () => {
  const f = fixture();
  f.c.prepareReportSnapshot = async () => {
    throw Error("unsaved invalid draft");
  };
  assert.equal(await f.c.openDeputyExport("school"), false);
  assert.match(f.error(), /unsaved invalid draft/);
  f.fill();
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(f.downloads.length, 0);
});

test("cancelled modal and a replaced modal cannot download previously prepared information", async () => {
  const f = fixture();
  await f.ready();
  await f.c.prepareDeputyPacket();
  f.close();
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.downloads.length, 0);
  await f.ready();
  await f.c.prepareDeputyPacket();
  f.c.showModal("another form", "");
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.downloads.length, 0);
});

test("no parallel preparation or download is allowed while an earlier validation is pending", async () => {
  const f = fixture();
  await f.ready();
  const pending = deferred();
  f.c.assertReportSnapshot = () => pending.promise;
  const preparing = f.c.prepareDeputyPacket();
  assert.equal(await f.c.prepareDeputyPacket(), false);
  assert.equal(await f.c.exportDeputyPacket(), false);
  pending.resolve();
  await preparing;
  const pendingDownload = deferred();
  f.c.assertReportSnapshot = () => pendingDownload.promise;
  const downloading = f.c.exportDeputyPacket();
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(await f.c.prepareDeputyPacket(), false);
  pendingDownload.resolve();
  await downloading;
  assert.equal(f.downloads.length, 1);
});

test("download failures retain the durable identity but never claim delivery success", async () => {
  const f = fixture();
  await f.ready();
  await f.c.prepareDeputyPacket();
  f.c.downloadJSON = () => {
    throw Error("download failed");
  };
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.writes.length, 0);
  assert.equal(f.identitySaves.length, 1);
  assert.match(f.error(), /download failed/);
  assert.doesNotMatch(f.status(), /دریافت فایل درخواست شد/);
});

test("a rejected modal does not replace an existing deputy export session", async () => {
  const f = fixture();
  await f.ready();
  await f.c.prepareDeputyPacket();
  f.c.rejectModal = true;
  assert.equal(await f.c.openDeputyExport("other"), false);
  assert.equal((await f.c.exportDeputyPacket()).school.id, "school");
});
