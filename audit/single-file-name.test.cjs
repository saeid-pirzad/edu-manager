"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function fixture(shared = new Map()) {
  const storage = {
    blocked: false,
    full: false,
    getItem(k) {
      if (this.blocked) throw Error("denied");
      return shared.get(k) ?? null;
    },
    setItem(k, v) {
      if (this.blocked || this.full) throw Error("denied");
      shared.set(k, v);
    },
  };
  const context = vm.createContext({ localStorage: storage });
  vm.runInContext(
    fs.readFileSync("src/workspace/backups/single-file-name.js", "utf8"),
    context,
  );
  return {
    storage,
    shared,
    context,
    reserve: () => vm.runInContext("reserveSingleFileName()", context),
    validate: (name, options) => context.assertClassroomFileName(name, options),
  };
}

test("classroom filename errors identify the actual rejected name and the supported prefix", () => {
  const f = fixture();
  for (const name of [
    "legacy-school.json",
    "Classyar-Classroom(۱).json",
    "Classyar-QuestionBank.json",
  ])
    assert.throws(
      () => f.validate(name),
      (error) =>
        error.message.includes("«" + name + "»") &&
        error.message.includes("Classyar-Classroom.json"),
    );
});
test("stable classroom names reserve numbered copies across reloads, independently of date", () => {
  const f = fixture(),
    a = f.reserve();
  assert.equal(a.name, "Classyar-Classroom.json");
  assert.equal(typeof a.then, "undefined");
  assert.equal(f.reserve().name, "Classyar-Classroom(1).json");
  assert.equal(fixture(f.shared).reserve().name, "Classyar-Classroom(2).json");
});
test("cancelled reservations release only their own latest number", () => {
  const f = fixture(),
    first = f.reserve(),
    second = f.reserve();
  assert.equal(first.release(), false);
  assert.equal(second.release(), true);
  assert.equal(second.release(), false);
  assert.equal(f.reserve().name, "Classyar-Classroom(1).json");
});
test("a stale tab cannot release another tab's reservation", () => {
  const f = fixture(),
    pending = f.reserve();
  fixture(f.shared).reserve();
  assert.equal(pending.release(), false);
  assert.equal(f.reserve().name, "Classyar-Classroom(2).json");
});
for (const mode of ["blocked", "full"])
  test("unavailable storage keeps in-page reservations: " + mode, () => {
    const f = fixture();
    f.reserve();
    f.storage[mode] = true;
    const pending = f.reserve();
    assert.equal(pending.name, "Classyar-Classroom(1).json");
    assert.equal(pending.release(), true);
    assert.equal(f.reserve().name, "Classyar-Classroom(1).json");
    f.storage[mode] = false;
    assert.equal(f.reserve().name, "Classyar-Classroom(2).json");
  });
for (const name of [
  "Classyar-Classroom.json",
  "Classyar-Classroom(1).json",
  "Classyar-Classroom (12).json",
])
  test("accept exact classroom prefix and numbered copies: " + name, () =>
    assert.doesNotThrow(() => fixture().validate(name)),
  );
for (const name of [
  "Classyar-QuestionBank.json",
  "Classyar-Classroom-old.json",
  "Classyar-Classroom(0).json",
  "Classyar-Classroom(01).json",
  "Classyar-Classroom(-1).json",
  "Classyar-Classroom(1).json.exe",
  "xClassyar-Classroom.json",
  "classyar-Classroom.json",
  "Classyar-Classroom.txt",
  undefined,
])
  test("reject wrong classroom destination: " + name, () =>
    assert.throws(() => fixture().validate(name)),
  );
test("shared TXT backup uses the same classroom prefix and is accepted only for import", () => {
  const f = fixture();
  assert.doesNotThrow(() =>
    f.validate("Classyar-Classroom (2).txt", { allowText: true }),
  );
  assert.throws(() =>
    f.validate("Classyar-QuestionBank.txt", { allowText: true }),
  );
});
