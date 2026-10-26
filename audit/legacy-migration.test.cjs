"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
test("legacy branch normalization records warnings without an undefined binding or input mutation", () => {
  const context = vm.createContext({
    validateDB() {},
    defaultDB: () => ({ settings: {} }),
    migrateToMaster() {},
    migrateUnitScores() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/validation/database.js"),
      "utf8",
    ),
    context,
  );
  const original = {
    schools: [
      {
        classes: [
          {
            lessons: [
              {
                name: "lesson",
                gradingPolicy: { method: "dual", branch: "fani" },
                courseInfo: { branch: "fani" },
              },
            ],
          },
        ],
      },
    ],
  };
  const result = context.legacy_prepareDB(original);
  assert.equal(
    original.schools[0].classes[0].lessons[0].gradingPolicy.branch,
    "fani",
  );
  assert.equal(
    result.schools[0].classes[0].lessons[0].gradingPolicy.branch,
    "kardanesh",
  );
  assert.equal(result.migrationWarnings.length, 1);
  assert.equal(context.legacy_prepareDB(result).migrationWarnings.length, 1);
});
