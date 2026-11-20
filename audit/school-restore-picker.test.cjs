"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const previews = [],
    errors = [],
    pickerCalls = [],
    inputListeners = new Map();
  let inputClicks = 0,
    fileReads = 0,
    textReads = 0,
    tab = "school",
    tabGeneration = 0,
    pickerResult;
  const input = {
      value: "",
      files: [],
      click: () => inputClicks++,
      addEventListener: (type, listener) => inputListeners.set(type, listener),
      removeEventListener: (type) => inputListeners.delete(type),
    },
    text =
      "\uFEFF" +
      JSON.stringify({ format: "EduManager.FullBackup", version: 2 }),
    handle = {
      kind: "file",
      name: "Classyar-Classroom(3).json",
      getFile: async () => {
        fileReads++;
        return {
          name: handle.name,
          size: Buffer.byteLength(text),
          lastModified: 27,
          text: async () => {
            textReads++;
            return text;
          },
        };
      },
      requestPermission() {
        throw Error("Reading a preview must not request write permission");
      },
      createWritable() {
        throw Error("Reading a preview must not open a writable stream");
      },
    };
  const c = vm.createContext({
    ready: true,
    workspace: { id: "first" },
    connection: {},
    installationToken: "current-installation",
    resetBusy: false,
    periodLoading: false,
    connectionRetired: false,
    fullRestoreBusy: false,
    pendingFullBackup: { old: true },
    pendingFullBackupSignature: "old",
    pendingFullBackupFile: { old: true },
    pendingImport: { old: true },
    document: {
      getElementById: (id) =>
        id === "backupHub" ? {} : id === "importFile" ? input : null,
    },
    window: {
      showOpenFilePicker(options) {
        pickerCalls.push(options);
        return pickerResult || Promise.resolve([handle]);
      },
      showSaveFilePicker() {
        throw Error("Restore selection must not create a save destination");
      },
    },
    previewFullBackup: (value, details) => previews.push({ value, details }),
    handleError: (error) => errors.push(error),
    session: {
      isCurrent: (scope) => !scope || scope === tab,
      captureTab: (scope) => {
        const captured = tabGeneration;
        return () => captured === tabGeneration && tab === scope;
      },
    },
  });
  for (const name of [
    "src/workspace/backups/single-file-name.js",
    "src/workspace/backups/period-import.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", name), "utf8"),
      c,
    );
  vm.runInContext("backupHubSession = session", c);
  return {
    c,
    handle,
    text,
    previews,
    errors,
    pickerCalls,
    input,
    pickerResult(value) {
      pickerResult = value;
    },
    selectTab(next) {
      tab = next;
      tabGeneration++;
    },
    cancelInput: () => inputListeners.get("cancel")?.(),
    inputClicks: () => inputClicks,
    fileReads: () => fileReads,
    textReads: () => textReads,
    pickerPending: () => vm.runInContext("backupHubPickerPending", c),
  };
}

test("native restore picker opens in the click and retains exact source bytes without writing", async () => {
  const f = fixture(),
    pending = f.c.chooseBackupImport();
  assert.equal(f.pickerCalls.length, 1);
  assert.equal(f.fileReads(), 0);
  assert.equal(f.pickerCalls[0].multiple, false);
  assert.equal(f.pickerCalls[0].excludeAcceptAllOption, true);
  await pending;
  assert.equal(f.inputClicks(), 0);
  assert.equal(f.errors.length, 0);
  assert.equal(f.previews.length, 1);
  const preview = f.previews[0];
  assert.equal(preview.value.format, "EduManager.FullBackup");
  assert.equal(preview.details.sourceName, f.handle.name);
  assert.equal(preview.details.sourceFile.handle, f.handle);
  assert.equal(preview.details.sourceFile.text, f.text);
  assert.equal(preview.details.sourceFile.modified, 27);
  assert.equal(preview.details.sourceFile.size, Buffer.byteLength(f.text));
  assert.equal(Object.isFrozen(preview.details.sourceFile), true);
  assert.equal(f.pickerPending(), false);
  assert.equal(vm.runInContext("backupHubImportOrigin", f.c), null);
});

test("native picker cancellation never opens a fallback picker and permits another selection", async () => {
  const f = fixture();
  f.pickerResult(
    Promise.reject(Object.assign(Error("cancel"), { name: "AbortError" })),
  );
  assert.equal(await f.c.chooseBackupImport(), false);
  assert.equal(f.pickerPending(), false);
  assert.equal(f.inputClicks(), 0);
  assert.equal(f.fileReads(), 0);
  assert.equal(f.previews.length, 0);
  assert.equal(f.errors.length, 0);
  f.pickerResult(Promise.resolve([f.handle]));
  await f.c.chooseBackupImport();
  assert.equal(f.previews.length, 1);
});

test("a synchronous native picker failure releases its lock without opening fallback input", async () => {
  const f = fixture();
  f.c.window.showOpenFilePicker = () => {
    throw Error("native picker unavailable");
  };
  assert.throws(() => f.c.chooseBackupImport(), /native picker unavailable/);
  assert.equal(f.pickerPending(), false);
  assert.equal(f.inputClicks(), 0);
});

test("another native picker cannot start while the first selection is pending", async () => {
  const f = fixture(),
    selection = deferred();
  f.pickerResult(selection.promise);
  const pending = f.c.chooseBackupImport();
  assert.throws(() => f.c.chooseBackupImport(), /در حال انجام است/);
  assert.equal(f.pickerCalls.length, 1);
  selection.resolve([f.handle]);
  await pending;
  assert.equal(f.previews.length, 1);
  assert.equal(f.pickerPending(), false);
});

