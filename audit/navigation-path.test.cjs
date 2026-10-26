"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const frames = [];
  const context = vm.createContext({
    state: {},
    render() {
      frames.push({ ...context.state });
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/ui/navigation.js"),
      "utf8",
    ),
    context,
  );
  return { context, frames };
}
test("selection follows school -> its classes -> selected class lessons -> lesson sessions", () => {
  const { context, frames } = fixture();
  context.goSchools();
  context.goSchool("school-a");
  context.goClass("class-a");
  context.goLesson("lesson-a");
  assert.equal(frames[1].view, "school");
  assert.equal(frames[1].schoolId, "school-a");
  assert.equal(frames[1].classId, null);
  assert.equal(frames[2].view, "class");
  assert.equal(frames[2].schoolId, "school-a");
  assert.equal(frames[2].classId, "class-a");
  assert.equal(frames[2].tab, "lessons");
  assert.equal(frames[3].view, "lesson");
  assert.equal(frames[3].lessonId, "lesson-a");
  assert.equal(frames[3].tab, "sessions");
});
test("student tab is opt-in and returning or reentering a class restores its lessons", () => {
  const { context } = fixture();
  context.goSchool("school-a");
  context.goClass("class-a");
  context.setTab("students");
  assert.equal(context.state.tab, "students");
  context.goLesson("lesson-a");
  context.backToClass();
  assert.equal(context.state.tab, "lessons");
  assert.equal(context.state.lessonId, null);
  context.setTab("students");
  context.goClass("class-b");
  assert.equal(context.state.classId, "class-b");
  assert.equal(context.state.tab, "lessons");
  context.goSchool("school-b");
  assert.equal(context.state.classId, null);
  assert.equal(context.state.lessonId, null);
});
