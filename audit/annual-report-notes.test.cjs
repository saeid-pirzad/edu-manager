"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function fixture(saved = new Map()) {
  const storage = new Map(saved),
    reads = [],
    writes = [],
    ctx = {
      id: "first",
      year: "1405-1406",
      yearScopeId: "1405-1406",
      notesWorkspaceId: "first",
      notesWorkspaceIds: ["first", "second"],
      revision: 1,
    },
    elements = new Map();
  const c = {
    console,
    Date,
    Map,
    Set,
    JSON,
    Object,
    Array,
    Error,
    Number,
    String,
    localStorage: {
      getItem(k) {
        reads.push(k);
        return storage.get(k) || null;
      },
      setItem(k, v) {
        writes.push(k);
        storage.set(k, v);
      },
    },
    db: {
      settings: { academicYear: ctx.year },
      schools: [
        {
          id: "school",
          classes: [{ id: "class", students: [{ id: "student" }] }],
        },
      ],
    },
    globalFilter: {},
    document: {
      querySelectorAll: () => [],
      getElementById(id) {
        if (!elements.has(id))
          elements.set(id, { textContent: "", innerHTML: "" });
        return elements.get(id);
      },
    },
    esc: String,
  };
  c.root = {
    addEventListener() {},
    render() {},
    EduV24: {
      getReportContext: () => ctx,
      canWriteReportNotes: () => true,
      persistReportNotes(id, values, { preserveExisting = false } = {}) {
        const key = "EduManager.periodicDrafts." + id,
          saved = JSON.parse(storage.get(key) || "{}");
        writes.push(key);
        storage.set(
          key,
          JSON.stringify(
            preserveExisting
              ? { ...values, ...saved }
              : { ...saved, ...values },
          ),
        );
        return true;
      },
      async prepareReportSnapshot() {
        return { data: c.db, parts: [], context: {} };
      },
      async assertReportSnapshot() {},
      annualGradeRows: () => [],
      periodicKarnamehHtml: () => "",
      annualTechnicalRows: () => [],
      listAnnualReportPeriods: async () => [],
    },
  };
  vm.createContext(c);
  for (const p of [
    "src/domain/calendar.js",
    "src/domain/academic-year.js",
    "src/domain/reporting/attendance.js",
    "src/domain/reporting/date-ranges.js",
    "src/domain/reporting/periodic-model.js",
  ])
    vm.runInContext(fs.readFileSync(p, "utf8"), c, { filename: p });
  Object.assign(c.root, {
    EduReportDates: c.EduReportDates,
    EduReportModel: c.EduReportModel,
    EduReportAttendance: c.EduReportAttendance,
  });
  for (const p of [
    "src/legacy/students/roster.js",
    "src/reports/periodic/date-range.js",
    "src/reports/periodic/notes.js",
    "src/reports/periodic/model.js",
    "src/reports/periodic/filters.js",
    "src/reports/periodic/excel-sharing.js",
    "src/reports/periodic/generate.js",
  ])
    vm.runInContext(fs.readFileSync(p, "utf8"), c, { filename: p });
  vm.runInContext(
    'globalThis.api={filters,noteKey,readNote,persistNote,getDrafts,initialize,generate,validateReportNotes,noteWorkspaceId,retryNotes,restoreDrafts,resetDrafts,hasPendingNotes:()=>notes.size>0,noteWrites:()=>noteWriter};build=(data,input)=>({audience:input.audience,mode:input.mode,note:input.note,definitions:[]});documentHtml=()=>"rendered";',
    c,
  );
  Object.assign(c.api.filters, {
    mode: "annual",
    date: "2026-11-02",
    schoolId: "school",
    classId: "class",
  });
  return { c, api: c.api, ctx, storage, reads, writes, elements };
}

