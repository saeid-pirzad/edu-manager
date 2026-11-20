"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

// This policy can load with no workspace, DOM, storage, or other application code.
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/single-file-policy.js"),
    "utf8",
  ),
  context,
);
const policy = context.EduSingleFilePolicy;
const empty = () => ({
  version: 1,
  records: 0,
  schools: 0,
  students: 0,
  lessons: 0,
  grades: 0,
  attendance: 0,
  activities: 0,
});
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("the independent content policy has an immutable API and leaves inputs unchanged", () => {
  assert.equal(Object.isFrozen(policy), true);
  assert.throws(() => {
    policy.sourceDropped = () => false;
  }, TypeError);
  const snapshot = freeze({
      stores: {
        records: [
          {
            logical: "class:c",
            value: { students: [{ name: "student" }], lessons: [] },
          },
        ],
      },
    }),
    before = JSON.stringify(snapshot),
    baseline = policy.contentBaseline(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(baseline.students, 1);
  assert.notEqual(policy.contentBaseline(snapshot), baseline);
  assert.equal(policy.sourceDropped(freeze(baseline), freeze(empty())), true);
  assert.deepEqual(
    policy.contentBaseline({}),
    policy.contentBaseline({ stores: {} }),
  );
});

test("content counts include archived students, zero grades and recorded attendance without retaining personal data", () => {
  const snapshot = {
    stores: {
      records: [
        { logical: "meta", value: { layout: [{ name: "school" }, {}] } },
        {
          logical: "class:c",
          value: {
            students: [{ name: "first" }, { name: "second" }],
            archivedStudents: [{ name: "archived" }],
            lessons: [
              {
                kardaneshScores: {
                  first: { practical: 0, theory: "", midterm: " 17 " },
                  second: {
                    practical: NaN,
                    theory: false,
                    nested: [10, "0", " ", null, Infinity],
                  },
                },
              },
              { podScores: { first: { m: 0, c: "2" } } },
            ],
            nested: {
              unitScores: [0, "7", ""],
              competencyScores: { first: 12 },
            },
            ignoredScores: { first: 20 },
          },
        },
        { logical: "class:empty" },
        {
          logical: "session:s",
          value: {
            scores: [{}, {}, {}],
            attendance: {
              zero: 0,
              no: false,
              whitespace: " ",
              empty: "",
              missing: null,
              absent: undefined,
              present: "present",
            },
          },
        },
        { logical: "settings", value: { unitScores: [20] } },
      ],
      questionBank: [{ students: [1, 2, 3], scores: [20] }],
    },
  };
  assert.deepEqual(
    { ...policy.contentBaseline(freeze(snapshot)) },
    {
      version: 1,
      records: 4,
      schools: 2,
      students: 3,
      lessons: 2,
      grades: 9,
      attendance: 4,
      activities: 3,
    },
  );
});

test("moving a roster to the archive preserves its content baseline", () => {
  for (const size of [0, 1, 9, 10, 24, 100]) {
    const roster = Array.from({ length: size }, (_, id) => ({ id })),
      records = (students, archivedStudents) => ({
        stores: {
          records: [
            {
              logical: "class:c",
              value: { students, archivedStudents, lessons: [] },
            },
          ],
        },
      }),
      before = policy.contentBaseline(records(roster, [])),
      after = policy.contentBaseline(records([], roster));
    assert.deepEqual(after, before);
    assert.equal(policy.sourceDropped(before, after), false);
  }
});

test("complete source and educational wipes suspend even below the large-loss threshold", () => {
  assert.equal(policy.sourceDropped(empty(), empty()), false);
  assert.equal(policy.sourceDropped({ ...empty(), records: 1 }, empty()), true);
  for (const key of [
    "students",
    "lessons",
    "grades",
    "attendance",
    "activities",
  ])
    assert.equal(
      policy.sourceDropped(
        { ...empty(), records: 3, schools: 1, [key]: 1 },
        { ...empty(), records: 3, schools: 1 },
      ),
      true,
      key + " wipe must not be hidden by retained class shells",
    );
  for (const previous of [undefined, null, {}, { version: 0 }, { version: 2 }])
    assert.equal(policy.sourceDropped(previous, empty()), false);
});

test("each content count preserves the ten-item and half-remaining loss boundaries", () => {
  const cases = [
    [0, 0, false],
    [9, 0, false],
    [10, 1, false],
    [10, 0, true],
    [18, 9, false],
    [19, 9, true],
    [20, 10, true],
    [20, 11, false],
    [21, 11, false],
    [21, 10, true],
    [100, 51, false],
    [100, 50, true],
    [100, 99, false],
    [100, 101, false],
  ];
  for (const key of Object.keys(empty()).filter((key) => key !== "version"))
    for (const [before, after, expected] of cases) {
      // Other educational content remains present so this exercises only the
      // large-loss boundary, rather than the complete-wipe safeguards above.
      const background = { ...empty(), students: 1, lessons: 1 };
      assert.equal(
        policy.sourceDropped(
          { ...background, [key]: before },
          { ...background, [key]: after },
        ),
        expected,
        key + ": " + before + " -> " + after,
      );
    }
});

test("adding content cannot turn an accepted source into a detected loss", () => {
  let seed = 371;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % 41;
  };
  for (let attempt = 0; attempt < 1000; attempt++) {
    const previous = empty(),
      current = empty();
    for (const key of Object.keys(current).filter((key) => key !== "version")) {
      previous[key] = random();
      current[key] = random();
    }
    if (policy.sourceDropped(previous, current)) continue;
    const added = { ...current };
    for (const key of Object.keys(added).filter((key) => key !== "version"))
      added[key] += random();
    assert.equal(policy.sourceDropped(freeze(previous), freeze(added)), false);
  }
});
