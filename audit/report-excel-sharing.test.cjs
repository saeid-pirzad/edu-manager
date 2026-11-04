"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { File } = require("node:buffer");
const read = (name) =>
  fs.readFileSync(
    path.join(__dirname, "../src/reports/periodic", name),
    "utf8",
  );
const mime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
function fixture() {
  const shares = [],
    downloads = [],
    validations = [],
    observers = [],
    ctx = {
      id: "first",
      revision: 3,
      ready: true,
      authenticated: true,
      blocked: false,
      retired: false,
      resetting: false,
      saving: false,
      pendingDrafts: 0,
    },
    prepared = {
      context: { id: ctx.id, revision: ctx.revision },
      signature: "management-school-a-2026-11-04",
      model: {
        mode: "daily",
        audience: "management",
        detailLevel: "full",
        school: { id: "school", name: "هنرستان آزمایشی" },
        class: { id: "class", name: "یازدهم شبکه" },
        student: null,
        start: "2026-11-04",
        end: "2026-11-04",
        academicYear: "1405-1406",
        generatedAt: "2026-11-04T08:00:00Z",
        sessions: [],
      },
    },
    name = "پیرزاد_1405-08-13_11-30-00_گزارش-روزانه.xlsx",
    bytes = Buffer.from([0x50, 0x4b, 3, 4, 0, 17, 255, 128, 2, 19]),
    blob = new Blob([bytes], { type: mime }),
    modal = {
      hidden: true,
      classList: { contains: () => modal.hidden },
    };
  let panel,
    signature = prepared.signature,
    rejectModal = false;
  const node = () => ({
    hidden: false,
    disabled: false,
    isConnected: true,
    dataset: {},
    textContent: "",
    innerHTML: "",
    style: {},
    setAttribute(key, value) {
      this[key] = value;
    },
    removeAttribute(key) {
      delete this[key];
    },
  });
  const c = vm.createContext({
    Blob,
    File,
    isSecureContext: true,
    last: prepared,
    context: () => ({ ...ctx }),
    isPreparedCurrent: (value) =>
      value === c.last && value.signature === signature,
    esc: (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    faDate: String,
    modeLabel: (mode) => mode,
    document: {
      getElementById: (id) =>
        id === "modal" ? modal : id === "modalBody" ? {} : panel,
      querySelector: (selector) => panel?.querySelector(selector) || null,
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
    navigator: {
      canShare: ({ files }) =>
        files.length === 1 &&
        files[0] instanceof File &&
        files[0].type === mime &&
        files[0].name.endsWith(".xlsx"),
      share: async (value) => {
        shares.push(value);
      },
    },
    downloadLocalFile: (value, filename) =>
      downloads.push({ blob: value, name: filename }),
    root: {
      isSecureContext: true,
      EduV24: {
        assertReportSnapshot: async (value) => validations.push(value),
      },
      showModal(title, html) {
        if (rejectModal) return false;
        if (panel) panel.isConnected = false;
        const nodes = new Map();
        panel = {
          title,
          html,
          isConnected: true,
          querySelector(selector) {
            if (!nodes.has(selector)) {
              const element = node(),
                attribute = selector.slice(1, -1);
              const tag =
                html.match(
                  new RegExp("<[^>]+\\b" + attribute + "(?:\\s|>|=)[^>]*>"),
                )?.[0] || "";
              element.hidden = /\shidden(?:\s|>|=)/.test(tag);
              element.disabled = /\sdisabled(?:\s|>|=)/.test(tag);
              nodes.set(selector, element);
            }
            return nodes.get(selector);
          },
        };
        modal.hidden = false;
        return true;
      },
    },
  });
  vm.runInContext(read("excel-sharing.js"), c, {
    filename: "excel-sharing.js",
  });
  const find = (selector) => panel?.querySelector(selector);
  return {
    c,
    ctx,
    prepared,
    name,
    bytes,
    blob,
    shares,
    downloads,
    validations,
    observers,
    panel: () => panel,
    node: find,
    send: () => find("[data-report-share-send]"),
    download: () => find("[data-report-share-download]"),
    status: () => find("[data-report-share-status]")?.textContent || "",
    open: () => c.openExcelShare(prepared, blob, name),
    changeFilter: () => (signature = "parent-other-pupil-or-new-date"),
    rejectModal: () => (rejectModal = true),
    close() {
      modal.hidden = true;
      for (const observer of observers)
        if (!observer.disconnected) observer.callback();
    },
    replacePanel() {
      panel.isConnected = false;
      for (const observer of observers)
        if (!observer.disconnected) observer.callback();
    },
  };
}

test("preparing Excel share opens a separate ready dialog without sharing or downloading", () => {
  const f = fixture();
  assert.equal(f.open(), true);
  assert.equal(f.shares.length + f.downloads.length, 0);
  assert.equal(f.send().hidden, false);
  assert.equal(f.send().disabled, false);
  assert.equal(f.download().hidden, false);
  assert.equal(f.download().disabled, false);
  assert.ok(f.panel().title);
});

test("native Excel share runs in the direct second click before any await and preserves exact XLSX bytes", async () => {
  const f = fixture();
  f.open();
  let active = true,
    called = false;
  f.c.navigator.share = async (payload) => {
    assert.equal(active, true);
    called = true;
    f.shares.push(payload);
  };
  const operation = f.c.sharePreparedExcel(f.send());
  active = false;
  assert.equal(called, true);
  assert.equal(await operation, true);
  const file = f.shares[0].files[0];
  assert.ok(file instanceof File);
  assert.equal(file.name, f.name);
  assert.equal(file.type, mime);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), f.bytes);
  assert.equal(f.downloads.length, 0);
  assert.match(f.status(), /پنجره|اشتراک|برنامه/);
});

