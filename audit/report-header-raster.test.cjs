"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectRepeatedTableHeaders } = require("./report-header-raster.cjs");

const band = (start, end) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index);
const inspect = (horizontalRules, topMargin = 86) =>
  detectRepeatedTableHeaders({ horizontalRules, topMargin });

test("native continuation pages with two dark filled header rows are detected", () => {
  const observed = inspect([...band(86, 151), ...band(154, 215)]);
  assert.equal(observed.twoHeaderRows, true);
  assert.equal(observed.method, "filled");
  assert.deepEqual(observed.headerBands, [
    { start: 86, end: 151 },
    { start: 154, end: 215 },
  ]);
});

test("two light header rows still require their three thin rules", () => {
  const observed = inspect([86, 87, 154, 155, 222, 223]);
  assert.equal(observed.twoHeaderRows, true);
  assert.equal(observed.method, "outlined");
  assert.deepEqual(observed.rules, [86, 154, 222]);
});

test("CI-scale raster preserves a one-pixel separator between filled header rows", () => {
  // Actual native raster at 1684px: the separator occupies scanline 122.
  const observed = inspect([...band(69, 121), ...band(123, 172)], 69);
  assert.equal(observed.twoHeaderRows, true);
  assert.equal(observed.method, "filled");
  assert.deepEqual(observed.headerBands, [
    { start: 69, end: 121 },
    { start: 123, end: 172 },
  ]);
  // Without that separator, a single solid block is not proof of two rows.
  assert.equal(inspect(band(69, 172), 69).twoHeaderRows, false);
});

test("a single filled header row cannot satisfy the two-row assertion", () => {
  assert.equal(inspect(band(86, 151)).twoHeaderRows, false);
  assert.equal(inspect(band(86, 215)).twoHeaderRows, false);
});

test("a single light header row cannot satisfy the two-row assertion", () => {
  assert.equal(inspect([86, 87, 154, 155]).twoHeaderRows, false);
});

test("two dark blocks separated by body content are not adjacent header rows", () => {
  assert.equal(
    inspect([...band(86, 151), ...band(300, 361)]).twoHeaderRows,
    false,
  );
});

test("body table bands do not masquerade as repeated headers at the page top", () => {
  const rows = [...band(497, 562), ...band(565, 626)];
  assert.equal(inspect(rows, 86).twoHeaderRows, false);
  assert.equal(inspect([497, 565, 633], 86).twoHeaderRows, false);
});

test("undersized ink bands and oversized header rows are rejected", () => {
  assert.equal(
    inspect([...band(86, 100), ...band(103, 117)]).twoHeaderRows,
    false,
  );
  assert.equal(
    inspect([...band(86, 186), ...band(189, 289)]).twoHeaderRows,
    false,
  );
  assert.equal(inspect([86, 100, 114]).twoHeaderRows, false);
  assert.equal(inspect([86, 200, 314]).twoHeaderRows, false);
});

test("later tables do not affect detection of the actual top two rows", () => {
  assert.equal(
    inspect([
      ...band(86, 151),
      ...band(154, 215),
      ...band(497, 562),
      ...band(565, 626),
    ]).twoHeaderRows,
    true,
  );
  assert.equal(inspect([]).twoHeaderRows, false);
});
