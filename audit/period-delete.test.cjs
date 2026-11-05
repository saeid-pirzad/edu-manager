const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function fixture() {
  const first = {
    id: "first",
    year: "1405-1406",
    termKind: "first",
    revision: 1,
  };
  const second = {
    id: "second",
    year: first.year,
    termKind: "second",
    revision: 1,
  };
  const rows = [first, second];
  const effects = [];
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    installationToken: "",
    RESET_RECORD_KEY: "@installation-reset",
    fullRestoreBusy: false,
    resetBusy: false,
    periodLoading: false,
    ready: true,
    blocked: false,
    connectionRetired: false,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    lockControls() {},
    drafts: new Map(),
    draftTimer: null,
    draftGeneration: 0,
    clearTimeout() {},
    assertWorkspaceReadable() {},
    academicTermKind: () => "",
    esc: String,
    preserveAsyncTarget: () => () => {},
    allFrom: async () => structuredClone(rows),
    readWorkspaceSnapshot: async (id) => ({
      period: rows.find((r) => r.id === id),
      data: { schools: [], sessions: [], settings: {} },
    }),
    showModal: (title, html) => {
      effects.push(html);
      return true;
    },
    document: { getElementById: () => ({ checked: true }) },
    confirm: () => true,
    snapshotInstallation: async () => {
      throw Error("Deletion must not construct an operation backup");
    },
    backupStores: [
      "catalog",
      "records",
      "events",
      "reports",
      "undo",
      "backups",
    ],
    restoreCatalogSignature: (value) => JSON.stringify(value),
    transactionDone: (tx) => tx.done,
    broadcast: (message) => effects.push(message),
    localStorage: { removeItem() {} },
    window: {},
    scheduleSingleFile() {},
    setStatus() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/periods/switch-create.js"),
      "utf8",
    ),
    c,
  );
  c.openPeriods = async () => {};
  return { c, rows, effects, first, second };
}
test("period deletion protects missing and last terms without blocking an active second term", () => {
  const { c, rows, first } = fixture();
  assert.throws(
    () => c.assertPeriodDeletable(rows, "missing", "first"),
    /وجود ندارد/,
  );
  assert.throws(
    () => c.assertPeriodDeletable([first], "first", "first"),
    /تنها نوبت/,
  );
  assert.equal(c.assertPeriodDeletable(rows, "second", "second").id, "second");
});
test("first term cannot be deleted while its second exists; unrelated years remain independent", () => {
  const { c, rows } = fixture();
  assert.throws(
    () => c.assertPeriodDeletable(rows, "first", "other"),
    /ابتدا نوبت دوم/,
  );
  assert.equal(c.assertPeriodDeletable(rows, "second", "first").id, "second");
  rows[1].year = "1406-1407";
  assert.equal(c.assertPeriodDeletable(rows, "first", "other").id, "first");
});
test("deletion preview names the scope and warns about annual reporting with explicit confirmation", async () => {
  const { c, effects } = fixture();
  await c.openDeletePeriod("second");
  assert.match(effects[0], /گزارش سالانه/);
  assert.match(effects[0], /id="periodDeletionConfirmed"/);
  assert.match(effects[0], /اطلاعات سایر نوبت‌ها تغییر نمی‌کند/);
  assert.doesNotMatch(effects[0], /نسخهٔ ایمنی/);
});
test("unchecked confirmation or changed workspace prevents deletion", async () => {
  const { c } = fixture();
  await c.openDeletePeriod("second");
  c.document.getElementById = () => ({ checked: false });
  await assert.rejects(c.confirmDeletePeriod(), /ابتدا هشدارها/);
  c.document.getElementById = () => ({ checked: true });
  c.workspace.id = "other";
  await assert.rejects(c.confirmDeletePeriod(), /وضعیت برنامه تغییر/);
});
test("deletion cancellation preserves data without writing", async () => {
  const { c } = fixture();
  await c.openDeletePeriod("second");
  c.confirm = () => false;
  await c.confirmDeletePeriod();
});

test("blocked deletion explains the reason inside the modal instead of throwing", async () => {
  const { c, effects } = fixture();
  await c.openDeletePeriod("first");
  assert.match(effects[0], /این نوبت فعلاً قابل حذف نیست/);
  assert.match(effects[0], /ابتدا نوبت دوم/);
  assert.doesNotMatch(effects[0], /confirm-delete-period/);
});