for (const [name, setup] of [
  ["unsupported file", (c) => (c.navigator.canShare = () => false)],
  [
    "policy exception",
    (c) =>
      (c.navigator.canShare = () => {
        throw Error("policy");
      }),
  ],
  ["no share API", (c) => (c.navigator.share = undefined)],
  ["no canShare API", (c) => (c.navigator.canShare = undefined)],
  ["no File constructor", (c) => (c.File = undefined)],
  [
    "insecure context",
    (c) => {
      c.isSecureContext = false;
      c.root.isSecureContext = false;
    },
  ],
])
  test(
    "Excel share offers explicit original-XLSX download with " + name,
    async () => {
      const f = fixture();
      setup(f.c);
      assert.equal(f.open(), true);
      assert.equal(f.send().hidden, true);
      assert.equal(f.download().hidden, false);
      assert.equal(f.download().disabled, false);
      assert.equal(f.shares.length + f.downloads.length, 0);
      assert.equal(await f.c.downloadPreparedExcel(), true);
      assert.equal(f.downloads[0].name, f.name);
      assert.equal(f.downloads[0].blob.type, mime);
      assert.deepEqual(
        Buffer.from(await f.downloads[0].blob.arrayBuffer()),
        f.bytes,
      );
      assert.equal(f.validations.length, 1);
    },
  );

test("cancelling Excel sharing retains the same file for retry and never triggers a download", async () => {
  const f = fixture(),
    attempted = [];
  f.open();
  f.c.navigator.share = async ({ files }) => {
    attempted.push(files[0]);
    throw Object.assign(Error("cancel"), { name: "AbortError" });
  };
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.match(f.status(), /لغو/);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.send().disabled, false);
  f.c.navigator.share = async ({ files }) => attempted.push(files[0]);
  assert.equal(await f.c.sharePreparedExcel(f.send()), true);
  assert.equal(attempted[0], attempted[1]);
  assert.equal(f.downloads.length, 0);
});

test("Chromium-style permission denial after canShare succeeds leaves an honest manual XLSX fallback", async () => {
  const f = fixture();
  f.c.navigator.canShare = () => true;
  f.open();
  f.c.navigator.share = async () => {
    throw Object.assign(Error("Permission denied"), {
      name: "NotAllowedError",
    });
  };
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.equal(f.downloads.length, 0);
  assert.match(f.status(), /دریافت|دستی|مرورگر/);
  assert.equal(f.download().disabled, false);
  assert.equal(await f.c.downloadPreparedExcel(), true);
  assert.equal(f.downloads[0].name, f.name);
});

