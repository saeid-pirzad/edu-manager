"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const c = vm.createContext({ structuredClone });
for (const source of ["domain/calendar.js", "domain/academic-year.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
    c,
  );
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/validation/full-backup.js"),
    "utf8",
  ),
  c,
);
const validate = c.EduFullBackupValidator.create({
  backupStores: ["catalog", "records", "events", "backups", "undo", "reports"],
  assertSafeDataTree() {},
  isDataObject: (x) => !!x && typeof x === "object" && !Array.isArray(x),
  isSafeRecordId: (x) => typeof x === "string" && /^[a-z0-9_]+$/.test(x),
  validateReportNotes() {},
  decodeWorkspaceRecords: (rows) => ({
    data: {
      settings: rows.find((row) => row.logical === "meta").value.settings,
    },
  }),
  validateFrozenReport() {},
  normalizeDB() {},
  validatedUndoCandidate() {},
  isSupportedGradeDraft: () => true,
});
const fixture = () => ({
  format: "EduManager.FullBackup",
  version: 2,
  schemaVersion: 26,
  activeWorkspace: "first",
  gradeDrafts: [],
  stores: {
    catalog: [
      {
        id: "first",
        revision: 1,
        closed: false,
        createdAt: "2026-10-27T00:00:00Z",
        year: "1405-1406",
        term: "اول",
      },
    ],
    records: [
      {
        key: "first|meta",
        workspace: "first",
        logical: "meta",
        value: {
          layout: [],
          settings: { academicYear: "1405-1406", academicTerm: "اول" },
        },
      },
    ],
    events: [
      {
        workspace: "first",
        at: "2026-10-27T00:00:00Z",
        action: "ویرایش",
        revision: 1,
        changes: [
          {
            path: "meta.settings.password",
            before: "بدون رمز",
            after: "رمز تنظیم‌شده",
          },
        ],
      },
    ],
    backups: [],
    undo: [],
    reports: [],
  },
});
test("full backups validate explicit report-source roles while accepting legacy catalogs", () => {
  for (const role of [undefined, "primary", "secondary"]) {
    const value = fixture();
    if (role) value.stores.catalog[0].reportSource = role;
    assert.equal(validate(value).length, 1);
  }
  for (const role of [true, 1, "backup", {}]) {
    const value = fixture();
    value.stores.catalog[0].reportSource = role;
    assert.throws(() => validate(value), /منبع گزارش/);
  }
});
test("full-backup history accepts valid legacy events without inventing a revision", () => {
  const value = fixture();
  delete value.stores.events[0].revision;
  assert.equal(validate(value).length, 1);
  assert.equal(Object.hasOwn(value.stores.events[0], "revision"), false);
});
test("malformed history rows and paths are rejected before restore or rendering", () => {
  const invalid = [
    (row) => (row.changes = null),
    (row) => (row.changes = [null]),
    (row) => (row.changes = [{ path: 4 }]),
    (row) => (row.at = "not a date"),
    (row) => (row.action = {}),
    (row) => (row.revision = -1),
    (row) => (row.revision = 1.5),
  ];
  for (const mutate of invalid) {
    const value = fixture();
    mutate(value.stores.events[0]);
    assert.throws(() => validate(value), /تاریخچه/);
  }
});
test("null imported grade-draft rows produce a controlled validation error", () => {
  const value = fixture();
  value.gradeDrafts = [null];
  assert.throws(() => validate(value), /پیش‌نویس/);
});

function recoveredUndoBackup() {
  const value = fixture(),
    peer = {
      ...value.stores.catalog[0],
      id: "second",
      term: "دوم",
      revision: 2,
    };
  value.stores.catalog.push(peer);
  value.stores.records.push({
    key: "second|meta",
    workspace: "second",
    logical: "meta",
    value: {
      layout: [],
      settings: { academicYear: peer.year, academicTerm: peer.term },
    },
  });
  value.stores.undo.push({
    id: "first",
    revision: 1,
    action: "اصلاح نام بازیابی‌شده",
    before: [],
    recoveredPeers: [{ id: "second", revision: 2, rosters: [] }],
  });
  return value;
}

test("full backups preserve same-year recovered-name undo guards without promoting stale revisions", () => {
  for (const revision of [1, 2]) {
    const value = recoveredUndoBackup();
    value.stores.undo[0].recoveredPeers[0].revision = revision;
    assert.equal(validate(value).length, 2);
    assert.equal(value.stores.undo[0].recoveredPeers[0].revision, revision);
  }
});

test("recovered-name undo cannot reference missing, self, future or different-year periods", () => {
  for (const variant of [
    "missing",
    "self",
    "future",
    "other-year",
    "invalid",
  ]) {
    const value = recoveredUndoBackup(),
      marker = value.stores.undo[0].recoveredPeers[0];
    if (variant === "missing") marker.id = "missing";
    if (variant === "self") marker.id = "first";
    if (variant === "future") marker.revision = 3;
    if (variant === "invalid") marker.revision = 0;
    if (variant === "other-year") {
      value.stores.catalog[1].year = "1406-1407";
      value.stores.records[1].value.settings.academicYear = "1406-1407";
    }
    assert.throws(() => validate(value), /اصلاح نام/);
  }
});
test("records are grouped once rather than rescanned for every period", () => {
  const value = fixture();
  for (let i = 0; i < 100; i++) {
    const id = "period_" + i;
    value.stores.catalog.push({ ...value.stores.catalog[0], id });
    value.stores.records.push({
      ...value.stores.records[0],
      key: id + "|meta",
      workspace: id,
    });
  }
  c.structuredClone = (input) => {
    const copy = structuredClone(input);
    copy.stores.records = new Proxy(copy.stores.records, {
      get(target, key, receiver) {
        if (key === "filter") throw Error("full-record rescan");
        return Reflect.get(target, key, receiver);
      },
    });
    return copy;
  };
  try {
    assert.equal(validate(value).length, 101);
  } finally {
    c.structuredClone = structuredClone;
  }
});