test("queued guarded note writes remain in backups and an older completion cannot clear a newer edit", async () => {
  const f = fixture(),
    pending = [];
  f.c.root.EduV24.persistReportNotes = (_id, values) =>
    new Promise((resolve) => pending.push({ values, resolve }));
  const key = f.api.noteKey(f.api.filters);
  assert.equal(f.api.persistNote(key, "first edit"), false);
  assert.equal(f.api.getDrafts("first")[key], "first edit");
  assert.equal(f.api.persistNote(key, "newer edit"), false);
  pending[0].resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.api.hasPendingNotes(), true);
  assert.equal(f.api.getDrafts("first")[key], "newer edit");
  f.storage.set(
    "EduManager.periodicDrafts.first",
    JSON.stringify({ [key]: "newer edit" }),
  );
  pending[1].resolve(true);
  await f.api.noteWrites();
  assert.equal(f.api.hasPendingNotes(), false);
});

test("resetting note state invalidates old completion and rejection callbacks", async () => {
  const f = fixture(),
    pending = [];
  f.c.root.EduV24.persistReportNotes = () =>
    new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const key = f.api.noteKey(f.api.filters);
  f.api.persistNote(key, "pre-restore edit");
  f.api.resetDrafts();
  f.api.persistNote(key, "restored install edit");
  pending[0].reject(Error("obsolete installation"));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.api.getDrafts("first")[key], "restored install edit");
  assert.equal(f.api.hasPendingNotes(), true);
  pending[1].resolve(true);
  await f.api.noteWrites();
  assert.equal(f.api.hasPendingNotes(), false);
});

test("missing guarded persistence never silently falls back to an uncoordinated localStorage write", () => {
  const f = fixture();
  delete f.c.root.EduV24.persistReportNotes;
  const key = f.api.noteKey(f.api.filters);
  assert.equal(f.api.persistNote(key, "preserve this pending value"), false);
  assert.equal(f.writes.length, 0);
  assert.equal(f.api.getDrafts("first")[key], "preserve this pending value");
});

test("retryNotes awaits guarded persistence before reporting that pending text is saved", async () => {
  const f = fixture();
  const key = f.api.noteKey(f.api.filters);
  f.c.root.EduV24.persistReportNotes = async () => {
    throw Error("not ready");
  };
  f.api.persistNote(key, "retry text");
  await f.api.noteWrites();
  f.c.root.EduV24.persistReportNotes = async (id, values) => {
    f.storage.set("EduManager.periodicDrafts." + id, JSON.stringify(values));
    return true;
  };
  assert.equal(await f.api.retryNotes(), true);
  assert.equal(f.api.hasPendingNotes(), false);
  assert.equal(
    JSON.parse(f.storage.get("EduManager.periodicDrafts.first"))[key],
    "retry text",
  );
});

test("recovery hydration publishes through the guarded API without overwriting a later stored note", async () => {
  const f = fixture(),
    key = f.api.noteKey(f.api.filters);
  let publish;
  f.c.root.EduV24.persistReportNotes = async (id, values, options) => {
    await new Promise((resolve) => {
      publish = resolve;
    });
    assert.equal(options.preserveExisting, true);
    const storageKey = "EduManager.periodicDrafts." + id,
      current = JSON.parse(f.storage.get(storageKey) || "{}");
    f.storage.set(storageKey, JSON.stringify({ ...values, ...current }));
    return true;
  };
  assert.equal(
    f.api.restoreDrafts("first", { [key]: "recovered value" }),
    false,
  );
  assert.equal(f.api.getDrafts("first")[key], "recovered value");
  f.storage.set(
    "EduManager.periodicDrafts.first",
    JSON.stringify({ [key]: "newer stored note" }),
  );
  publish();
  await f.api.noteWrites();
  assert.equal(f.api.getDrafts("first")[key], "newer stored note");
  assert.equal(f.api.hasPendingNotes(), false);
});

