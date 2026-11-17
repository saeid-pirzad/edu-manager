"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

class Element {
  constructor(tag, options = {}, ...children) {
    this.tagName = tag;
    this.className = options.className || "";
    this.dataset = { ...options.dataset };
    this.colSpan = options.colSpan || 1;
    this.rowSpan = options.rowSpan || 1;
    this._text = options.text || "";
    this.children = children;
    for (const child of children) child.parentElement = this;
  }
  get textContent() {
    return (
      this._text + this.children.map((child) => child.textContent).join("")
    );
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get cells() {
    return this.children.filter((child) =>
      ["th", "td"].includes(child.tagName),
    );
  }
  get rows() {
    return this.children.filter((child) => child.tagName === "tr");
  }
  get tHead() {
    return this.children.find((child) => child.tagName === "thead");
  }
  get tBodies() {
    return this.children.filter((child) => child.tagName === "tbody");
  }
  matches(selector) {
    const [tag, ...classes] = selector.split(".");
    return (
      (!tag || tag === this.tagName) &&
      classes.every((name) => this.className.split(" ").includes(name))
    );
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement)
      if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector) {
    const parts = selector.split(" "),
      last = parts.pop();
    return descendants(this).filter(
      (node) =>
        node.matches(last) &&
        (!parts.length || node.parentElement?.closest(parts[0])),
    );
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  cloneNode() {
    return new Element(
      this.tagName,
      {
        className: this.className,
        dataset: this.dataset,
        colSpan: this.colSpan,
        rowSpan: this.rowSpan,
        text: this._text,
      },
      ...this.children.map((child) => child.cloneNode(true)),
    );
  }
  remove() {
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  replaceWith(...nodes) {
    const parent = this.parentElement;
    parent.children.splice(parent.children.indexOf(this), 1, ...nodes);
    for (const node of nodes) node.parentElement = parent;
    this.parentElement = null;
  }
}
function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}
const number = (value) =>
  String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
function snapshot(node) {
  return {
    tag: node.tagName,
    className: node.className,
    dataset: node.dataset,
    colSpan: node.colSpan,
    rowSpan: node.rowSpan,
    text: node._text,
    children: node.children.map(snapshot),
  };
}
function fixture(count, className = "karnameh-unit-competency-table") {
  const cell = (tag, text, options = {}) =>
    new Element(tag, { ...options, text });
  const header = new Element(
    "thead",
    {},
    new Element(
      "tr",
      {},
      cell("th", "درس", { rowSpan: 2 }),
      ...Array.from({ length: count }, (_, position) =>
        cell("th", "واحد کار " + number(position + 1), { colSpan: 3 }),
      ),
    ),
    new Element(
      "tr",
      {},
      ...Array.from({ length: count }, () =>
        ["مستمر", "شایستگی", "نتیجه"].map((name) => cell("th", name)),
      ).flat(),
    ),
  );
  const rows = [count, Math.min(count, 7), 0].map(
    (available, lesson) =>
      new Element(
        "tr",
        { dataset: { lesson: String(lesson) } },
        cell("th", "درس " + lesson),
        ...Array.from({ length: count }, (_, position) =>
          position >= available
            ? [
                cell("td", "ندارد", {
                  colSpan: 3,
                  dataset: { karnamehUnitUnavailable: "true" },
                }),
              ]
            : ["continuous", "competency", "unit-result"].map((field) =>
                cell("td", lesson + ":" + position + ":" + field, {
                  dataset: {
                    field,
                    karnamehUnit: "unit-" + position,
                    karnamehModule: "module-" + Math.floor(position / 2),
                    karnamehUnitPosition: String(position),
                    karnamehGroup: "unit-" + position,
                    karnamehGroupActive: String(position === count - 1),
                  },
                }),
              ),
        ).flat(),
      ),
  );
  return new Element(
    "section",
    { className: "karnameh-subject-section" },
    new Element(
      "header",
      { className: "karnameh-subject-header" },
      cell("h4", "دروس واحد کار"),
    ),
    new Element(
      "div",
      { className: "karnameh-sheet-scroll" },
      new Element(
        "table",
        { className, dataset: { karnamehUnitCount: String(count) } },
        header,
        new Element("tbody", {}, ...rows),
      ),
    ),
  );
}
function hierarchicalFixture(moduleSizes) {
  const groups = moduleSizes.flatMap((count, module) =>
      Array.from({ length: count }, (_, unit) => ({ module, unit })),
    ),
    section = fixture(groups.length),
    table = section.querySelector("table.karnameh-unit-competency-table");
  for (const [position, cell] of table.tHead.rows[0].cells.slice(1).entries()) {
    const { module, unit } = groups[position];
    cell.dataset.karnamehModulePosition = String(module);
    cell.dataset.karnamehUnitIndex = String(unit);
    cell.dataset.karnamehUnitPosition = String(position);
    cell.textContent =
      "پودمان " + number(module + 1) + " · واحد کار " + number(unit + 1);
  }
  for (const cell of descendants(table).filter((node) => node.dataset.field)) {
    const { module, unit } = groups[Number(cell.dataset.karnamehUnitPosition)];
    cell.dataset.karnamehModule = "module-" + module;
    cell.dataset.karnamehUnit = "module-" + module + "-unit-" + unit;
    cell.dataset.karnamehGroup = "module-" + module + "-unit-" + unit;
  }
  return section;
}
function grades(root) {
  return descendants(root)
    .filter((node) => node.dataset.field)
    .map((node) => ({
      lesson: node.parentElement.dataset.lesson,
      ...node.dataset,
      text: node.textContent,
    }))
    .sort((first, second) =>
      JSON.stringify(first).localeCompare(JSON.stringify(second)),
    );
}
function context() {
  const c = vm.createContext({ karnamehSheetNumber: number });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/printing.js"),
      "utf8",
    ),
    c,
  );
  return c;
}

