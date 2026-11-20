"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ countSearch = false, countFormatters = false } = {}) {
  const constructions = { number: 0, date: 0 };
  const context = vm.createContext({
    EduQuestionBankRepository: {},
    EduQuestionBankFileBackup: { service: {} },
    addEventListener() {},
    ...(countFormatters
      ? {
          Intl: {
            NumberFormat: class {
              constructor(...args) {
                constructions.number++;
                return new Intl.NumberFormat(...args);
              }
            },
            DateTimeFormat: class {
              constructor(...args) {
                constructions.date++;
                return new Intl.DateTimeFormat(...args);
              }
            },
          },
        }
      : {}),
  });
  vm.runInContext(
    fs.readFileSync("src/features/question-bank/domain.js", "utf8"),
    context,
  );
  let normalizations = 0;
  const originalSearch = context.EduQuestionBank.searchText;
  if (countSearch)
    context.EduQuestionBank.searchText = (value) => {
      normalizations++;
      return originalSearch(value);
    };
  for (const name of ["ui-paper", "ui-forms", "ui-builder"])
    vm.runInContext(
      fs.readFileSync(`src/features/question-bank/${name}.js`, "utf8"),
      context,
    );
  const source = fs.readFileSync("src/features/question-bank/ui.js", "utf8");
  const marker = "  root.EduQuestionBankUI = {";
  assert.equal(source.split(marker).length, 2);
  vm.runInContext(
    source.replace(
      marker,
      "  root.testIndexes = { questionSearch, questionCountsByUnit, number, dateLabel };\n" +
        marker,
    ),
    context,
  );
  const types = Object.keys(context.EduQuestionBank.types);
  const units = Array.from({ length: 8 }, (_, i) => ({
    id: `unit-${i}`,
    courseId: i < 6 ? "course-a" : "course-b",
  }));
  const texts = [
    "كِتاب يكم ١۲",
    "جای‌خالی ۳",
    "Exam ４",
    "چرا؟\nپاسخ کوتاه",
    "سؤال سوم",
  ];
  const questions = Array.from({ length: 160 }, (_, i) => ({
    id: `q-${i}`,
    unitId: units[Math.floor(i / types.length) % units.length].id,
    type: types[i % types.length],
    text: texts[Math.floor(i / (types.length * units.length)) % texts.length],
  }));
  return {
    ...context.testIndexes,
    normalize: originalSearch,
    normalizations: () => normalizations,
    constructions,
    units,
    types,
    questions,
  };
}

const ids = (list) => Array.from(list, (q) => q.id);

test("bank formatters construct lazily once and preserve localized number and UTC date output", () => {
  const f = fixture({ countFormatters: true });
  assert.deepEqual(f.constructions, { number: 0, date: 0 });
  const number = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
  for (const value of [0, 1.25, 1.234, -2.5, 1234567.89, NaN, Infinity, 4n])
    assert.equal(f.number(value), number.format(value));
  assert.deepEqual(f.constructions, { number: 1, date: 0 });
  const date = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  for (const value of ["2026-11-18", "2026-03-20", "2026-11-18T23:30:00-05:00"])
    assert.equal(f.dateLabel(value), date.format(new Date(value)));
  assert.throws(() => f.dateLabel("invalid"));
  assert.deepEqual(f.constructions, { number: 1, date: 1 });
});

test("backup formatter stays lazy and retains its independent default precision", () => {
  let constructions = 0;
  const c = vm.createContext({
    EduQuestionBank: {},
    EduQuestionBankRepository: {},
    EduQuestionBankFileBackup: { service: {} },
    Intl: {
      NumberFormat: class {
        constructor(...args) {
          constructions++;
          return new Intl.NumberFormat(...args);
        }
      },
    },
  });
  const source = fs.readFileSync(
    "src/features/question-bank/backup-ui.js",
    "utf8",
  );
  const marker = "  root.EduQuestionBankBackupUI = { mount };";
  assert.equal(source.split(marker).length, 2);
  vm.runInContext(
    source.replace(marker, "  root.testNumber = number;\n" + marker),
    c,
  );
  assert.equal(constructions, 0);
  const original = new Intl.NumberFormat("fa-IR");
  for (const value of [0, 1.2345, 1024, 12345.67, -5, NaN, Infinity])
    assert.equal(c.testNumber(value), original.format(value));
  assert.equal(constructions, 1);
});

test("question index preserves Persian search, scope, type filters and insertion order", () => {
  const f = fixture();
  const unitMap = new Map(
    f.units
      .filter((unit) => unit.courseId === "course-a")
      .map((u) => [u.id, u]),
  );
  const search = f.questionSearch(f.questions, unitMap);
  const before = JSON.stringify(f.questions);
  for (const unitId of ["", ...unitMap.keys()])
    for (const type of ["", ...f.types])
      for (const query of [
        "",
        "  ",
        "\u200c",
        "\u064b",
        "کتاب یکم 12",
        "جای خالی ٣",
        "exam ۴",
        "چرا؟ پاسخ",
        "ناپیدا",
      ]) {
        const baseline = f.questions.filter(
          (q) =>
            unitMap.has(q.unitId) &&
            (!unitId || q.unitId === unitId) &&
            (!type || q.type === type) &&
            f.normalize(q.text).includes(f.normalize(query)),
        );
        assert.deepEqual(ids(search(unitId, type, query)), ids(baseline), {
          unitId,
          type,
          query,
        });
      }
  assert.equal(JSON.stringify(f.questions), before);
});

