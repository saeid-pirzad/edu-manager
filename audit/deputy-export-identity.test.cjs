"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (file) =>
  fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const profile = (token = "saved-token") => ({
  version: 1,
  token,
  sender: { code: "TEACHER_1", name: "دبیر نمونه" },
  schools: [{ year: "1405-1406", id: "school", code: "SCHOOL_1" }],
});

function database() {
  const stores = new Map(
    [
      "drafts",
      "records",
      "catalog",
      "events",
      "undo",
      "backups",
      "reports",
    ].map((name) => [name, new Map()]),
  );
  const flags = {},
    transactions = [];
  let tail = Promise.resolve();
  const connection = {
    transaction(names, mode) {
      transactions.push({ names: [...names], mode });
      const requests = [];
      let resolve,
        reject,
        staged,
        aborted = false;
      const done = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const tx = {
        done,
        abort() {
          aborted = true;
          reject(Error("transaction aborted"));
        },
        objectStore(name) {
          if (!names.includes(name)) throw Error("store outside transaction");
          const read = (operation) => {
            const request = {};
            requests.push(() => {
              request.result = structuredClone(operation(staged.get(name)));
              request.onsuccess?.();
            });
            return request;
          };
          return {
            get: (key) => read((store) => store.get(key)),
            getAll: () => read((store) => [...store.values()]),
            put(row) {
              if (flags.syncFailure) throw Error("quota failure");
              staged.get(name).set(row.key || row.id, structuredClone(row));
            },
          };
        },
      };
      const previous = tail;
      tail = done.catch(() => {});
      previous.then(() => {
        setImmediate(() => {
          try {
            staged = structuredClone(stores);
            flags.beforeRead?.();
            for (const request of requests) {
              if (aborted) return;
              request();
            }
            if (aborted) return;
            if (flags.asyncFailure) throw Error("asynchronous quota failure");
            if (mode === "readwrite")
              for (const [name, rows] of staged) stores.set(name, rows);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      return tx;
    },
  };
  return { stores, flags, connection, transactions };
}

function fixture(shared = database()) {
  let sequence = 0;
  const c = vm.createContext({
    structuredClone,
    ready: true,
    resetBusy: false,
    connectionRetired: false,
    periodLoading: false,
    fullRestoreBusy: false,
    installationToken: "",
    RESET_RECORD_KEY: "@installation-reset",
    connection: shared.connection,
    transactionDone: (tx) => tx.done,
    uid: () => "new-token-" + ++sequence,
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/deputy-export-identity.js",
    "workspace/reports/deputy-export-identity.js",
  ])
    vm.runInContext(source(file), c);
  return { c, ...shared };
}

test("identity uses the exchange code rules, canonical years and detached values", () => {
  const { c } = fixture(),
    input = profile();
  input.sender.code = " teacher_۱۲ ";
  input.schools[0].year = "۱۴۰۵–۱۴۰۶";
  const normalized = c.EduDeputyExportIdentity.normalize(input);
  assert.equal(normalized.sender.code, "TEACHER_12");
  assert.equal(normalized.schools[0].year, "1405-1406");
  normalized.sender.name = "نام دیگر";
  assert.equal(input.sender.name, "دبیر نمونه");
  assert.equal(Object.isFrozen(c.EduDeputyExportIdentity), true);
});

test("identity rejects missing, invalid or duplicate identities instead of guessing names", () => {
  const { c } = fixture();
  for (const change of [
    (value) => {
      delete value.token;
    },
    (value) => {
      value.version = 2;
    },
    (value) => {
      value.sender.name = " ";
    },
    (value) => {
      value.sender.name = "x".repeat(201);
    },
    (value) => {
      value.sender.code = "دبیر";
    },
    (value) => {
      value.schools[0].year = "1405-1407";
    },
    (value) => {
      value.schools[0].id = "__proto__";
    },
    (value) => {
      value.schools.push({ ...value.schools[0] });
    },
    (value) => {
      value.schools.push({ ...value.schools[0], id: "other" });
    },
  ]) {
    const value = profile();
    change(value);
    assert.throws(() => c.EduDeputyExportIdentity.normalize(value));
  }
});

test("school identifiers match the existing exchange and data-boundary reserved-key rules", () => {
  const { c } = fixture();
  vm.runInContext(source("domain/data-boundary.js"), c);
  for (const id of [
    "school",
    "A_1-2",
    "x".repeat(120),
    "x".repeat(121),
    "هنرستان",
    "a|b",
    "a:b",
    "__proto__",
    "constructor",
    "prototype",
    "toString",
  ]) {
    const value = profile();
    value.schools[0].id = id;
    if (c.isSafeRecordId(id))
      assert.doesNotThrow(() => c.EduDeputyExportIdentity.normalize(value));
    else assert.throws(() => c.EduDeputyExportIdentity.normalize(value));
  }
});

test("profile is installation-level and is reused across terms without touching grade drafts", async () => {
  const f = fixture();
  f.stores.get("drafts").set("Edu24.drafts.first.tab", {
    key: "Edu24.drafts.first.tab",
    entries: [],
  });
  assert.equal(await f.c.readDeputyExportIdentity(), null);
  const saved = await f.c.saveDeputyExportIdentity(profile());
  assert.notEqual(saved.token, "saved-token");
  f.c.workspace = { id: "second", closed: true };
  assert.deepEqual(plain(await f.c.readDeputyExportIdentity()), plain(saved));
  assert.ok(f.stores.get("drafts").has("Edu24.drafts.first.tab"));
});

test("concurrent windows serialize compare-and-swap and cannot overwrite an unseen identity", async () => {
  const shared = database(),
    first = fixture(shared),
    second = fixture(shared);
  const results = await Promise.allSettled([
    first.c.saveDeputyExportIdentity(profile()),
    second.c.saveDeputyExportIdentity({
      ...profile(),
      sender: { code: "OTHER", name: "دبیر دیگر" },
    }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const saved = await second.c.readDeputyExportIdentity();
  await assert.rejects(
    second.c.saveDeputyExportIdentity(profile(), {
      expectedToken: "saved-token",
    }),
    /پنجرهٔ دیگری/,
  );
  assert.equal((await first.c.readDeputyExportIdentity()).token, saved.token);
});

test("updating saved metadata rotates its token and detaches pending caller mutations", async () => {
  const f = fixture(),
    saved = await f.c.saveDeputyExportIdentity(profile()),
    next = profile(saved.token);
  next.sender.name = "نام اصلاح‌شده";
  const pending = f.c.saveDeputyExportIdentity(next, {
    expectedToken: saved.token,
  });
  next.sender.name = "تغییر پس از درخواست";
  const updated = await pending;
  assert.notEqual(updated.token, saved.token);
  assert.equal(updated.sender.name, "نام اصلاح‌شده");
});

for (const kind of ["syncFailure", "asyncFailure"])
  test(`identity ${kind} rejects without altering the durable profile`, async () => {
    const f = fixture(),
      saved = await f.c.saveDeputyExportIdentity(profile());
    f.flags[kind] = true;
    await assert.rejects(
      f.c.saveDeputyExportIdentity(profile(), { expectedToken: saved.token }),
      /quota/,
    );
    f.flags[kind] = false;
    assert.deepEqual(plain(await f.c.readDeputyExportIdentity()), plain(saved));
  });

test("caller context is rechecked inside the transaction before metadata is written", async () => {
  const f = fixture();
  let current = true;
  f.flags.beforeRead = () => {
    current = false;
  };
  await assert.rejects(
    f.c.saveDeputyExportIdentity(profile(), {
      check: () => {
        if (!current) throw Error("stale panel");
      },
    }),
    /stale panel/,
  );
  assert.equal(f.stores.get("drafts").size, 0);
});

test("stale windows cannot read or recreate a profile after another installation was restored", async () => {
  const f = fixture();
  f.stores.get("records").set("@installation-reset", {
    key: "@installation-reset",
    value: { token: "restored-elsewhere" },
  });
  await assert.rejects(f.c.readDeputyExportIdentity(), /جایگزین/);
  await assert.rejects(f.c.saveDeputyExportIdentity(profile()), /جایگزین/);
  assert.equal(f.stores.get("drafts").size, 0);
});

test("connection, loading and installation changes reject writes rather than crossing contexts", async () => {
  for (const mutate of [
    (c) => {
      c.connection = {};
    },
    (c) => {
      c.installationToken = "new-installation";
    },
    (c) => {
      c.periodLoading = true;
    },
    (c) => {
      c.fullRestoreBusy = true;
    },
  ]) {
    const f = fixture();
    f.flags.beforeRead = () => mutate(f.c);
    await assert.rejects(f.c.saveDeputyExportIdentity(profile()), /تغییر/);
    assert.equal(f.stores.get("drafts").size, 0);
  }
});

test("full snapshots export the actual durable profile, not unrelated device handles", async () => {
  const f = fixture(),
    saved = await f.c.saveDeputyExportIdentity(profile());
  f.stores.get("drafts").set("EduManager.singleFile", {
    key: "EduManager.singleFile",
    handle: "device-handle",
  });
  f.stores.get("catalog").set("first", { id: "first", year: "1405-1406" });
  Object.assign(f.c, {
    workspace: { id: "first" },
    backupStores: [
      "catalog",
      "records",
      "events",
      "undo",
      "reports",
      "backups",
    ],
    clone: structuredClone,
    localStorage: { getItem: () => null },
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    storeDrafts: async () => {},
    draftWriter: Promise.resolve(),
    draftStorageKey: () => "Edu24.drafts.first.owner",
    documentToken: "owner",
    draftGeneration: 0,
    drafts: new Map(),
    requestPromise: (request) =>
      new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
      }),
    window: { EduPeriodicReports: { getDrafts: () => ({}) } },
  });
  vm.runInContext(source("domain/grade-drafts.js"), f.c);
  vm.runInContext(source("workspace/backups/full-export.js"), f.c);
  const snapshot = await f.c.snapshotInstallation();
  assert.deepEqual(plain(snapshot.deputyExportIdentity), plain(saved));
  assert.equal(Object.hasOwn(snapshot.stores, "drafts"), false);
  assert.equal(JSON.stringify(snapshot).includes("device-handle"), false);
});

test("old sender localStorage preferences belong to installation cleanup, not a restored identity", () => {
  const c = vm.createContext({
    EduDataStoreRuntime: {},
    STORAGE_KEY: "teacher-db",
  });
  vm.runInContext(source("workspace/data/reset.js"), c);
  assert.equal(c.ownedDataKey("EduDeputy.teacherExport.v1"), true);
  assert.equal(c.ownedDataKey("other-application"), false);
});

for (const write of [false, true])
  test(`identity ${write ? "save" : "read"} checks the report catalog in the same transaction`, async () => {
    const f = fixture(),
      saved = await f.c.saveDeputyExportIdentity(profile());
    f.stores.get("catalog").set("first", { id: "first", revision: 1 });
    const validateCatalog = (rows) => {
      assert.equal(
        rows.find((row) => row.id === "first").revision,
        1,
        "report catalog changed",
      );
    };
    validateCatalog([...f.stores.get("catalog").values()]);
    // Another window commits after the prior report check but before the
    // final profile operation. The final transaction must observe that write.
    f.stores.get("catalog").set("first", { id: "first", revision: 2 });
    const operation = write
      ? f.c.saveDeputyExportIdentity(profile(), {
          expectedToken: saved.token,
          validateCatalog,
        })
      : f.c.readDeputyExportIdentity({ validateCatalog });
    await assert.rejects(operation, /report catalog changed/);
    assert.deepEqual(f.transactions.at(-1).names.sort(), [
      "catalog",
      "drafts",
      "records",
    ]);
    assert.deepEqual(plain(await f.c.readDeputyExportIdentity()), plain(saved));
  });