test("an older hydration callback cannot reinsert recovered notes after installation reset", async () => {
  const f = fixture(),
    key = f.api.noteKey(f.api.filters);
  let reject;
  f.c.root.EduV24.persistReportNotes = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  f.api.restoreDrafts("first", { [key]: "old recovered value" });
  f.api.resetDrafts();
  reject(Error("installation changed"));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.api.hasPendingNotes(), false);
  assert.equal(f.api.getDrafts("first")[key], undefined);
});
const legacy = (id) =>
  [
    id,
    "annual",
    "academic-year:auto:auto",
    "school",
    "class",
    "management",
    "",
  ].join("|");
const save = (f, id, values) =>
  f.storage.set("EduManager.periodicDrafts." + id, JSON.stringify(values));
test("custom weekly note ranges stay independent and do not trigger legacy date recovery errors", async () => {
  const f = fixture();
  Object.assign(f.api.filters, {
    mode: "weekly",
    date: "2026-11-01",
    startDate: "2026-11-01",
    endDate: "2026-11-03",
  });
  const first = f.api.noteKey(f.api.filters);
  assert.match(first, /week:2026-11-01:to:2026-11-03/);
  assert.equal(f.api.readNote(first), "");
  assert.equal(f.api.persistNote(first, "exact interval"), true);
  f.api.filters.endDate = "2026-11-04";
  const second = f.api.noteKey(f.api.filters);
  assert.notEqual(second, first);
  assert.equal(f.api.readNote(second), "");
  assert.equal(f.api.readNote(first), "exact interval");
  assert.ok(await f.api.generate());
  Object.assign(f.api.filters, {
    startDate: "2026-10-31",
    endDate: "2026-11-06",
  });
  assert.ok(f.api.noteKey(f.api.filters).includes("week:2026-10-31|"));
});