for (const count of [6, 10, 11])
  test(`printing ${count} work units preserves every grade once across readable column ranges`, () => {
    const source = new Element("article", {}, fixture(count)),
      original = snapshot(source),
      copy = source.cloneNode(true),
      expected = grades(copy);
    context().prepareKarnamehUnitPrintTables(copy);
    assert.deepEqual(snapshot(source), original, "live report must not change");
    const tables = copy.querySelectorAll(
      "table.karnameh-unit-competency-table",
    );
    assert.equal(tables.length, Math.ceil(count / 5));
    assert.deepEqual(grades(copy), expected);
    for (const [index, table] of tables.entries()) {
      const start = index * 5,
        end = Math.min(start + 5, count),
        section = table.closest(".karnameh-subject-section");
      for (const node of [table, section]) {
        assert.equal(node.dataset.karnamehUnitStart, String(start + 1));
        assert.equal(node.dataset.karnamehUnitEnd, String(end));
        assert.equal(node.dataset.karnamehUnitCount, String(end - start));
      }
      assert.match(
        section.querySelector("h4").textContent,
        new RegExp("واحدهای " + number(start + 1) + " تا " + number(end)),
      );
      assert.deepEqual(
        table.tHead.rows[0].cells.slice(1).map((cell) => cell.textContent),
        Array.from(
          { length: end - start },
          (_, offset) => "واحد کار " + number(start + offset + 1),
        ),
      );
      assert.equal(table.tHead.rows[1].cells.length, (end - start) * 3);
      for (const row of table.tBodies[0].rows) {
        assert.equal(row.cells[0].textContent, "درس " + row.dataset.lesson);
        assert.equal(
          row.cells.reduce((sum, cell) => sum + cell.colSpan, 0),
          1 + (end - start) * 3,
        );
        for (const cell of row.cells.slice(1)) {
          if (cell.dataset.karnamehUnitUnavailable) {
            assert.equal(cell.colSpan, 3);
            assert.equal(cell.textContent, "ندارد");
            assert.equal(cell.dataset.field, undefined);
          } else {
            const position = Number(cell.dataset.karnamehUnitPosition);
            assert.ok(position >= start && position < end);
          }
        }
      }
    }
  });