test("returning to the school tab cannot revive an abandoned native picker", async () => {
  const f = fixture(),
    selection = deferred();
  f.pickerResult(selection.promise);
  const pending = f.c.chooseBackupImport();
  f.selectTab("bank");
  f.selectTab("school");
  selection.resolve([f.handle]);
  await assert.rejects(pending, /صفحه یا اطلاعات هنگام انتخاب فایل تغییر کرد/);
  assert.equal(f.fileReads(), 0);
  assert.equal(f.previews.length, 0);
  assert.equal(f.pickerPending(), false);
});

for (const stage of ["getFile", "text"])
  for (const change of [
    "connection",
    "installation",
    "workspace",
    "ready",
    "tab",
  ])
    test(`native restore rejects a changed ${change} during ${stage}`, async () => {
      const f = fixture(),
        original = f.handle.getFile;
      const invalidate = () => {
        if (change === "connection") f.c.connection = {};
        else if (change === "installation")
          f.c.installationToken = "replacement";
        else if (change === "workspace") f.c.workspace = { id: "another" };
        else if (change === "ready") f.c.ready = false;
        else {
          f.selectTab("bank");
          f.selectTab("school");
        }
      };
      f.handle.getFile = async () => {
        const file = await original();
        if (stage === "getFile") invalidate();
        else {
          const read = file.text;
          file.text = async () => {
            const text = await read();
            invalidate();
            return text;
          };
        }
        return file;
      };
      if (stage === "getFile")
        await assert.rejects(f.c.chooseBackupImport(), /صفحه یا اطلاعات/);
      else {
        await f.c.chooseBackupImport();
        assert.equal(f.errors.length, 1);
      }
      assert.equal(f.previews.length, 0);
      assert.equal(f.pickerPending(), false);
    });

test("native picker remains exclusive throughout an asynchronous source text read", async () => {
  const f = fixture(),
    reading = deferred(),
    entered = deferred(),
    original = f.handle.getFile;
  f.handle.getFile = async () => ({
    ...(await original()),
    text: async () => {
      entered.resolve();
      return reading.promise;
    },
  });
  const pending = f.c.chooseBackupImport();
  await entered.promise;
  assert.throws(() => f.c.chooseBackupImport(), /در حال انجام است/);
  assert.equal(f.pickerCalls.length, 1);
  reading.resolve(f.text);
  await pending;
  assert.equal(f.previews.length, 1);
  assert.equal(f.pickerPending(), false);
});

test("a legacy JSON source retains original bytes while previewing its full replacement conversion", async () => {
  const f = fixture(),
    original = f.handle.getFile,
    text = '\uFEFF{"version":25,"db":{"schools":[]}}',
    replacement = { format: "EduManager.FullBackup", converted: true };
  f.c.legacyBackupReplacement = (parsed) => {
    assert.equal(parsed.version, 25);
    return replacement;
  };
  f.handle.getFile = async () => ({
    ...(await original()),
    size: Buffer.byteLength(text),
    text: async () => text,
  });
  await f.c.chooseBackupImport();
  assert.equal(f.errors.length, 0);
  assert.equal(f.previews[0].value, replacement);
  assert.equal(f.previews[0].details.legacy, true);
  assert.equal(f.previews[0].details.sourceFile.text, text);
  assert.equal(f.previews[0].details.sourceFile.handle, f.handle);
});

test("restore selection preserves manual input fallback without inferring a writable handle", async () => {
  const f = fixture();
  delete f.c.window.showOpenFilePicker;
  assert.equal(f.c.chooseBackupImport(), undefined);
  assert.equal(f.inputClicks(), 1);
  f.input.files = [await f.handle.getFile()];
  f.input.value = "selected";
  await f.c.handleImportV24({ target: f.input });
  assert.equal(f.errors.length, 0);
  assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0].details.sourceFile, null);
  assert.equal(f.input.value, "");
  assert.equal(vm.runInContext("backupHubImportOrigin", f.c), null);
});

test("cancelled fallback input releases its captured school tab lease", () => {
  const f = fixture();
  delete f.c.window.showOpenFilePicker;
  f.c.chooseBackupImport();
  f.cancelInput();
  assert.equal(vm.runInContext("backupHubImportOrigin", f.c), null);
  assert.equal(f.previews.length, 0);
});

for (const mode of ["TXT", "without writable file support"])
  test(`native ${mode} restore previews data without connecting the source`, async () => {
    const f = fixture();
    if (mode === "TXT") f.handle.name = "Classyar-Classroom(3).txt";
    else delete f.c.window.showSaveFilePicker;
    await f.c.chooseBackupImport();
    assert.equal(f.errors.length, 0);
    assert.equal(f.previews.length, 1);
    assert.equal(f.previews[0].details.sourceFile, null);
  });

for (const text of ["", " \n\t"])
  test(`empty ${text ? "whitespace" : "zero-byte"} restore points to file saving and never opens a preview`, async () => {
    const f = fixture(),
      original = f.handle.getFile;
    f.handle.getFile = async () => ({
      ...(await original()),
      size: Buffer.byteLength(text),
      text: async () => text,
    });
    await f.c.chooseBackupImport();
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0].message, /فایل خالی قابل بازیابی نیست/);
    assert.match(f.errors[0].message, /انتخاب فایل برای ذخیره/);
    assert.equal(f.previews.length, 0);
    assert.equal(f.c.pendingFullBackup, null);
    assert.equal(f.c.pendingFullBackupFile, null);
    assert.equal(f.pickerPending(), false);
  });

test("a file from the question-bank scope is refused before reading its bytes", async () => {
  const f = fixture();
  f.handle.name = "Classyar-QuestionBank.json";
  await f.c.chooseBackupImport();
  assert.equal(f.textReads(), 0);
  assert.equal(f.previews.length, 0);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /Classyar-Classroom/);
});
