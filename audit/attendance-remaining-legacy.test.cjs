"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");

for (const status of ["present", "absent"])
  test(`legacy remaining ${status} preserves recorded statuses and uses the session roster`, async () => {
    const attendance = {
      a: "present",
      b: "absent",
      c: "leave",
      d: "late:9",
      outsider: "present",
    };
    const session = {
      id: "session",
      schoolId: "school",
      classId: "class",
      attendance,
    };
    const roster = ["a", "b", "c", "d", "missing"].map((id) => ({ id }));
    let writes = 0,
      refreshes = 0;
    const context = vm.createContext({
      db: { sessions: [session] },
      currentSessionId: session.id,
      getClassObj: () => ({ students: [{ id: "new-student" }] }),
      sessionStudents: () => roster,
      saveDB: async () => {
        writes++;
      },
      refreshSessionAttendanceRows: (saved) => {
        assert.equal(saved, session);
        refreshes++;
      },
    });
    vm.runInContext(
      fs.readFileSync("src/legacy/sessions/dialog.js", "utf8"),
      context,
    );
    await context.legacy_setAllAttendance(status, { onlyUnset: true });
    assert.deepEqual(attendance, {
      a: "present",
      b: "absent",
      c: "leave",
      d: "late:9",
      outsider: "present",
      missing: status,
    });
    assert.equal(writes, 1);
    assert.equal(refreshes, 1);
    assert.equal(
      await context.legacy_setAllAttendance(status, { onlyUnset: true }),
      false,
    );
    assert.equal(writes, 1);
  });
