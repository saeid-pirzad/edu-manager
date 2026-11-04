"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture({ realNormalize = false } = {}) {
  const data = {
    schemaVersion: 26,
    settings: {
      academicYear: "1405-1406",
      academicTerm: "first",
      password: "protected",
    },
    schools: [
      {
        id: "school",
        name: "School",
        classes: [
          {
            id: "selected",
            name: "Selected",
            students: [{ id: "student", name: "Student" }],
            lessons: [],
          },
          { id: "unrelated", name: "Unrelated", students: [], lessons: [] },
        ],
      },
      {
        id: "other",
        name: "Other school",
        classes: [
          {
            id: "third",
            name: "Third",
            students: [],
            lessons: [
              {
                id: "course",
                name: "Course",
                gradeMode: "kardanesh",
                poudmans: [],
                kardaneshScores: {},
              },
            ],
          },
        ],
      },
    ],
    sessions: Array.from({ length: 2000 }, (_, i) => ({ id: "session_" + i })),
    masterSchedule: {
      "0-0-all": { schoolId: "other", classId: "third", lessonId: "course" },
    },
  };
  const catalog = new Map([
      ["term", { id: "term", revision: 3, year: "1405-1406" }],
    ]),
    records = new Map(),
    reads = [],
    scopes = [];
  const c = vm.createContext({
    structuredClone,
    clone: structuredClone,
    normalizeDB: structuredClone,
    isDataObject: (value) =>
      !!value && typeof value === "object" && !Array.isArray(value),
    isSafeRecordId: (value) =>
      typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/data/workspace-records.js"),
      "utf8",
    ),
    c,
  );
  const codec = c.EduWorkspaceRecords.create(c);
  for (const [logical, value] of codec.collectRecords(data))
    records.set("term|" + logical, {
      key: "term|" + logical,
      workspace: "term",
      logical,
      value,
    });
  records.set("@installation-reset", {
    key: "@installation-reset",
    value: { token: "epoch-a" },
  });
  c.connection = {
    transaction(names, mode) {
      assert.deepEqual(Array.from(names), ["catalog", "records"]);
      assert.equal(mode, "readonly");
      scopes.push(Array.from(names));
      const snapshot = {
        catalog: structuredClone(catalog),
        records: structuredClone(records),
      };
      return {
        done: Promise.resolve(),
        objectStore(name) {
          return {
            get(key) {
              reads.push([name, key]);
              return {
                promise: Promise.resolve(
                  structuredClone(snapshot[name].get(key)),
                ),
              };
            },
            getAll() {
              assert.fail(
                "A class assessment must not scan sessions or other classes.",
              );
            },
          };
        },
      };
    },
  };
  c.transactionDone = (tx) => tx.done;
  c.requestPromise = (request) => request.promise;
  if (realNormalize) {
    c.old = {
      defaultDB: () => ({
        settings: {},
        schools: [],
        sessions: [],
        masterSchedule: {},
        activeDays: [0, 1, 2, 3, 4, 5],
        periods: 6,
      }),
    };
    for (const source of [
      "domain/calendar.js",
      "domain/academic-year.js",
      "domain/data-boundary.js",
      "domain/grade-math.js",
      "domain/grade-policy.js",
      "workspace/domain/defaults-numbers.js",
      "legacy/validation/database.js",
      "legacy/students/roster.js",
      "workspace/grading/scope.js",
      "workspace/courses/rules.js",
      "workspace/validation/database.js",
    ])
      vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
        c,
      );
    c.old.validateDB = c.legacy_validateDB;
  }
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/records.js"),
      "utf8",
    ),
    c,
  );
  return {
    c,
    data,
    records,
    catalog,
    reads,
    scopes,
    read: (epoch = "epoch-a") =>
      c.readAssessmentSnapshot(
        "term",
        { schoolId: "school", classId: "selected" },
        epoch,
      ),
  };
}
test("assessment snapshot uses four keyed reads under one snapshot and retains complete original metadata", async () => {
  const f = fixture(),
    snapshot = await f.read();
  assert.deepEqual(f.reads, [
    ["catalog", "term"],
    ["records", "@installation-reset"],
    ["records", "term|meta"],
    ["records", "term|class:selected"],
  ]);
  assert.equal(f.scopes.length, 1);
  assert.equal(snapshot.period.revision, 3);
  assert.equal(snapshot.data.settings.password, "protected");
  assert.deepEqual(
    plain(snapshot.data.schools),
    [f.data.schools[0]].map((s) => ({ ...s, classes: [s.classes[0]] })),
  );
  assert.deepEqual(plain(snapshot.data.sessions), []);
  const meta = JSON.parse(snapshot.records.get("meta"));
  assert.deepEqual(meta.layout, [
    { id: "school", name: "School", classes: ["selected", "unrelated"] },
    { id: "other", name: "Other school", classes: ["third"] },
  ]);
  assert.deepEqual(meta.masterSchedule, f.data.masterSchedule);
  snapshot.data.schools[0].classes[0].students[0].id = "detached";
  assert.equal(
    f.records.get("term|class:selected").value.students[0].id,
    "student",
  );
});
test("assessment reads do not mix catalog and rows from a replacement made while requests resolve", async () => {
  const f = fixture(),
    pending = f.read();
  f.catalog.get("term").revision = 99;
  f.records.get("@installation-reset").value.token = "epoch-b";
  f.records.delete("term|class:selected");
  const snapshot = await pending;
  assert.equal(snapshot.period.revision, 3);
  assert.equal(snapshot.data.schools[0].classes[0].id, "selected");
});
for (const mutation of [
  "epoch",
  "missing-marker",
  "missing-class",
  "row-owner",
  "row-key",
  "class-id",
  "wrong-school",
  "duplicate-class",
  "duplicate-school",
]) {
  test(
    "targeted assessment snapshot rejects " +
      mutation +
      " without silently constructing partial write metadata",
    async () => {
      const f = fixture(),
        meta = f.records.get("term|meta").value,
        row = f.records.get("term|class:selected");
      if (mutation === "epoch")
        f.records.get("@installation-reset").value.token = "epoch-b";
      if (mutation === "missing-marker")
        f.records.delete("@installation-reset");
      if (mutation === "missing-class") f.records.delete("term|class:selected");
      if (mutation === "row-owner") row.workspace = "other";
      if (mutation === "row-key") row.key = "other|class:selected";
      if (mutation === "class-id") row.value.id = "unrelated";
      if (mutation === "wrong-school") {
        meta.layout[0].classes.shift();
        meta.layout[1].classes.push("selected");
      }
      if (mutation === "duplicate-class")
        meta.layout[1].classes.push("selected");
      if (mutation === "duplicate-school") meta.layout[1].id = "school";
      await assert.rejects(f.read(), (error) =>
        mutation === "epoch" || mutation === "missing-marker"
          ? error.code === "INSTALLATION_CHANGED"
          : true,
      );
    },
  );
}
test("pre-marker installation remains readable with an explicitly empty expected epoch", async () => {
  const f = fixture();
  f.records.delete("@installation-reset");
  assert.equal((await f.read("")).period.revision, 3);
});

test("bounded assessment projection passes the actual schema normalizer with weekly entries for other classes", async () => {
  const f = fixture({ realNormalize: true }),
    snapshot = await f.read();
  assert.equal(snapshot.data.schools[0].classes[0].id, "selected");
  assert.deepEqual(plain(snapshot.data.masterSchedule), {});
  assert.deepEqual(
    JSON.parse(snapshot.records.get("meta")).masterSchedule,
    f.data.masterSchedule,
  );
});
