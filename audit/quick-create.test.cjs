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

test("school creation has a scoped compact panel and a single plain heading without changing classroom creation", () => {
  const school = context.renderEntityQuickCreate("school", false),
    classroom = context.renderEntityQuickCreate("class", false);
  assert.match(school, /class="[^"]*\bschool-create\b[^"]*"/);
  assert.doesNotMatch(classroom, /\bschool-create\b/);
  assert.match(classroom, /class="[^"]*\bclass-create\b[^"]*"/);
  assert.doesNotMatch(school, /\bclass-create\b/);
  assert.doesNotMatch(
    school.match(/<summary>[\s\S]*?<\/summary>/)[0],
    /<small>/,
  );
  assert.match(classroom, /نام کلاس؛ هنرجویان و درس‌ها در مرحله بعد/);
  assert.match(school, /required maxlength="500" enterkeyhint="done"/);
});

test("lesson and student create panels have one submit and a non-action heading", () => {
  context.esc = String;
  context.EduV24 = {
    course: {
      renderCreate: () =>
        '<form><div class="create-panel-footer"><button type="submit">ثبت درس</button></div></form>',
    },
  };
  context.getSortedStudents = (classroom) => classroom.students;
  context.buildArchiveHtml = () => "";
  assert.doesNotMatch(
    context
      .renderLessonsTab({ id: "test", lessons: [] })
      .match(/<details[^>]*>/)[0],
    /\sopen(?:\s|>)/,
  );
  const studentForm = context.renderStudentsTab({ id: "test", students: [] });
  const studentHeading = studentForm.match(/<summary>[\s\S]*?<\/summary>/)[0];
  assert.match(studentHeading, /هنرجوی جدید/);
  assert.doesNotMatch(studentHeading, /<small>|نام کامل و کد اختیاری/);
  assert.doesNotMatch(studentForm.match(/<details[^>]*>/)[0], /\sopen(?:\s|>)/);
  assert.match(
    studentForm,
    /class="student-field-heading">کد دانش‌آموزی <span class="student-field-optional">\(اختیاری\)<\/span><\/span>/,
  );
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
test("all directory renderers place their list before creation even when empty", () => {
  context.headerHtml = () => "";
  context.breadcrumbHtml = () => "";
  context.renderTodayAgenda = () => "";
  context.dashboardDirectory = () =>
    '<section class="dashboard-directory"></section>';
  context.db = { schools: [] };
  context.state = { schoolId: "school" };
  context.getSchool = () => ({ id: "school", name: "مدرسه", classes: [] });
  for (const [html, marker] of [
    [context.renderSchools(), 'class="dashboard-directory"'],
    [context.renderSchool(), 'class="dashboard-directory"'],
    [
      context.renderLessonsTab({ id: "test", lessons: [] }),
      'class="card class-lessons"',
    ],
    [
      context.renderStudentsTab({ id: "test", students: [] }),
      'class="card student-directory"',
    ],
  ]) {
    assert.ok(html.indexOf(marker) >= 0);
    assert.ok(html.indexOf(marker) < html.indexOf('<details class="card'));
  }
});

test("compact class tabs preserve labels, actions and selection with an optional modifier", () => {
  context.esc = String;
  context.state = { tab: "lessons" };
  const items = [
    {
      tab: "lessons",
      action: "ui-school-class:10",
      icon: "book",
      title: "دروس",
    },
    {
      tab: "students",
      action: "ui-school-class:11",
      icon: "users",
      title: "دانش‌آموزان",
    },
  ];
  const compact = context.classroomTabsHtml("بخش‌های کلاس", items, true),
    original = context.classroomTabsHtml("بخش‌های درس", items);
  assert.match(compact, /classroom-tabs-compact/);
  assert.doesNotMatch(original, /classroom-tabs-compact/);
  assert.equal((compact.match(/<button/g) || []).length, 2);
  assert.equal((compact.match(/aria-pressed="true"/g) || []).length, 1);
  for (const item of items) {
    assert.ok(compact.includes(item.title));
    assert.ok(compact.includes('data-legacy-click="' + item.action + '"'));
  }
});

test("compact lesson tabs retain attendance detail and original actions", () => {
  context.esc = String;
  context.state = { tab: "sessions" };
  const html = context.classroomTabsHtml(
    "بخش‌های درس",
    [
      {
        tab: "sessions",
        action: "ui-lesson:4",
        icon: "attendance",
        title: "جلسات",
        detail: "و حضور و غیاب",
      },
      { tab: "grades", action: "ui-lesson:5", icon: "grades", title: "نمرات" },
    ],
    true,
  );
  assert.match(html, /classroom-tabs-compact/);
  assert.ok(html.includes("و حضور و غیاب"));
  assert.ok(html.includes('data-legacy-click="ui-lesson:4"'));
  assert.ok(html.includes('data-legacy-click="ui-lesson:5"'));
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((html.match(/<button/g) || []).length, 2);
});
