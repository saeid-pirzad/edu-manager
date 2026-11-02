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

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

function fixture() {
  const downloads = [],
    errors = [],
    writes = [],
    builds = [],
    snapshots = [],
    observers = [],
    panels = [];
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
    workspace: { id: "first", year: "1405-1406", revision: 1 },
    connection: {},
    state: { schoolId: "school", classId: "one-class" },
    blocked: false,
    authenticated: true,
    scope: "report-scope",
    structuredClone,
    crypto,
    esc: escape,
    db: { settings: { password: "password" }, schools: [] },
    localStorage: {
      getItem: () => null,
      setItem: (key, value) => writes.push({ key, value: JSON.parse(value) }),
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
      if (
        context.id !== c.workspace.id ||
        context.revision !== c.workspace.revision
      )
        throw Error("stale context");
    },
    reportCopyScope: () => c.scope,
    prepareReportSnapshot: async (options) => {
      snapshots.push(options);
      return {
        context: { id: c.workspace.id, revision: c.workspace.revision },
        parts,
      };
    },
    assertReportSnapshot: async (context) => {
      c.assertWorkspaceReadable();
      c.assertWorkspaceContext(context);
    },
    beginRecordEditorSave: () => () => {},
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
          sender: { ...options.sender },
          school: {
            id: options.schoolId,
            code: options.schoolCode,
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
  vm.runInContext(source, c);
  const node = (name) => panel.querySelector('[name="' + name + '"]');
  const fill = () => {
    node("deputySchool").value = "school";
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

test("teacher deputy export opens a separate whole-year flow without sending or remembering anything", async () => {
  const f = fixture();
  assert.equal(await f.c.openDeputyExport("school"), true);
  assert.equal(f.snapshots.length, 1);
  assert.equal(f.snapshots[0].yearWide, true);
  assert.equal(f.node("deputySchool").value, "school");
  assert.equal(f.downloads.length, 0);
  assert.equal(f.writes.length, 0);
  assert.match(
    f.panel().html,
    /محدودیت تاریخ و کلاس گزارش روی آن اعمال نمی‌شود/,
  );
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

test("teacher deputy defaults are opt-in and remembered only after download is requested", async () => {
  const f = fixture();
  await f.ready();
  f.node("deputyRemember").checked = true;
  await f.c.prepareDeputyPacket();
  assert.equal(f.writes.length, 0);
  await f.c.exportDeputyPacket();
  assert.deepEqual(f.writes, [
    {
      key: "EduDeputy.teacherExport.v1",
      value: {
        sender: { name: "دبیر نمونه", code: "TEACHER-1" },
        schools: [{ year: "1405-1406", id: "school", code: "SCHOOL-1" }],
      },
    },
  ]);
});

test("remembered defaults tolerate malformed storage and storage-denied platforms", async () => {
  const f = fixture();
  f.c.localStorage.getItem = () => "invalid json";
  await f.ready();
  f.node("deputyRemember").checked = true;
  f.c.localStorage.setItem = () => {
    throw Error("storage denied");
  };
  await f.c.prepareDeputyPacket();
  assert.equal((await f.c.exportDeputyPacket()).id, "packet");
  assert.equal(f.downloads.length, 1);
});

for (const field of [
  "deputySchool",
  "deputySchoolCode",
  "deputySenderName",
  "deputySenderCode",
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
  ]) {
    test(`teacher deputy ${phase} rejects ${reason} changed during final validation`, async () => {
      const f = fixture();
      await f.ready();
      if (phase === "download") await f.c.prepareDeputyPacket();
      f.node("deputyRemember").checked = true;
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

test("download failures neither save remembered defaults nor claim delivery success", async () => {
  const f = fixture();
  await f.ready();
  f.node("deputyRemember").checked = true;
  await f.c.prepareDeputyPacket();
  f.c.downloadJSON = () => {
    throw Error("download failed");
  };
  assert.equal(await f.c.exportDeputyPacket(), false);
  assert.equal(f.writes.length, 0);
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
