"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, ".."),
  baseline = process.argv
    .find((value) => value.startsWith("--baseline="))
    ?.slice("--baseline=".length);
if (baseline !== undefined && !/^[a-f\d]{7,40}$/i.test(baseline))
  throw Error("The optional baseline must be a hexadecimal Git commit ID.");

function context(file, globals, revision) {
  const source = revision
    ? execFileSync("git", ["show", revision + ":src/" + file], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      })
    : fs.readFileSync(path.join(root, "src", file), "utf8");
  const c = vm.createContext(globals);
  vm.runInContext(source, c, { filename: file });
  return c;
}

async function run(revision) {
  const measurements = [];
  for (const size of [1000, 10000]) {
    const entries = Array.from({ length: size }, (_, index) => {
        const value = {
          id: "s" + index,
          schoolId: "school",
          classId: "class",
          lessonId: "lesson",
          date: "2026-11-18",
          period: index % 6,
          scores: [],
        };
        return ["session:" + value.id, value];
      }),
      changed = entries.map(([key, value]) => [key, JSON.stringify(value)]),
      before = entries.map(([key, value]) => ({ key, value })),
      args = {
        changed,
        before,
        removed: [],
        records: new Map([["meta", {}]]),
      },
      directory = context(
        "data/academic-directory-transaction.js",
        { EduAcademicYearDirectory: {} },
        revision,
      ),
      slots = context("domain/session-slots.js", {}, revision),
      save = context(
        "workspace/data/save.js",
        {
          blocked: false,
          workspace: { id: "term", revision: 1, year: "1405-1406" },
          connection: {},
          committed: new Map(),
          resetBusy: false,
          connectionRetired: false,
          failNextWrite: false,
          normalizedName: String,
          academicTermKind: () => "first",
          decodeWorkspaceRecords() {},
          historicalRoster() {},
          EduRecordCommitPlan: {
            create: () => ({ changed, before, removed: [], changes: [] }),
          },
          EduAcademicYear: {
            assertDate: () => assert.fail("unchanged date was revalidated"),
          },
          EduRecordTransaction: {
            commit: async () => ({ id: "term", revision: 2 }),
          },
          broadcast() {},
        },
        revision,
      );
    const scenarios = [
      [
        "session-directory-detection",
        () => directory.EduAcademicDirectoryTransaction.hasChanges(args),
        (result) => assert.equal(result, false),
      ],
      [
        "session-slot-change-detection",
        () => slots.EduSessionSlots.changes(args),
        (result) => {
          assert.equal(result.updates.length, size);
          assert.equal(result.guarded.length, 0);
          assert.equal(result.removed.length, 0);
        },
      ],
      [
        "save-date-validation-and-publish",
        () => save.commitRecords(args.records),
        (result) => {
          assert.equal(result, true);
          assert.equal(save.committed.size, size);
        },
      ],
    ];
    for (const [operation, execute, verify] of scenarios) {
      const samples = [];
      for (let sample = 0; sample < 7; sample++) {
        const start = performance.now(),
          result = await execute(),
          elapsed = performance.now() - start;
        verify(result);
        if (sample >= 2) samples.push(elapsed);
      }
      measurements.push({
        records: size,
        operation,
        medianMs: Number(samples.sort((a, b) => a - b)[2].toFixed(3)),
      });
    }
  }
  return measurements;
}

(async () => {
  const result = {
    node: process.version,
    scope:
      "Synthetic in-memory session batches, two warmups and five measured runs. Save benchmark stubs commit planning and the durable transaction; no IndexedDB, DOM, file I/O or device timing is measured.",
    ...(baseline
      ? { baseline: { revision: baseline, measurements: await run(baseline) } }
      : {}),
    current: { measurements: await run() },
  };
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
