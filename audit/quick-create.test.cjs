"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../src/core/icons.js"), "utf8"),
  context,
);
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/legacy/ui/school-class.js"),
    "utf8",
  ),
  context,
);
test("empty directories expose the first setup step; populated directories keep creation secondary", () => {
  assert.match(
    context.renderEntityQuickCreate("school", true),
    /<details[^>]+ open>/,
  );
  assert.doesNotMatch(
    context.renderEntityQuickCreate("school", false),
    /<details[^>]+ open>/,
  );
  assert.match(context.renderEntityQuickCreate("class", true), /کلاس/);
});
test("progressive create forms preserve explicit action tokens, stable fields and accessible labels", () => {
  for (const [kind, token] of [
    ["school", "1"],
    ["class", "5"],
  ]) {
    const html = context.renderEntityQuickCreate(kind, false);
    assert.match(
      html,
      new RegExp('data-legacy-submit="ui-school-class:' + token + '"'),
    );
    assert.match(html, new RegExp('data-entity-create="' + kind + '"'));
    assert.match(
      html,
      new RegExp('<label[^>]*>[^<]+<input id="' + kind + 'CreateName"'),
    );
    assert.match(
      html,
      new RegExp('aria-describedby="' + kind + 'CreateError"'),
    );
    assert.match(html, /type="submit" data-mutating="1"/);
    assert.match(html, /role="alert"/);
    assert.equal((html.match(/type="submit"/g) || []).length, 1);
    assert.doesNotMatch(
      html.match(/<summary>[\s\S]*?<\/summary>/)[0],
      /ثبت|افزودن/,
    );
  }
});

test("lesson and student create panels have one submit and a non-action heading", () => {
  context.esc = String;
  context.getSortedStudents = (classroom) => classroom.students;
  context.buildArchiveHtml = () => "";
  for (const html of [
    context.renderLessonsTab({ id: "test", lessons: [] }),
    context.renderStudentsTab({ id: "test", students: [] }),
  ]) {
    assert.equal((html.match(/type="submit"/g) || []).length, 1);
    assert.match(html, /create-panel-footer/);
    assert.doesNotMatch(
      html.match(/<summary>[\s\S]*?<\/summary>/)[0],
      /ثبت|افزودن/,
    );
  }
});
