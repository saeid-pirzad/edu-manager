"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const storage = new Map(),
    downloads = [];
  const c = vm.createContext({
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    workspace: { id: "first" },
    snapshotInstallation: async () => ({
      exportedAt: "2026-11-02T10:00:00.000Z",
      stores: { catalog: [{ id: "first" }, { id: "second" }] },
      gradeDrafts: [],
    }),
    todayISO: () => "2026-11-02",
    setStatus() {},
    validateFullBackup() {},
  });
  for (const name of ["local.js", "full-export.js"])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/workspace/backups", name),
        "utf8",
      ),
      c,
    );
  c.snapshotInstallation = async () => ({
    exportedAt: "2026-11-02T10:00:00.000Z",
    stores: { catalog: [{ id: "first" }, { id: "second" }] },
    gradeDrafts: [],
  });
  c.downloadJSON = (content, name) => downloads.push({ content, name });
  return { c, storage, downloads };
}
test("public full export records an installation-wide download request, never a confirmed save", async () => {
  const f = fixture();
  const liveLabel = { textContent: "old label" };
  f.c.document = {
    getElementById: (id) =>
      id === "lastExternalBackupStatus" ? liveLabel : null,
  };
  assert.match(f.c.lastExternalBackupLabel(), /هنوز/);
  assert.equal(await f.c.exportFullBackup(), 2);
  assert.equal(f.downloads.length, 1);
  const entry = JSON.parse(f.storage.get("Edu24.fullBackupDelivery"));
  assert.equal(entry.scope, "installation");
  assert.equal(entry.kind, "download-requested");
  assert.equal(entry.exportedAt, "2026-11-02T10:00:00.000Z");
  assert.match(f.c.lastExternalBackupLabel(), /دانلود.*درخواست شد.*بررسی کنید/);
  assert.doesNotMatch(f.c.lastExternalBackupLabel(), /تأیید شد/);
  assert.equal(liveLabel.textContent, f.c.lastExternalBackupLabel());
  const label = f.c.lastExternalBackupLabel();
  f.c.workspace.id = "second";
  assert.equal(f.c.lastExternalBackupLabel(), label);
});
test("legacy per-period labels do not masquerade as a complete-system backup", () => {
  const f = fixture();
  f.storage.set(
    "Edu24.externalBackup.first",
    JSON.stringify({ date: "2026-10-01", confirmed: true }),
  );
  assert.match(f.c.lastExternalBackupLabel(), /هنوز/);
});
test("delivery labels distinguish sharing handoff from confirmed automatic-file writes", () => {
  const f = fixture();
  for (const [kind, pattern] of [
    ["share-handed-off", /اشتراک‌گذاری سپرده شد.*ارسال نهایی را بررسی کنید/],
    ["automatic-file", /نوشتن.*فایل خودکار تأیید شد/],
  ]) {
    assert.equal(
      f.c.recordFullBackupDelivery({
        kind,
        exportedAt: "2026-11-02T10:00:00.000Z",
      }),
      true,
    );
    assert.match(f.c.lastExternalBackupLabel(), pattern);
  }
});
test("unavailable metadata storage never turns an already delivered backup into a failed export", async () => {
  const f = fixture();
  f.c.localStorage.setItem = () => {
    throw Error("storage unavailable");
  };
  assert.equal(await f.c.exportFullBackup(), 2);
  assert.equal(f.downloads.length, 1);
});
test("failed download does not record a new backup delivery", async () => {
  const f = fixture();
  f.c.downloadJSON = () => {
    throw Error("download failed");
  };
  await assert.rejects(f.c.exportFullBackup(), /download failed/);
  assert.equal(f.storage.size, 0);
});
test("invalid delivery metadata is ignored without displaying an invented success", () => {
  const f = fixture();
  for (const value of [
    "{",
    "null",
    JSON.stringify({
      version: 1,
      scope: "installation",
      kind: "automatic-file",
      exportedAt: "bad date",
    }),
  ]) {
    f.storage.set("Edu24.fullBackupDelivery", value);
    assert.match(f.c.lastExternalBackupLabel(), /هنوز/);
  }
  assert.equal(
    f.c.recordFullBackupDelivery({
      kind: "saved",
      exportedAt: "2026-11-02T10:00:00.000Z",
    }),
    false,
  );
});

test("an unrestorable snapshot is refused before downloading or recording a successful backup delivery", async () => {
  const f = fixture();
  const before = f.c.lastExternalBackupLabel();
  f.c.validateFullBackup = () => {
    throw Error("damaged historical report");
  };
  await assert.rejects(f.c.exportFullBackup(), /damaged historical report/);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.storage.size, 0);
  assert.equal(f.c.lastExternalBackupLabel(), before);
});