test("empty query and page changes skip text normalization and repeated filtering", () => {
  const f = fixture({ countSearch: true });
  let scopeReads = 0;
  const unitMap = {
    has(id) {
      scopeReads++;
      return id !== "unit-7";
    },
  };
  const search = f.questionSearch(f.questions, unitMap);
  assert.equal(scopeReads, f.questions.length);
  const first = search("", "", "");
  assert.equal(f.normalizations(), 1);
  for (let page = 0; page < 10; page++)
    assert.equal(search("", "", "  "), first);
  assert.equal(f.normalizations(), 11, "only the query is normalized per draw");
  assert.equal(scopeReads, f.questions.length, "course scope is indexed once");
});

test("search text is normalized once per eligible question across typing and paging", () => {
  const f = fixture({ countSearch: true });
  const unitMap = new Map(f.units.map((u) => [u.id, u]));
  const search = f.questionSearch(f.questions, unitMap);
  search("", "", "کتاب");
  assert.equal(f.normalizations(), f.questions.length + 1);
  search("", "", "کتاب یکم");
  assert.equal(f.normalizations(), f.questions.length + 2);
  const first = search("unit-0", "mcq", "کتاب یکم 12");
  assert.equal(f.normalizations(), f.questions.length + 3);
  assert.equal(search("unit-0", "mcq", "كِتاب يكم ١۲"), first);
  assert.equal(f.normalizations(), f.questions.length + 4);
});

test("a new render indexes edited, added and removed questions without stale text", () => {
  const f = fixture();
  const unitMap = new Map(f.units.map((u) => [u.id, u]));
  const first = f.questionSearch(f.questions, unitMap);
  const before = ids(first("", "", "کتاب"));
  assert.ok(before.length > 0);
  const next = structuredClone(f.questions);
  next[0].text = "پاسخ ویرایش‌شده";
  next.splice(1, 1);
  next.push({ ...next[0], id: "new", text: "کتاب جدید" });
  const second = f.questionSearch(next, unitMap);
  assert.ok(!ids(second("", "", "کتاب")).includes("q-0"));
  assert.ok(!ids(second("", "", "کتاب")).includes("q-1"));
  assert.ok(ids(second("", "", "کتاب")).includes("new"));
  assert.deepEqual(ids(second("", "", "پاسخ ویرایش")), ["q-0"]);
  assert.deepEqual(ids(first("", "", "کتاب")), before);
});

test("per-unit capacities match original scans for every type and selected subset", () => {
  const f = fixture();
  const units = f.units.filter((unit) => unit.courseId === "course-a");
  const counts = f.questionCountsByUnit(f.questions, units);
  assert.equal(counts.size, units.length);
  assert.equal(counts.has("unit-7"), false);
  for (const unit of units)
    assert.equal(
      counts.get(unit.id).total,
      f.questions.filter((q) => q.unitId === unit.id).length,
    );
  for (let mask = 0; mask < 1 << units.length; mask++) {
    const selected = units.filter((_, i) => mask & (1 << i));
    for (const type of f.types)
      assert.equal(
        selected.reduce(
          (sum, unit) => sum + counts.get(unit.id).types[type],
          0,
        ),
        f.questions.filter(
          (q) => q.type === type && selected.some((u) => q.unitId === u.id),
        ).length,
      );
  }
});

test("builder capacity updates never rescan questions after the initial render index", () => {
  const f = fixture();
  let visits = 0;
  const questions = f.questions.map((q) => ({
    ...q,
    get unitId() {
      visits++;
      return q.unitId;
    },
  }));
  const counts = f.questionCountsByUnit(questions, f.units);
  assert.equal(visits, questions.length);
  for (let update = 0; update < 100; update++)
    for (const unit of f.units)
      for (const type of f.types)
        assert.ok(Number.isInteger(counts.get(unit.id).types[type]));
  assert.equal(visits, questions.length);
});

test("fresh builder indexes include question type changes, removals and empty units", () => {
  const f = fixture();
  const before = JSON.stringify(f.questions);
  const initial = f.questionCountsByUnit(f.questions, f.units);
  const next = structuredClone(f.questions);
  next[0].type = "essay";
  next.splice(1, 1);
  const units = [...f.units, { id: "empty" }];
  const counts = f.questionCountsByUnit(next, units);
  assert.equal(
    counts.get("unit-0").types.mcq,
    initial.get("unit-0").types.mcq - 1,
  );
  assert.equal(
    counts.get("unit-0").types.essay,
    initial.get("unit-0").types.essay + 1,
  );
  assert.equal(counts.get("unit-0").total, initial.get("unit-0").total - 1);
  assert.equal(counts.get("empty").total, 0);
  for (const type of f.types) assert.equal(counts.get("empty").types[type], 0);
  assert.equal(JSON.stringify(f.questions), before);
});
