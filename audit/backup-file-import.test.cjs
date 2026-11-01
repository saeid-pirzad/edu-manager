"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [];
  const candidate = {
    settings: { academicYear: "1405-1406", academicTerm: "first" },
  };
  const c = vm.createContext({
    ready: true,
    workspace: { id: "first" },
    resetBusy: false,
    periodLoading: false,
    connectionRetired: false,
    connection: {},
    normalizeDB: () => candidate,
    flushDrafts: async () => {},
    previewFullBackup: () => effects.push("full"),
    handleError: (error) => errors.push(error),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/period-import.js"),
      "utf8",
    ),
    c,
  );
  // Preserve the old internal compatibility contract while the production
  // default now routes every file to complete-system replacement.
  const defaultImport = c.handleImportV24;
  c.handleImportV24 = (event, options) =>
    defaultImport(event, { replaceSystem: false, ...options });
  c.previewImport = () => effects.push("period");
  const event = (
    text = async () => JSON.stringify({ version: 25, db: candidate }),
  ) => ({
    target: {
      value: "selected",
      files: [{ size: 100, name: "backup.json", text }],
    },
  });
  return { c, effects, errors, event, defaultImport };
}

function recoveryFixture() {
  const f = fixture();
  Object.assign(f.c, {
    ready: false,
    connection: {},
    db: { sentinel: true },
    committed: "original",
    uid: () => "recovered",
    blocked: true,
    storageBlocked: true,
    isAuthenticated: false,
    installWorkspace: async () => ({ id: "recovered" }),
    readWorkspace: async () => ({
      data: { recovered: true },
      records: "recovered-records",
    }),
    rememberPeriod() {},
    render() {},
  });
  return f;
}

test("initial recovery publishes workspace only after successful data read", async () => {
  const f = recoveryFixture();
  f.c.readWorkspace = async (id) => {
    assert.equal(id, "recovered");
    assert.equal(f.c.workspace.id, "first");
    return { data: { recovered: true }, records: "new" };
  };
  await f.c.handleImportV24(f.event());
  assert.equal(f.errors.length, 0);
  assert.equal(f.c.workspace.id, "recovered");
  assert.equal(f.c.ready, true);
});
test("failed recovery read preserves original in-memory workspace", async () => {
  const f = recoveryFixture();
  f.c.readWorkspace = async () => {
    throw Error("read failure");
  };
  await f.c.handleImportV24(f.event());
  assert.equal(f.c.workspace.id, "first");
  assert.equal(f.c.db.sentinel, true);
  assert.equal(f.c.committed, "original");
  assert.equal(f.c.ready, false);
  assert.equal(f.errors.length, 1);
});
for (const stage of ["install", "read"]) {
  test(`initial recovery preserves navigation changed during ${stage}`, async () => {
    const f = recoveryFixture();
    const name = stage === "install" ? "installWorkspace" : "readWorkspace";
    const original = f.c[name];
    f.c[name] = async (...args) => {
      const value = await original(...args);
      f.c.workspace = { id: "new-selection" };
      return value;
    };
    await f.c.handleImportV24(f.event());
    assert.equal(f.c.workspace.id, "new-selection");
    assert.equal(f.c.db.sentinel, true);
    assert.equal(f.errors.length, 1);
  });
}
test("initial recovery rejects a replaced connection after installation", async () => {
  const f = recoveryFixture();
  f.c.installWorkspace = async () => {
    f.c.connection = {};
    return { id: "recovered" };
  };
  await f.c.handleImportV24(f.event());
  assert.equal(f.c.workspace.id, "first");
  assert.equal(f.errors.length, 1);
});
test("initial recovery closes its unused opened connection after destination changes", async () => {
  const f = recoveryFixture();
  let closed = 0,
    installs = 0;
  f.c.connection = null;
  f.c.openDatabase = async () => {
    f.c.ready = true;
    return {
      close() {
        closed++;
      },
    };
  };
  f.c.installWorkspace = async () => {
    installs++;
  };
  await f.c.handleImportV24(f.event());
  assert.equal(closed, 1);
  assert.equal(installs, 0);
  assert.equal(f.c.connection, null);
});
for (const full of [false, true]) {
  test(`file import rejects a changed destination after reading ${full ? "full" : "period"} JSON`, async () => {
    const f = fixture();
    const e = f.event(async () => {
      f.c.workspace.id = "second";
      return JSON.stringify(
        full ? { format: "EduManager.FullBackup" } : { version: 25, db: {} },
      );
    });
    await f.c.handleImportV24(e);
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
    assert.equal(e.target.value, "");
  });
  test(`file import preserves ${full ? "full" : "period"} preview routing`, async () => {
    const f = fixture();
    await f.c.handleImportV24(
      full
        ? f.event(async () =>
            JSON.stringify({ format: "EduManager.FullBackup" }),
          )
        : f.event(),
    );
    assert.deepEqual(f.effects, [full ? "full" : "period"]);
    assert.equal(f.errors.length, 0);
  });
}
test("file import rechecks destination after draft flush", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.c.workspace.id = "second";
  };
  await f.c.handleImportV24(f.event());
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});
test("concurrent file reads are refused and lock releases for retry", async () => {
  const f = fixture();
  let release;
  const first = f.c.handleImportV24(
    f.event(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ),
  );
  const second = f.event();
  await f.c.handleImportV24(second);
  assert.equal(second.target.value, "");
  assert.equal(f.errors.length, 1);
  release(JSON.stringify({ version: 25, db: {} }));
  await first;
  await f.c.handleImportV24(f.event());
  assert.deepEqual(f.effects, ["period", "period"]);
});
test("invalid JSON releases import lock for the next file", async () => {
  const f = fixture();
  await f.c.handleImportV24(f.event(async () => "invalid"));
  await f.c.handleImportV24(f.event());
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.effects, ["period"]);
});
for (const flag of ["resetBusy", "periodLoading", "connectionRetired"]) {
  test(`file import stops if ${flag} begins during read`, async () => {
    const f = fixture();
    await f.c.handleImportV24(
      f.event(async () => {
        f.c[flag] = true;
        return "{}";
      }),
    );
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
  });
}
test("file chosen in recovery cannot attach to a newly ready workspace", async () => {
  const f = fixture();
  f.c.ready = false;
  await f.c.handleImportV24(
    f.event(async () => {
      f.c.ready = true;
      return "{}";
    }),
  );
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});