test("printing five two-unit modules keeps each module together and retains every original pair header", () => {
  const source = new Element(
      "article",
      {},
      hierarchicalFixture([2, 2, 2, 2, 2]),
    ),
    original = snapshot(source),
    copy = source.cloneNode(true),
    expected = grades(copy),
    originalHeaders = source
      .querySelector("table.karnameh-unit-competency-table")
      .tHead.rows[0].cells.slice(1)
      .map(snapshot);
  context().prepareKarnamehUnitPrintTables(copy);
  assert.deepEqual(snapshot(source), original, "live report must not change");
  assert.deepEqual(grades(copy), expected, "every actual grade prints once");
  const tables = copy.querySelectorAll("table.karnameh-unit-competency-table"),
    expectedRanges = [
      [0, 4, 0, 1, "پودمان‌های ۱ تا ۲"],
      [4, 8, 2, 3, "پودمان‌های ۳ تا ۴"],
      [8, 10, 4, 4, "پودمان ۵"],
    ];
  assert.equal(tables.length, expectedRanges.length);
  for (const [index, table] of tables.entries()) {
    const [start, end, firstModule, lastModule, title] = expectedRanges[index],
      section = table.closest(".karnameh-subject-section");
    for (const node of [table, section]) {
      assert.equal(node.dataset.karnamehUnitStart, String(start + 1));
      assert.equal(node.dataset.karnamehUnitEnd, String(end));
      assert.equal(node.dataset.karnamehUnitCount, String(end - start));
      assert.equal(node.dataset.karnamehModuleStart, String(firstModule + 1));
      assert.equal(node.dataset.karnamehModuleEnd, String(lastModule + 1));
    }
    assert.equal(
      section.querySelector("h4").textContent,
      "دروس واحد کار · " + title,
    );
    assert.deepEqual(
      table.tHead.rows[0].cells.slice(1).map(snapshot),
      originalHeaders.slice(start, end),
    );
    assert.equal(table.tHead.rows[1].cells.length, (end - start) * 3);
    for (const row of table.tBodies[0].rows)
      assert.equal(
        row.cells.reduce((sum, cell) => sum + cell.colSpan, 0),
        1 + (end - start) * 3,
      );
  }
});

test("printing a module larger than five units advances and names its partial unit range", () => {
  const copy = new Element("article", {}, hierarchicalFixture([7, 2])),
    expected = grades(copy);
  context().prepareKarnamehUnitPrintTables(copy);
  const tables = copy.querySelectorAll("table.karnameh-unit-competency-table");
  assert.deepEqual(
    tables.map((table) => [
      table.dataset.karnamehUnitStart,
      table.dataset.karnamehUnitEnd,
      table.dataset.karnamehModuleStart,
      table.dataset.karnamehModuleEnd,
    ]),
    [
      ["1", "5", "1", "1"],
      ["6", "9", "1", "2"],
    ],
  );
  assert.deepEqual(grades(copy), expected);
  assert.equal(
    tables[0].closest(".karnameh-subject-section").querySelector("h4")
      .textContent,
    "دروس واحد کار · پودمان ۱ · واحدهای ۱ تا ۵",
  );
  assert.equal(
    tables[1].closest(".karnameh-subject-section").querySelector("h4")
      .textContent,
    "دروس واحد کار · پودمان‌های ۱ تا ۲",
  );
  for (const table of tables) {
    assert.ok(Number(table.dataset.karnamehUnitCount) <= 5);
    for (const header of table.tHead.rows[0].cells.slice(1))
      assert.match(header.textContent, /^پودمان [۱۲] · واحد کار [۱-۷]$/);
  }
});

test("print splitting handles embedded pupil reports and leaves short or old modular sheets intact", () => {
  const short = fixture(5),
    modular = fixture(10, "karnameh-modular-table"),
    embedded = new Element(
      "article",
      {},
      new Element("article", {}, fixture(10)),
      new Element("article", {}, fixture(6)),
      short,
      modular,
    ),
    unchangedShort = snapshot(short),
    unchangedModular = snapshot(modular),
    expected = grades(embedded);
  context().prepareKarnamehUnitPrintTables(embedded);
  assert.equal(
    embedded.querySelectorAll("table.karnameh-unit-competency-table").length,
    5,
  );
  assert.deepEqual(grades(embedded), expected);
  assert.deepEqual(snapshot(short), unchangedShort);
  assert.deepEqual(snapshot(modular), unchangedModular);
});