for (const [name, change] of [
  ["different prepared report", (f) => (f.c.last = { ...f.prepared })],
  ["changed date, audience or student filter", (f) => f.changeFilter()],
  ["changed workspace", (f) => (f.ctx.id = "second")],
  ["changed revision", (f) => f.ctx.revision++],
  ["unauthenticated", (f) => (f.ctx.authenticated = false)],
  ["not ready", (f) => (f.ctx.ready = false)],
  ["conflicted peer write", (f) => (f.ctx.blocked = true)],
  ["retired connection", (f) => (f.ctx.retired = true)],
  ["reset or restore in progress", (f) => (f.ctx.resetting = true)],
  ["pending save", (f) => (f.ctx.saving = true)],
  ["uncommitted grade input", (f) => (f.ctx.pendingDrafts = 1)],
])
  test(
    "prepared Excel cannot escape through sharing or downloading after " + name,
    async () => {
      for (const action of ["share", "download"]) {
        const f = fixture();
        f.open();
        change(f);
        const result =
          action === "share"
            ? await f.c.sharePreparedExcel(f.send())
            : await f.c.downloadPreparedExcel();
        assert.equal(result, false, action);
        assert.equal(f.shares.length + f.downloads.length, 0, action);
      }
    },
  );

test("invalidating an annual member or resetting the report revokes the prepared Excel attachment", async () => {
  const f = fixture();
  f.open();
  f.c.invalidateExcelShare("سوابق نوبت دوم تغییر کرده است");
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.equal(await f.c.downloadPreparedExcel(), false);
  assert.equal(f.shares.length + f.downloads.length, 0);
});

test("closing or replacing the modal discards prepared Excel and prevents old action reuse", async () => {
  for (const change of ["close", "replacePanel"]) {
    const f = fixture();
    f.open();
    const button = f.send();
    f[change]();
    assert.equal(await f.c.sharePreparedExcel(button), false);
    assert.equal(await f.c.downloadPreparedExcel(), false);
    assert.equal(f.shares.length + f.downloads.length, 0);
    assert.ok(f.observers.every((observer) => observer.disconnected));
  }
});

test("a rejected modal cannot create a sendable Excel dialog", async () => {
  const f = fixture();
  f.rejectModal();
  assert.equal(f.open(), false);
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.equal(await f.c.downloadPreparedExcel(), false);
  assert.equal(f.shares.length + f.downloads.length, 0);
});

test("an already stale report cannot create a sendable Excel dialog", async () => {
  const f = fixture();
  f.changeFilter();
  assert.throws(() => f.open());
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.equal(await f.c.downloadPreparedExcel(), false);
  assert.equal(f.shares.length + f.downloads.length, 0);
});

test("a pending native share blocks duplicate sheets and the competing download action", async () => {
  const f = fixture(),
    gate = deferred();
  f.open();
  f.c.navigator.share = async (payload) => {
    f.shares.push(payload);
    await gate.promise;
  };
  const first = f.c.sharePreparedExcel(f.send());
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.equal(await f.c.downloadPreparedExcel(), false);
  assert.equal(f.shares.length, 1);
  assert.equal(f.downloads.length, 0);
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(f.send().disabled, false);
});

test("manual Excel download validates durable records and refuses rejected snapshots", async () => {
  const f = fixture();
  f.open();
  f.c.root.EduV24.assertReportSnapshot = async (value) => {
    assert.equal(value, f.prepared.context);
    throw Error("another term changed without a local event");
  };
  assert.equal(await f.c.downloadPreparedExcel(), false);
  assert.equal(f.downloads.length + f.shares.length, 0);
});

test("manual Excel download rechecks scope, permission and dialog after its asynchronous durable validation", async () => {
  for (const change of [
    (f) => f.changeFilter(),
    (f) => f.ctx.revision++,
    (f) => (f.ctx.authenticated = false),
    (f) => f.close(),
  ]) {
    const f = fixture(),
      gate = deferred();
    f.open();
    f.c.root.EduV24.assertReportSnapshot = async () => gate.promise;
    const operation = f.c.downloadPreparedExcel();
    change(f);
    gate.resolve();
    assert.equal(await operation, false);
    assert.equal(f.downloads.length + f.shares.length, 0);
  }
});