for (const initialReady of [true, false])
  test(
    "full-system mode refuses an incomplete legacy file before normalization or installation: " +
      initialReady,
    async () => {
      const f = fixture();
      f.c.ready = initialReady;
      let normalized = 0;
      f.c.normalizeDB = () => {
        normalized++;
        throw Error("should not normalize");
      };
      const e = f.event();
      await f.c.handleImportV24(e, { fullSystemOnly: true });
      assert.equal(normalized, 0);
      assert.equal(f.effects.length, 0);
      assert.equal(f.errors.length, 1);
      assert.match(f.errors[0].message, /پشتیبان کامل سیستم نیست/);
      assert.equal(f.c.workspace.id, "first");
      assert.equal(f.c.ready, initialReady);
      assert.equal(e.target.value, "");
    },
  );
test("full-system mode uses the original validated full-replacement preview", async () => {
  const f = fixture();
  await f.c.handleImportV24(
    f.event(async () => JSON.stringify({ format: "EduManager.FullBackup" })),
    { fullSystemOnly: true },
  );
  assert.deepEqual(f.effects, ["full"]);
  assert.equal(f.errors.length, 0);
});

for (const initialReady of [true, false])
  test(
    "default file import previews whole-system replacement without installing a term: " +
      initialReady,
    async () => {
      const f = fixture();
      f.c.ready = initialReady;
      f.c.fullRestoreBusy = false;
      f.c.pendingFullBackup = { previous: true };
      f.c.pendingFullBackupSignature = "old";
      f.c.pendingImport = { previous: true };
      let conversions = 0,
        installs = 0;
      const converted = { format: "EduManager.FullBackup", version: 2 };
      f.c.legacyBackupReplacement = () => {
        conversions++;
        return converted;
      };
      f.c.installWorkspace = async () => {
        installs++;
      };
      f.c.previewFullBackup = (value, details) => {
        assert.equal(value, converted);
        assert.equal(details.sourceName, "backup.json");
        assert.equal(details.legacy, true);
        f.effects.push("full");
      };
      await f.defaultImport(f.event());
      assert.equal(conversions, 1);
      assert.equal(installs, 0);
      assert.equal(f.c.ready, initialReady);
      assert.equal(f.c.workspace.id, "first");
      assert.deepEqual(f.effects, ["full"]);
      assert.equal(f.errors.length, 0);
      assert.equal(f.c.pendingFullBackup, null);
      assert.equal(f.c.pendingImport, null);
    },
  );

