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
    fullRestoreBusy: false,
    resetBusy: false,
    periodLoading: false,
    ready: true,
    blocked: false,
    connectionRetired: false,
    flushDrafts: async () => {},
    lockControls() {},
    drafts: new Map(),
    draftTimer: null,
    draftGeneration: 0,
    clearTimeout() {},
    assertWorkspaceReadable() {},
    academicTermKind: () => "",
    esc: String,
    preserveAsyncTarget: () => () => {},
    allFrom: async () => rows,
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
    snapshotInstallation: async () => ({
      stores: { catalog: structuredClone(rows) },
    }),
    backupStores: [
      "catalog",
      "records",
      "events",
      "reports",
      "undo",
      "backups",
    ],
    restoreCatalogSignature: (value) => JSON.stringify(value),
    uid: () => "safety",
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
});
test("unchecked confirmation or changed workspace prevents deletion before snapshot", async () => {
  const { c } = fixture();
  await c.openDeletePeriod("second");
  c.snapshotInstallation = () => {
    throw Error("must not snapshot");
  };
  c.document.getElementById = () => ({ checked: false });
  await assert.rejects(c.confirmDeletePeriod(), /ابتدا هشدارها/);
  c.document.getElementById = () => ({ checked: true });
  c.workspace.id = "other";
  await assert.rejects(c.confirmDeletePeriod(), /وضعیت برنامه تغییر/);
});
test("deletion cancellation preserves data and does not take a snapshot", async () => {
  const { c } = fixture();
  await c.openDeletePeriod("second");
  c.confirm = () => false;
  c.snapshotInstallation = () => {
    throw Error("must not snapshot");
  };
  await c.confirmDeletePeriod();
});

test("blocked deletion explains the reason inside the modal instead of throwing", async () => {
  const { c, effects } = fixture();
  await c.openDeletePeriod("first");
  assert.match(effects[0], /این نوبت فعلاً قابل حذف نیست/);
  assert.match(effects[0], /ابتدا نوبت دوم/);
  assert.doesNotMatch(effects[0], /confirm-delete-period/);
});

test("password-protected deletion requires its own inline password before snapshot", async () => {
  const { c, rows } = fixture();
  c.readWorkspaceSnapshot = async (id) => ({
    period: rows.find((row) => row.id === id),
    data: { schools: [], sessions: [], settings: { password: "protected" } },
  });
  await c.openDeletePeriod("second");
  c.snapshotInstallation = () => {
    throw Error("must not snapshot");
  };
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
for (const failure of [false, true]) {
  test(`period deletion transaction ${failure ? "aborts on concurrent changes" : "saves safety and deletes only owned records"}`, async () => {
    const { c, rows, effects } = fixture();
    await c.openDeletePeriod("second");
    const queued = [];
    c.connection = {
      transaction(names) {
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
              getAll() {
                const request = { result: structuredClone(rows) };
                if (failure) request.result[1].revision++;
                queueMicrotask(() => {
                  request.onsuccess();
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
                const request = {};
                const entries = [
                  name === "undo" ? { id: "second" } : { workspace: "second" },
                  { workspace: "first" },
                  { workspace: null },
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
      await assert.rejects(c.confirmDeletePeriod(), /پنجرهٔ دیگری/);
      assert.equal(queued.length, 0);
    } else {
      await c.confirmDeletePeriod();
      assert.equal(queued[0].name, "backups");
      assert.ok(queued[0].value.full);
      assert.ok(
        queued.some(
          (entry) => entry.name === "catalog" && entry.id === "second",
        ),
      );
      assert.ok(
        queued
          .filter((entry) => entry.owner)
          .every((entry) => entry.owner === "second"),
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
          (entry) =>
            entry.name === "backups" && entry.updated?.workspace === null,
        ),
      );
      assert.ok(effects.some((entry) => entry.type === "period-deleted"));
    }
  });
}