function outputFixture() {
  const f = fixture(),
    opened = [],
    invalid = [];
  Object.assign(f.c, {
    generate: async () => f.prepared.model,
    xlsxWorkbook: () => f.blob,
    excelReportSheets: (model) => {
      assert.equal(model, f.prepared.model);
      return [];
    },
    excelReportFilename: (model) => {
      assert.equal(model, f.prepared.model);
      return f.name;
    },
    openExcelShare: (...args) => {
      opened.push(args);
      return true;
    },
    invalidate: (message) => invalid.push(message),
  });
  vm.runInContext(
    read("output.js").split("root.EduPeriodicReports =")[0],
    f.c,
    { filename: "output.js" },
  );
  return { ...f, opened, invalid };
}

test("Share Excel output opens only the validated filtered model's actual XLSX and does not download", async () => {
  const f = outputFixture();
  assert.equal(await f.c.output("xlsx-share"), true);
  assert.equal(f.validations.length, 1);
  assert.equal(f.validations[0], f.prepared.context);
  assert.equal(f.opened.length, 1);
  assert.equal(f.opened[0][0], f.prepared);
  assert.equal(f.opened[0][1], f.blob);
  assert.equal(f.opened[0][2], f.name);
  assert.equal(f.downloads.length + f.shares.length, 0);
});

test("Share Excel output cannot expose a report when durable validation rejects or filters change during validation", async () => {
  for (const validate of [
    () => {
      throw Error("stale annual member");
    },
    (f) => f.changeFilter(),
  ]) {
    const f = outputFixture();
    f.c.root.EduV24.assertReportSnapshot = async () => validate(f);
    assert.equal(await f.c.output("xlsx-share"), false);
    assert.equal(f.opened.length, 0);
    assert.equal(f.downloads.length + f.shares.length, 0);
    assert.equal(f.invalid.length, 1);
  }
});

test("an older pending download cannot invalidate a newly prepared Excel dialog", async () => {
  const f = fixture(),
    gate = deferred();
  f.open();
  f.c.root.EduV24.assertReportSnapshot = async () => gate.promise;
  const older = f.c.downloadPreparedExcel();
  const newerName = "newer-report.xlsx";
  assert.equal(f.c.openExcelShare(f.prepared, f.blob, newerName), true);
  gate.resolve();
  assert.equal(await older, false);
  assert.equal(f.downloads.length, 0);
  assert.equal(await f.c.sharePreparedExcel(f.send()), true);
  assert.equal(f.shares[0].files[0].name, newerName);
});

test("a native share completing after invalidation cannot replace the stale-report message", async () => {
  const f = fixture(),
    gate = deferred();
  f.open();
  f.c.navigator.share = async (payload) => {
    f.shares.push(payload);
    await gate.promise;
  };
  const operation = f.c.sharePreparedExcel(f.send());
  const message = "گزارش منقضی شده است؛ دوباره آماده کنید.";
  f.c.invalidateExcelShare(message);
  assert.equal(f.status(), message);
  gate.resolve();
  await operation;
  assert.equal(f.status(), message);
  assert.equal(f.send().disabled, true);
  assert.equal(f.download().disabled, true);
  assert.equal(f.downloads.length, 0);
});

test("a pending durable download locks both actions and blocks duplicate downloads or competing shares", async () => {
  const f = fixture(),
    gate = deferred();
  let validations = 0;
  f.open();
  f.c.root.EduV24.assertReportSnapshot = async () => {
    validations++;
    await gate.promise;
  };
  const first = f.c.downloadPreparedExcel();
  assert.equal(f.download().disabled, true);
  assert.equal(f.send().disabled, true);
  assert.equal(await f.c.downloadPreparedExcel(), false);
  assert.equal(await f.c.sharePreparedExcel(f.send()), false);
  assert.equal(validations, 1);
  assert.equal(f.downloads.length + f.shares.length, 0);
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.shares.length, 0);
  assert.equal(f.download().disabled, false);
  assert.equal(f.send().disabled, false);
});