test("selecting an invalid replacement file invalidates the prior preview without writing", async () => {
  const f = fixture();
  Object.assign(f.c, {
    fullRestoreBusy: false,
    pendingFullBackup: { old: true },
    pendingFullBackupSignature: "old",
    pendingImport: { old: true },
  });
  await f.defaultImport(f.event(async () => "not JSON"));
  assert.equal(f.c.pendingFullBackup, null);
  assert.equal(f.c.pendingFullBackupSignature, "");
  assert.equal(f.c.pendingImport, null);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});

test("a default whole-system file import rejects a changed connection even in the same workspace", async () => {
  const f = fixture();
  Object.assign(f.c, {
    fullRestoreBusy: false,
    pendingFullBackup: null,
    pendingFullBackupSignature: "",
    pendingImport: null,
  });
  let converted = 0;
  f.c.legacyBackupReplacement = () => {
    converted++;
  };
  await f.defaultImport(
    f.event(async () => {
      f.c.connection = {};
      return JSON.stringify({ version: 25, db: {} });
    }),
  );
  assert.equal(converted, 0);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});

test("recovery opens a validated replacement preview without creating or selecting any term", async () => {
  const f = fixture();
  Object.assign(f.c, {
    ready: false,
    connection: null,
    fullRestoreBusy: false,
    pendingFullBackup: null,
    pendingFullBackupSignature: "",
    pendingImport: null,
  });
  const connection = {
    close() {
      throw Error("unexpected close");
    },
  };
  let validation = 0,
    opened = 0,
    installed = 0;
  f.c.legacyBackupReplacement = () => ({ format: "EduManager.FullBackup" });
  f.c.validateFullBackup = () => {
    validation++;
  };
  f.c.openDatabase = async () => {
    opened++;
    return connection;
  };
  f.c.installWorkspace = async () => {
    installed++;
  };
  await f.defaultImport(f.event());
  assert.equal(validation, 1);
  assert.equal(opened, 1);
  assert.equal(installed, 0);
  assert.equal(f.c.connection, connection);
  assert.equal(f.c.ready, false);
  assert.equal(f.c.workspace.id, "first");
  assert.deepEqual(f.effects, ["full"]);
  assert.equal(f.errors.length, 0);
});

test("a recovery connection opened for a stale selection is closed before any preview or installation", async () => {
  const f = fixture();
  Object.assign(f.c, {
    ready: false,
    connection: null,
    fullRestoreBusy: false,
    pendingFullBackup: null,
    pendingFullBackupSignature: "",
    pendingImport: null,
  });
  let closed = 0;
  f.c.legacyBackupReplacement = () => ({ format: "EduManager.FullBackup" });
  f.c.validateFullBackup = () => {};
  f.c.openDatabase = async () => {
    f.c.ready = true;
    return {
      close() {
        closed++;
      },
    };
  };
  await f.defaultImport(f.event());
  assert.equal(closed, 1);
  assert.equal(f.c.connection, null);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});

for (const value of [null, [], 25, "backup"])
  test(
    "non-object JSON cannot become a replacement: " + JSON.stringify(value),
    async () => {
      const f = fixture();
      Object.assign(f.c, {
        fullRestoreBusy: false,
        pendingFullBackup: null,
        pendingFullBackupSignature: "",
        pendingImport: null,
      });
      let converted = 0;
      f.c.legacyBackupReplacement = () => {
        converted++;
      };
      await f.defaultImport(f.event(async () => JSON.stringify(value)));
      assert.equal(converted, 0);
      assert.equal(f.effects.length, 0);
      assert.equal(f.errors.length, 1);
      assert.match(f.errors[0].message, /ساختار فایل پشتیبان معتبر نیست/);
    },
  );