test("annual notes merge stable-id aliases without writes and keep portable seven-part keys", () => {
  const f = fixture();
  save(f, "first", { [legacy("first")]: "first note" });
  save(f, "second", { [legacy("second")]: "second note" });
  const key = f.api.noteKey(f.api.filters),
    text = f.api.readNote(key);
  assert.equal(key.split("|").length, 7);
  assert.match(key, /year:1405-1406;/);
  assert.match(text, /first note/);
  assert.match(text, /second note/);
  assert.equal(f.writes.length, 0);
  assert.doesNotThrow(() =>
    f.api.validateReportNotes({ [key]: text }, "first"),
  );
});
test("explicit annual clear is authoritative after reload and preserves old notes", () => {
  const f = fixture();
  save(f, "first", { [legacy("first")]: "old first" });
  save(f, "second", { [legacy("second")]: "old second" });
  const key = f.api.noteKey(f.api.filters);
  assert.equal(f.api.persistNote(key, ""), true);
  const fresh = fixture(f.storage);
  assert.equal(fresh.api.readNote(key), "");
  assert.equal(
    JSON.parse(fresh.storage.get("EduManager.periodicDrafts.first"))[
      legacy("first")
    ],
    "old first",
  );
  assert.doesNotThrow(() =>
    fresh.api.validateReportNotes(fresh.api.getDrafts("first"), "first"),
  );
});
test("explicit edit acknowledges old aliases, while a later changed peer note remains visible", () => {
  const f = fixture();
  save(f, "second", { [legacy("second")]: "old second" });
  const key = f.api.noteKey(f.api.filters);
  f.api.persistNote(key, "edited text");
  const fresh = fixture(f.storage);
  assert.equal(fresh.api.readNote(key), "edited text");
  save(fresh, "second", { [legacy("second")]: "new peer note" });
  assert.match(fresh.api.readNote(key), /edited text/);
  assert.match(fresh.api.readNote(key), /new peer note/);
  assert.doesNotThrow(() =>
    fresh.api.validateReportNotes(fresh.api.getDrafts("first"), "first"),
  );
});
test("unauthorized protected peer notes are never read and become available only after grant", () => {
  const f = fixture();
  f.ctx.notesWorkspaceIds = ["first"];
  save(f, "second", { [legacy("second")]: "protected text" });
  assert.equal(f.api.readNote(f.api.noteKey(f.api.filters)), "");
  assert.equal(f.reads.includes("EduManager.periodicDrafts.second"), false);
  f.ctx.notesWorkspaceIds.push("second");
  assert.equal(f.api.readNote(f.api.noteKey(f.api.filters)), "protected text");
});
test("report filters survive an internal-term change and reset on academic-year change", () => {
  const f = fixture();
  f.api.initialize("daily");
  Object.assign(f.api.filters, {
    date: "2026-10-08",
    classId: "class",
    studentId: "student",
    audience: "parent",
  });
  f.ctx.id = "second";
  f.api.initialize("daily");
  assert.equal(f.api.filters.date, "2026-10-08");
  assert.equal(f.api.filters.studentId, "student");
  f.ctx.yearScopeId = "1406-1407";
  f.api.initialize("daily");
  assert.equal(f.api.filters.classId, "");
  assert.equal(f.api.filters.studentId, "");
});
test("report preparation accepts newly authorized annual note sources without switching workspace", async () => {
  const f = fixture();
  f.ctx.notesWorkspaceIds = ["first"];
  save(f, "first", { [legacy("first")]: "first note" });
  save(f, "second", { [legacy("second")]: "second note" });
  f.c.root.EduV24.prepareReportSnapshot = async () => {
    f.ctx.notesWorkspaceIds.push("second");
    return { data: f.c.db, parts: [], context: {} };
  };
  const model = await f.api.generate();
  assert.ok(model, f.elements.get("periodicError")?.textContent);
  assert.match(model.note, /first note/);
  assert.match(model.note, /second note/);
  assert.equal(f.ctx.id, "first");
});
test("report preparation rejects a concurrently changed date", async () => {
  const f = fixture();
  f.c.root.EduV24.prepareReportSnapshot = async () => {
    f.api.filters.date = "2026-11-03";
    return { data: f.c.db, parts: [], context: {} };
  };
  assert.equal(await f.api.generate(), null);
  assert.ok(f.elements.get("periodicError").textContent);
});
test("report preparation rejects concurrent explicit note edits even when authorization expands", async () => {
  const f = fixture();
  f.ctx.notesWorkspaceIds = ["first"];
  f.c.root.EduV24.prepareReportSnapshot = async () => {
    f.ctx.notesWorkspaceIds.push("second");
    f.api.persistNote(f.api.noteKey(f.api.filters), "new user edit");
    return { data: f.c.db, parts: [], context: {} };
  };
  assert.equal(await f.api.generate(), null);
  assert.match(f.api.readNote(f.api.noteKey(f.api.filters)), /new user edit/);
});

for (const mode of ["daily", "weekly", "monthly"]) {
  test(`${mode} notes belong only to the selected term and never merge peer/year-scoped text`, () => {
    const f = fixture();
    f.api.filters.mode = mode;
    const firstKey = f.api.noteKey(f.api.filters),
      peerKey = ["second", ...firstKey.split("|").slice(1)].join("|"),
      oldYearKey = firstKey.replace(
        "|" + firstKey.split("|")[2] + "|",
        "|year:1405-1406;" + firstKey.split("|")[2] + "|",
      );
    save(f, "first", {
      [firstKey]: "first-term only",
      [oldYearKey]: "ambiguous old year-wide note",
    });
    save(f, "second", { [peerKey]: "second-term only" });
    assert.equal(f.api.readNote(firstKey), "first-term only");
    assert.equal(f.reads.includes("EduManager.periodicDrafts.second"), false);
    f.ctx.id = "second";
    const secondKey = f.api.noteKey(f.api.filters);
    assert.equal(secondKey, peerKey);
    assert.equal(f.api.readNote(secondKey), "second-term only");
    f.api.persistNote(secondKey, "edited second term");
    assert.equal(f.api.getDrafts("first")[firstKey], "first-term only");
    assert.equal(
      f.api.getDrafts("first")[oldYearKey],
      "ambiguous old year-wide note",
    );
    assert.equal(f.api.getDrafts("second")[secondKey], "edited second term");
  });
}
