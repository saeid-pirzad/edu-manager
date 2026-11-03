"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
const clone = structuredClone;
// This scheduler models IDB request callbacks, serialized transactions, and
// rollback. Production always uses the browser's isolated IndexedDB database.
function indexedDBFixture() {
  const rows = new Map(),
    keyPaths = new Map(),
    queue = [],
    opened = [];
  let active = false,
    failure = null;
  function start() {
    if (active || !queue.length) return;
    active = true;
    const tx = queue[0],
      staged = new Map(
        [...rows].map(([name, values]) => [
          name,
          new Map([...values].map(([key, value]) => [key, clone(value)])),
        ]),
      );
    const finish = () => {
      if (!tx.aborted) {
        if (tx.mode === "readwrite")
          for (const [name, values] of staged) rows.set(name, values);
        tx.oncomplete?.();
      } else tx.onabort?.();
      queue.shift();
      active = false;
      queueMicrotask(start);
    };
    const step = () => {
      if (tx.aborted || !tx.operations.length) {
        finish();
        return;
      }
      const operation = tx.operations.shift(),
        data = staged.get(operation.name);
      try {
        if (
          failure &&
          failure.name === operation.name &&
          failure.command === operation.command
        ) {
          const cause = failure.error;
          failure = null;
          throw cause;
        }
        switch (operation.command) {
          case "get":
            operation.request.result = clone(data.get(operation.key));
            break;
          case "getAll":
            operation.request.result = clone([...data.values()]);
            break;
          case "put":
            if (tx.mode !== "readwrite") throw Error("Readonly transaction");
            data.set(
              operation.value[keyPaths.get(operation.name)],
              clone(operation.value),
            );
            operation.request.result =
              operation.value[keyPaths.get(operation.name)];
            break;
          case "delete":
            if (tx.mode !== "readwrite") throw Error("Readonly transaction");
            data.delete(operation.key);
            break;
          case "clear":
            if (tx.mode !== "readwrite") throw Error("Readonly transaction");
            data.clear();
            break;
          default:
            throw Error("Unknown operation");
        }
        operation.request.onsuccess?.();
      } catch (error) {
        operation.request.error = error;
        tx.error = error;
        operation.request.onerror?.();
        tx.onerror?.();
        tx.aborted = true;
      }
      queueMicrotask(step);
    };
    queueMicrotask(step);
  }
  const db = {
    objectStoreNames: { contains: (name) => rows.has(name) },
    createObjectStore(name, options) {
      rows.set(name, new Map());
      keyPaths.set(name, options.keyPath);
    },
    close() {},
    transaction(names, mode) {
      const tx = {
        operations: [],
        mode,
        aborted: false,
        abort() {
          tx.aborted = true;
        },
        objectStore(name) {
          assert.ok(names.includes(name));
          const operation = (command, key, value) => {
            const request = {};
            tx.operations.push({
              name,
              command,
              key,
              value: clone(value),
              request,
            });
            return request;
          };
          return {
            get: (key) => operation("get", key),
            getAll: () => operation("getAll"),
            delete: (key) => operation("delete", key),
            put: (value) => operation("put", undefined, value),
            clear: () => operation("clear"),
          };
        },
      };
      queue.push(tx);
      queueMicrotask(start);
      return tx;
    },
  };
  return {
    opened,
    rows,
    failNext(name, command, error = Error("Synthetic quota failure")) {
      failure = { name, command, error };
    },
    open(name, version) {
      opened.push({ name, version });
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        if (!rows.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}
function fixture() {
  const indexedDB = indexedDBFixture(),
    context = vm.createContext({ indexedDB, structuredClone, crypto });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/deputy-exchange.js",
    "deputy/store.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
    );
  function packet({ revision = 1, teacher = "TEACHER1", empty = false } = {}) {
    return context.EduDeputyExchange.build({
      sender: { code: teacher, name: "دبیر آزمایشی" },
      schoolId: "school",
      schoolCode: "SCHOOL1",
      packetId: "packet",
      exportedAt: "2026-11-02T10:00:00.000Z",
      parts: [
        {
          period: {
            id: "first",
            year: "1405-1406",
            termKind: "first",
            revision,
            closed: false,
          },
          data: {
            schools: [
              {
                id: "school",
                name: "مدرسه آزمایشی",
                classes: empty
                  ? []
                  : [
                      {
                        id: "classroom",
                        name: "کلاس آزمایشی",
                        students: [
                          {
                            id: "student",
                            name: "هنرجوی آزمایشی",
                            code: "100",
                          },
                        ],
                        archivedStudents: [],
                        lessons: [
                          {
                            id: "lesson",
                            name: "درس آزمایشی",
                            gradeMode: "kardanesh",
                            kardaneshScores: {
                              student: { practical: 0, theory: 20 },
                            },
                            poudmans: [],
                          },
                        ],
                      },
                    ],
              },
            ],
            sessions: [],
          },
        },
      ],
    });
  }
  return {
    api: context.EduDeputyStore,
    exchange: context.EduDeputyExchange,
    indexedDB,
    packet,
    context,
  };
}
async function importPacket(store, packet) {
  return store.commit(await store.preview(packet));
}
const errorCode = (code) => (error) => error.code === code;
test("deputy opens a separate database with no teacher stores and imports a detached source", async () => {
  const env = fixture(),
    store = await env.api.open(),
    input = env.packet(),
    row = await importPacket(store, input);
  assert.equal(env.indexedDB.opened[0].name, "EduManagerDeputy");
  assert.deepEqual([...env.indexedDB.rows.keys()].sort(), [
    "followups",
    "meta",
    "sources",
  ]);
  assert.equal(row.status, "new");
  assert.equal(row.version, 1);
  input.school.name = "caller mutation";
  row.packet.school.name = "return mutation";
  assert.equal((await store.list())[0].packet.school.name, "مدرسه آزمایشی");
});
test("deputy repeat deliveries are harmless duplicates and do not increment revision", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  const repeat = clone(packet);
  repeat.id = "resend";
  repeat.exportedAt = "2026-11-02T11:00:00.000Z";
  assert.equal((await importPacket(store, repeat)).status, "duplicate");
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.backup()).revision, 1);
});
test("deputy newer snapshots update only the matching stream and expose deletions", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  await importPacket(store, env.packet({ teacher: "TEACHER2" }));
  const preview = await store.preview(env.packet({ revision: 2, empty: true }));
  assert.equal(preview.plan.removed.students, 1);
  assert.equal(preview.plan.removed.classes, 1);
  await store.commit(preview);
  const rows = await store.list();
  assert.equal(rows.length, 2);
  assert.equal(
    rows.find((row) => row.packet.sender.code === "TEACHER2").packet.periods[0]
      .school.classes.length,
    1,
  );
});
test("deputy stale and equal-revision conflicting imports leave the durable source untouched", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet({ revision: 2 }));
  await assert.rejects(store.preview(env.packet()), errorCode("DEPUTY_STALE"));
  const conflict = env.packet({ revision: 2 });
  conflict.periods[0].school.classes[0].name = "متفاوت";
  await assert.rejects(store.preview(conflict), errorCode("DEPUTY_CONFLICT"));
  assert.equal((await store.list())[0].packet.periods[0].revision, 2);
});
test("deputy atomic commit rejects a concurrently changed preview instead of losing an update", async () => {
  const env = fixture(),
    first = await env.api.open(),
    second = await env.api.open();
  await importPacket(first, env.packet());
  const a = await first.preview(env.packet({ revision: 2 })),
    b = await second.preview(env.packet({ revision: 3 }));
  const results = await Promise.allSettled([first.commit(a), second.commit(b)]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.code, "DEPUTY_REVISION_CONFLICT");
  assert.equal((await second.list())[0].packet.periods[0].revision, 2);
});
test("deputy commit does not trust preview counts or caller-supplied plan", async () => {
  const env = fixture(),
    store = await env.api.open(),
    preview = await store.preview(env.packet());
  preview.plan.status = "duplicate";
  preview.plan.counts.students = 999;
  const committed = await store.commit(preview);
  assert.equal(committed.status, "new");
  assert.equal(committed.plan.counts.students, 1);
  const malicious = await store.preview(env.packet({ revision: 2 }));
  malicious.packet.settings = { password: "no" };
  await assert.rejects(store.commit(malicious));
});
test("deputy followups are local only and persist with identity snapshot after source student deletion", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  const sourceBefore = JSON.stringify((await store.list())[0].packet),
    note = await store.saveFollowup({
      streamKey: env.exchange.key(packet),
      classId: "classroom",
      studentId: "student",
      note: "پیگیری آزمایشی",
      status: "open",
    });
  assert.equal(note.snapshot.studentName, "هنرجوی آزمایشی");
  assert.equal(note.snapshot.studentCode, "100");
  assert.equal(JSON.stringify((await store.list())[0].packet), sourceBefore);
  await importPacket(store, env.packet({ revision: 2, empty: true }));
  const preserved = (await store.followups())[0];
  assert.equal(preserved.note, "پیگیری آزمایشی");
  assert.equal(preserved.snapshot.className, "کلاس آزمایشی");
  const updated = await store.saveFollowup({
    id: preserved.id,
    version: preserved.version,
    streamKey: preserved.streamKey,
    classId: preserved.classId,
    studentId: preserved.studentId,
    note: "انجام شد",
    status: "done",
  });
  assert.equal(updated.status, "done");
  await assert.rejects(
    store.saveFollowup({
      streamKey: preserved.streamKey,
      classId: "classroom",
      studentId: "student",
      note: "جدید",
      status: "open",
    }),
  );
});
test("deputy followup updates require an exact version and cannot retarget an existing note", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  const note = await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "اول",
    status: "open",
  });
  await assert.rejects(
    store.saveFollowup({
      id: note.id,
      streamKey: note.streamKey,
      classId: note.classId,
      studentId: note.studentId,
      note: "دوم",
      status: "done",
    }),
    errorCode("DEPUTY_REVISION_CONFLICT"),
  );
  await assert.rejects(
    store.saveFollowup({
      id: note.id,
      version: note.version,
      streamKey: note.streamKey,
      classId: note.classId,
      studentId: "someone_else",
      note: "دوم",
      status: "done",
    }),
    errorCode("DEPUTY_REVISION_CONFLICT"),
  );
  assert.equal((await store.followups())[0].note, "اول");
});
test("deputy backup round-trip includes all streams and local followups but is never a teacher backup", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "پیگیری",
    status: "open",
  });
  const backup = await store.backup();
  assert.equal(backup.format, "EduManager.DeputyBackup");
  assert.equal(backup.revision, 2);
  assert.equal(backup.streams.length, 1);
  assert.equal(backup.followups.length, 1);
  await importPacket(store, env.packet({ teacher: "TEACHER2" }));
  const current = (await store.backup()).revision,
    restored = await store.restore(backup, current);
  assert.equal(restored.streams, 1);
  assert.equal((await store.followups()).length, 1);
  assert.ok(restored.revision > current);
  await assert.rejects(
    store.restore(
      { format: "EduManager.FullBackup", version: 2 },
      restored.revision,
    ),
  );
});
test("deputy restore rejects wrong-format and malformed backup before any deletion", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  const before = await store.backup(),
    malformed = clone(before);
  malformed.streams[0].packet.periods[0].school.classes[0].lessons[0].kardaneshScores.student.theory = 100;
  await assert.rejects(store.restore(malformed, before.revision));
  const duplicate = clone(before);
  duplicate.streams.push(clone(duplicate.streams[0]));
  await assert.rejects(store.restore(duplicate, before.revision));
  const orphan = clone(before);
  orphan.followups = [{ id: "note" }];
  await assert.rejects(store.restore(orphan, before.revision));
  assert.equal((await store.backup()).revision, before.revision);
  assert.equal((await store.list()).length, 1);
});
test("deputy restore refuses a concurrent source or followup change", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  const backup = await store.backup(),
    expected = backup.revision;
  await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "تغییر جدید",
    status: "open",
  });
  await assert.rejects(
    store.restore(backup, expected),
    errorCode("DEPUTY_REVISION_CONFLICT"),
  );
  assert.equal((await store.followups())[0].note, "تغییر جدید");
});
test("deputy failed restore rolls back clear and all writes atomically", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  const older = await store.backup();
  await importPacket(store, env.packet({ teacher: "TEACHER2" }));
  const before = await store.backup();
  env.indexedDB.failNext("sources", "put");
  await assert.rejects(store.restore(older, before.revision), /quota/);
  const after = await store.backup();
  assert.equal(after.revision, before.revision);
  assert.equal(after.streams.length, 2);
});
test("deputy restore versions prevent stale preview ABA and stale note overwrite", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  const backup = await store.backup(),
    stale = await store.preview(env.packet({ revision: 2 }));
  await store.restore(backup, backup.revision);
  await assert.rejects(
    store.commit(stale),
    errorCode("DEPUTY_REVISION_CONFLICT"),
  );
  assert.ok((await store.list())[0].version > stale.version);
});
test("deputy failed import preserves source, metadata and other streams", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  const preview = await store.preview(env.packet({ revision: 2 })),
    before = await store.backup();
  env.indexedDB.failNext("meta", "put");
  await assert.rejects(store.commit(preview), /quota/);
  const after = await store.backup();
  assert.equal(after.revision, before.revision);
  assert.equal(after.streams[0].packet.periods[0].revision, 1);
});
test("deputy closed store refuses operations with an actionable error", async () => {
  const env = fixture(),
    store = await env.api.open();
  store.close();
  await assert.rejects(store.list(), errorCode("DEPUTY_STORE_CLOSED"));
});
test("deputy aggregate backup capacity is checked before import writes and cannot produce an unrestorable backup", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  const original = env.exchange.assertSafeTree;
  // A small injected storage ceiling exercises the same production guard
  // without allocating a 128 MiB fixture in every parallel unit-test run.
  env.context.EduDeputyExchange = {
    ...env.exchange,
    assertSafeTree(value, options) {
      if (
        value?.format === "EduManager.DeputyBackup" &&
        value.streams.length > 1
      )
        throw Object.assign(Error("Synthetic aggregate capacity"), {
          code: "DEPUTY_SIZE_LIMIT",
        });
      return original(value, options);
    },
  };
  await assert.rejects(
    importPacket(store, env.packet({ teacher: "TEACHER2" })),
    errorCode("DEPUTY_SIZE_LIMIT"),
  );
  const backup = await store.backup();
  assert.equal(backup.streams.length, 1);
  assert.equal(backup.revision, 1);
  assert.equal(env.api.validateBackup(backup).streams.length, 1);
  assert.equal(env.api.maxBackupBytes, 128 * 1024 * 1024);
});
test("deputy confirmed sender display-name correction updates metadata without touching academic data", async () => {
  const env = fixture(),
    store = await env.api.open(),
    original = env.packet();
  await importPacket(store, original);
  const correction = clone(original);
  correction.sender.name = "نام اصلاح‌شده";
  const preview = await store.preview(correction);
  assert.equal(preview.plan.metadataChanged, true);
  assert.equal(preview.plan.status, "update");
  const row = await store.commit(preview);
  assert.equal(row.packet.sender.name, "نام اصلاح‌شده");
  assert.deepEqual(row.packet.periods, original.periods);
  assert.equal(row.packet.periods[0].revision, 1);
  assert.equal((await store.list()).length, 1);
});
test("deputy pre-restore safety starts absent and supports a valid empty initial state", async () => {
  const env = fixture(),
    store = await env.api.open();
  assert.equal(await store.lastSafetyBackup(), null);
  assert.equal(await store.safetyBackupInfo(), null);
  await store.restore(await store.backup(), 0);
  const safety = await store.lastSafetyBackup(),
    info = await store.safetyBackupInfo();
  assert.equal(
    env.api.validateBackup(safety).format,
    "EduManager.DeputyBackup",
  );
  assert.equal(safety.revision, 0);
  assert.equal(safety.streams.length, 0);
  assert.equal(safety.followups.length, 0);
  assert.equal(info.streams, 0);
  assert.equal(info.followups, 0);
  assert.equal(info.exportedAt, safety.exportedAt);
});
test("deputy one-only safety backup recovers pre-restore sources and followups and is replaced on next restore", async () => {
  const env = fixture(),
    store = await env.api.open(),
    empty = await store.backup(),
    packet = env.packet();
  await importPacket(store, packet);
  await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "یادداشت قبل از بازیابی",
    status: "open",
  });
  const before = await store.backup();
  await store.restore(empty, before.revision);
  assert.equal((await store.list()).length, 0);
  assert.equal((await store.followups()).length, 0);
  const safety = await store.lastSafetyBackup();
  assert.deepEqual(safety.streams, before.streams);
  assert.deepEqual(safety.followups, before.followups);
  assert.equal((await store.safetyBackupInfo()).followups, 1);
  const current = await store.backup();
  await store.restore(safety, current.revision);
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.followups())[0].note, "یادداشت قبل از بازیابی");
  const latestSafety = await store.lastSafetyBackup();
  assert.equal(latestSafety.streams.length, 0);
  assert.equal(latestSafety.followups.length, 0);
  assert.equal(latestSafety.revision, current.revision);
  assert.equal(
    [...env.indexedDB.rows.get("meta").keys()].filter(
      (key) => key === "lastSafety",
    ).length,
    1,
  );
});
test("deputy normal and safety backup files never embed internal safety snapshots or meta stores", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  await store.restore(await store.backup());
  await store.restore(await store.backup());
  for (const backup of [await store.backup(), await store.lastSafetyBackup()]) {
    env.api.validateBackup(backup);
    assert.deepEqual(Object.keys(backup).sort(), [
      "exportedAt",
      "followups",
      "format",
      "revision",
      "streams",
      "version",
    ]);
    assert.ok(!JSON.stringify(backup).includes("lastSafety"));
    assert.ok(!JSON.stringify(backup).includes('"meta"'));
  }
});
test("deputy safety-write quota failure aborts restore and preserves both current data and previous safety snapshot", async () => {
  const env = fixture(),
    store = await env.api.open(),
    empty = await store.backup();
  await importPacket(store, env.packet());
  env.indexedDB.failNext("meta", "put");
  await assert.rejects(
    store.restore(empty, (await store.backup()).revision),
    /quota/,
  );
  assert.equal((await store.list()).length, 1);
  assert.equal(await store.lastSafetyBackup(), null);
  await store.restore(empty, (await store.backup()).revision);
  const originalSafety = await store.lastSafetyBackup();
  await importPacket(store, env.packet({ teacher: "TEACHER2" }));
  const before = await store.backup();
  env.indexedDB.failNext("meta", "put");
  await assert.rejects(store.restore(empty, before.revision), /quota/);
  assert.equal((await store.backup()).revision, before.revision);
  assert.equal((await store.list())[0].packet.sender.code, "TEACHER2");
  assert.deepEqual(await store.lastSafetyBackup(), originalSafety);
});
test("deputy followup timestamps stay monotonic after device clock correction backwards", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  let epoch = Date.parse("2027-02-01T12:00:00.000Z");
  env.context.Date = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : [epoch]));
    }
    static now() {
      return epoch;
    }
  };
  await importPacket(store, packet);
  const note = await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "پیش از اصلاح ساعت",
    status: "open",
  });
  epoch = Date.parse("2026-11-02T12:00:00.000Z");
  const corrected = await store.saveFollowup({
    id: note.id,
    version: note.version,
    streamKey: note.streamKey,
    classId: note.classId,
    studentId: note.studentId,
    note: "بعد از اصلاح ساعت",
    status: "done",
  });
  assert.equal(corrected.status, "done");
  assert.equal(corrected.updatedAt, note.updatedAt);
  assert.equal(corrected.createdAt, note.createdAt);
  epoch = Date.parse("2027-03-01T12:00:00.000Z");
  const later = await store.saveFollowup({
    id: corrected.id,
    version: corrected.version,
    streamKey: note.streamKey,
    classId: note.classId,
    studentId: note.studentId,
    note: "ساعت جلوتر",
    status: "open",
  });
  epoch = Date.parse("2027-02-15T12:00:00.000Z");
  const movedBackAgain = await store.saveFollowup({
    id: later.id,
    version: later.version,
    streamKey: note.streamKey,
    classId: note.classId,
    studentId: note.studentId,
    note: "اصلاح دوم ساعت",
    status: "done",
  });
  assert.equal(movedBackAgain.updatedAt, later.updatedAt);
  env.api.validateBackup(await store.backup());
});
test("deputy full restore invalidates a pending absent-stream preview instead of accepting a zero-to-zero ABA", async () => {
  const env = fixture(),
    first = await env.api.open(),
    second = await env.api.open(),
    empty = await first.backup();
  const preview = await first.preview(env.packet());
  assert.equal(preview.version, 0);
  await second.restore(empty, empty.revision);
  await assert.rejects(
    first.commit(preview),
    errorCode("DEPUTY_REVISION_CONFLICT"),
  );
  assert.equal((await second.list()).length, 0);
  const fresh = await first.preview(env.packet());
  assert.ok(fresh.restoreRevision > preview.restoreRevision);
  assert.equal((await first.commit(fresh)).status, "new");
});
test("deputy unrelated sender imports can commit concurrently within one restore epoch", async () => {
  const env = fixture(),
    first = await env.api.open(),
    second = await env.api.open();
  const a = await first.preview(env.packet()),
    b = await second.preview(env.packet({ teacher: "TEACHER2" }));
  const results = await Promise.all([first.commit(a), second.commit(b)]);
  assert.equal(results[0].status, "new");
  assert.equal(results[1].status, "new");
  assert.equal((await first.list()).length, 2);
});
test("deputy restore epoch survives later imports and followup writes without blocking unrelated fresh previews", async () => {
  const env = fixture(),
    store = await env.api.open(),
    empty = await store.backup(),
    packet = env.packet();
  const obsolete = await store.preview(env.packet({ teacher: "TEACHER2" }));
  await store.restore(empty, 0);
  await importPacket(store, packet);
  const note = await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "پس از بازیابی",
    status: "open",
  });
  await assert.rejects(
    store.commit(obsolete),
    errorCode("DEPUTY_REVISION_CONFLICT"),
  );
  const fresh = await store.preview(env.packet({ teacher: "TEACHER2" }));
  await store.saveFollowup({
    id: note.id,
    version: note.version,
    streamKey: note.streamKey,
    classId: note.classId,
    studentId: note.studentId,
    note: "تغییر مستقل",
    status: "done",
  });
  assert.equal((await store.commit(fresh)).status, "new");
  assert.equal((await store.list()).length, 2);
});
test("deputy a changed school code cannot silently duplicate the same source identity", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  const note = await store.saveFollowup({
    streamKey: env.exchange.key(packet),
    classId: "classroom",
    studentId: "student",
    note: "باید حفظ شود",
    status: "open",
  });
  const mistyped = clone(packet);
  mistyped.school.code = "OTHER-CODE";
  await assert.rejects(
    store.preview(mistyped),
    (failure) =>
      failure.code === "DEPUTY_IDENTITY_CONFLICT" &&
      failure.message.includes(packet.school.code),
  );
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.followups())[0].id, note.id);
  const anotherTeacher = clone(mistyped);
  anotherTeacher.sender.code = "TEACHER2";
  assert.equal((await importPacket(store, anotherTeacher)).status, "new");
});
test("deputy identity guard is atomic when differently coded versions are previewed before either import", async () => {
  const env = fixture(),
    first = await env.api.open(),
    second = await env.api.open(),
    packet = env.packet(),
    typo = clone(packet);
  typo.school.code = "TYPO";
  const a = await first.preview(packet),
    b = await second.preview(typo);
  const results = await Promise.allSettled([first.commit(a), second.commit(b)]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.code, "DEPUTY_IDENTITY_CONFLICT");
  assert.equal((await first.list()).length, 1);
});
test("deputy identity guard does not merge or relabel a genuinely different source period family", async () => {
  const env = fixture(),
    store = await env.api.open(),
    packet = env.packet();
  await importPacket(store, packet);
  const independent = clone(packet);
  independent.school.code = "OTHER-CODE";
  independent.periods[0].id = "independent_first";
  assert.equal((await importPacket(store, independent)).status, "new");
  assert.equal((await store.list()).length, 2);
});

test("automatic file connection is device metadata, excluded from backup and academic revision", async () => {
  const env = fixture(),
    store = await env.api.open();
  await importPacket(store, env.packet());
  const before = await store.backup();
  const config = {
    connectionId: "first",
    handle: { name: "local-only-marker.json" },
    savedAt: "",
    size: 0,
    modified: 1,
  };
  assert.equal(await store.setAutomaticBackupConfig(config), true);
  assert.equal((await store.automaticBackupConfig()).connectionId, "first");
  const after = await store.backup();
  assert.equal(after.revision, before.revision);
  assert.equal(JSON.stringify(after).includes("local-only-marker"), false);
  assert.equal(
    await store.setAutomaticBackupConfig(
      { ...config, connectionId: "second" },
      "wrong",
    ),
    false,
  );
  assert.equal(await store.setAutomaticBackupConfig(null, "wrong"), false);
  assert.equal((await store.automaticBackupConfig()).connectionId, "first");
  await store.restore(before, after.revision);
  assert.equal((await store.automaticBackupConfig()).connectionId, "first");
  assert.equal(await store.setAutomaticBackupConfig(null, "first"), true);
  assert.equal(await store.automaticBackupConfig(), null);
  store.close();
});
