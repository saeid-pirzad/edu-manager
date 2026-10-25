"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/scripts/csv-parser.js"), "utf8"), context);
const parse = text => JSON.parse(JSON.stringify(context.parseCSV(text)));

test("CSV preserves Persian names, BOM, leading zeros and CRLF", () => {
  assert.deepEqual(parse('\uFEFFنام,کد\r\nعلی,001\r\n'), [["نام", "کد"], ["علی", "001"]]);
});
test("CSV supports quoted delimiters, multiline fields and escaped quotes", () => {
  assert.deepEqual(parse('"a,b","line1\nline2","a""b"'), [["a,b", "line1\nline2", 'a"b']]);
});
test("CSV supports semicolon rows and ignores blank records", () => {
  assert.deepEqual(parse('name;code\n\nAli;001\n'), [["name", "code"], ["Ali", "001"]]);
});
test("CSV rejects malformed quoting", () => {
  for (const value of ['"unfinished', 'a"b,c', '"a"x,b']) assert.throws(() => parse(value));
});
test("semicolon detection ignores commas inside quoted fields", () => {
  assert.deepEqual(parse('"نام, نام خانوادگی";کد\nعلی;001'), [["نام, نام خانوادگی", "کد"], ["علی", "001"]]);
  assert.deepEqual(parse('\n"a,\nb";code\nc;001'), [["a,\nb", "code"], ["c", "001"]]);
});