test("password-protected deletion requires its own inline password before writing", async () => {
  const { c, rows } = fixture();
  c.readWorkspaceSnapshot = async (id) => ({
    period: rows.find((row) => row.id === id),
    data: { schools: [], sessions: [], settings: { password: "protected" } },
  });
  await c.openDeletePeriod("second");
  c.document.getElementById = (id) =>
    id === "periodDeletionConfirmed" ? { checked: true } : { value: "" };
  await assert.rejects(
    c.confirmDeletePeriod(),
    /رمز نوبت انتخاب‌شده را وارد کنید/,
  );
  c.document.getElementById = (id) =>
    id === "periodDeletionConfirmed" ? { checked: true } : { value: "wrong" };
  c.verifyPassword = async () => false;
  await assert.rejects(c.confirmDeletePeriod(), /رمز نوبت درست نیست/);
});
for (const change of [
  "none",
  "catalog",
  "stale epoch",
  "epoch after catalog",
]) {
  const failure = change !== "none";
  test(`period deletion transaction ${failure ? "aborts on " + change : "deletes only owned records without creating an operation backup"}`, async () => {
    const { c, rows, effects } = fixture();
    c.installationToken = "original-installation";
    await c.openDeletePeriod("second");
    const queued = [];
    let durableToken =
        change === "stale epoch" ? "new-installation" : c.installationToken,
      mutationsBeforeEpoch,
      cursorsBeforeEpoch,
      openedCursors = 0;
    c.connection = {
      transaction(names) {
        assert.ok(names.includes("catalog") && names.includes("records"));
        let resolve, reject;
        const done = new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        });
        const tx = {
          done,
          abort() {
            reject(Error("abort"));
          },
          objectStore(name) {
            return {
              get(key) {
                assert.equal(name, "records");
                assert.equal(key, c.RESET_RECORD_KEY);
                const request = {};
                queueMicrotask(() => {
                  mutationsBeforeEpoch = queued.length;
                  cursorsBeforeEpoch = openedCursors;
                  request.result = { value: { token: durableToken } };
                  request.onsuccess();
                });
                return request;
              },
              getAll() {
                const request = { result: structuredClone(rows) };
                if (change === "catalog") request.result[1].revision++;
                queueMicrotask(() => {
                  request.onsuccess();
                  if (change === "epoch after catalog")
                    durableToken = "new-installation";
                  setImmediate(resolve);
                });
                return request;
              },
              put(value) {
                queued.push({ name, value });
              },
              delete(id) {
                queued.push({ name, id });
              },
              openCursor() {
                openedCursors++;
                const request = {};
                const entries = [
                  name === "undo" ? { id: "second" } : { workspace: "second" },
                  { workspace: "first" },
                  { workspace: null },
                  ...(name === "undo"
                    ? [{ id: "first", recoveredPeers: [{ id: "second" }] }]
                    : []),
                ];
                let index = 0;
                const next = () => {
                  const value = entries[index++];
                  request.result = value
                    ? {
                        value,
                        delete() {
                          queued.push({
                            name,
                            owner: value.workspace || value.id,
                          });
                        },
                        update(updated) {
                          queued.push({ name, updated });
                        },
                        continue() {
                          queueMicrotask(next);
                        },
                      }
                    : null;
                  request.onsuccess();
                };
                queueMicrotask(next);
                return request;
              },
            };
          },
        };
        return tx;
      },
    };
    if (failure) {
      await assert.rejects(
        c.confirmDeletePeriod(),
        change === "catalog"
          ? /پنجرهٔ دیگری/
          : (error) => error.code === "INSTALLATION_CHANGED",
      );
      assert.equal(queued.length, 0);
      assert.equal(openedCursors, 0);
      assert.equal(c.installationToken, "original-installation");
      assert.equal(
        effects.some((entry) => entry.type === "period-deleted"),
        false,
      );
    } else {
      await c.confirmDeletePeriod();
      assert.equal(
        queued.some((entry) => entry.value),
        false,
      );
      assert.ok(
        queued.some(
          (entry) => entry.name === "catalog" && entry.id === "second",
        ),
      );
      assert.ok(
        queued
          .filter((entry) => entry.owner)
          .every(
            (entry) =>
              entry.owner === "second" ||
              (entry.name === "undo" && entry.owner === "first"),
          ),
      );
      assert.ok(
        !queued.some((entry) => entry.name === "backups" && entry.owner),
      );
      assert.ok(
        queued.some(
          (entry) => entry.name === "undo" && entry.owner === "second",
        ),
      );
      assert.ok(
        queued.some(
          (entry) => entry.name === "undo" && entry.owner === "first",
        ),
        "deleting a peer invalidates only the dependent shared-recovery undo",
      );
      assert.ok(
        queued.some(
          (entry) =>
            entry.name === "backups" && entry.updated?.workspace === null,
        ),
      );
      assert.ok(effects.some((entry) => entry.type === "period-deleted"));
    }
    assert.equal(mutationsBeforeEpoch, 0);
    assert.equal(cursorsBeforeEpoch, 0);
  });
}
