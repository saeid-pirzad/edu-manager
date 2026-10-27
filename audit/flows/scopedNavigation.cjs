"use strict";
module.exports = async function scopedNavigation() {
  const cases = [],
    before = JSON.stringify(db);
  const add = (id, name, pass) =>
    cases.push({ id, name, pass: !!pass, observed: {} });
  const pause = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  const school = db.schools[0],
    classroom = school.classes[0];
  closeModal();
  goSchools();
  await pause();
  add(
    "SCOPE01",
    "schools contain school CRUD and child navigation, not report or schedule shortcuts",
    !!document.querySelector('[data-entity-create="school"]') &&
      !document.querySelector(
        '.workflow-welcome button,.dashboard-directory [data-legacy-click="ui-dashboard:1"]',
      ) &&
      !!document.querySelector('[data-legacy-click="dashboard-delete"]'),
  );
  goSchool(school.id);
  await pause();
  add(
    "CRUMB01",
    "class directory title is classes, not the school name, with no parent-school edit control",
    document.querySelector(".view-heading h2")?.textContent === "کلاس‌ها" &&
      !document.querySelector('[data-legacy-click="ui-school-class:4"]') &&
      document.querySelector('.breadcrumb [aria-current="page"]')
        ?.textContent === "کلاس‌ها",
  );
  add(
    "SCOPE02",
    "class directory is scoped to the selected school without report actions",
    !!document.querySelector('[data-entity-create="class"]') &&
      !document.querySelector(
        '[data-legacy-click="ui-school-class:3"],.dashboard-directory [data-legacy-click="ui-dashboard:1"]',
      ),
  );
  goClass(classroom.id);
  await pause();
  add(
    "CRUMB02",
    "lesson directory title is lessons, not the parent class, and parent editing is absent",
    document.querySelector(".view-heading h2")?.textContent === "درس‌ها" &&
      !document.querySelector(".entity-context-edit") &&
      document.querySelector('.breadcrumb [aria-current="page"]')
        ?.textContent === "درس‌ها",
  );
  add(
    "SCOPE03",
    "class has exactly lesson and student management tabs without report or schedule actions",
    document.querySelectorAll("#app .tabs > button").length === 2 &&
      !document.querySelector(".class-context-actions,.student-report") &&
      state.tab === "lessons" &&
      !!document.querySelector(".class-lessons"),
  );
  setTab("students");
  await pause();
  add(
    "SCOPE09",
    "student CRUD remains explicitly accessible from its own class tab",
    !!document.querySelector('[data-entity-create="student"]') &&
      !!document.querySelector(".student-directory"),
  );
  setTab("lessons");
  await pause();
  add(
    "SCOPE04",
    "lesson directory contains lesson CRUD rather than classroom score entry",
    !!document.querySelector(".lesson-create #courseEditor") &&
      !!document.querySelector(".lesson-enter") &&
      !!document.querySelector(".lesson-config") &&
      !document.querySelector(
        '.lesson-schedule,[data-legacy-click="ui-school-class:23"]',
      ),
  );
  goLesson(classroom.lessons[0].id);
  await pause();
  add(
    "CRUMB03",
    "lesson breadcrumb has one isolated current lesson and correct class return",
    document.querySelectorAll('.breadcrumb [aria-current="page"]').length ===
      1 &&
      document.querySelector('.breadcrumb [aria-current="page"]')
        .textContent === classroom.lessons[0].name &&
      document.querySelectorAll(".breadcrumb bdi").length === 4,
  );
  document
    .querySelector('.breadcrumb [data-legacy-click="ui-lesson:2"]')
    .click();
  await pause();
  add(
    "CRUMB04",
    "breadcrumb returns to the selected class lesson list",
    state.view === "class" &&
      state.classId === classroom.id &&
      state.tab === "lessons",
  );
  goLesson(classroom.lessons[0].id);
  await pause();
  add(
    "SCOPE05",
    "lesson opens directly into sessions and attendance, retaining grade operations",
    state.view === "lesson" &&
      state.tab === "sessions" &&
      !!document.querySelector(".session-create-form") &&
      !!document.querySelector('[data-legacy-click="ui-lesson:5"]'),
  );
  document.querySelector('[data-header-action="reports"]').click();
  await pause();
  const karnameh = document.querySelector(
    '.report-navigation [data-legacy-click-arg2="karnameh"]',
  );
  add(
    "SCOPE06",
    "reports and grade cards have their own dedicated primary navigation",
    state.view === "reports" &&
      !!karnameh &&
      !!document.querySelector(
        '.report-navigation [data-legacy-click-arg2="daily"]',
      ),
  );
  karnameh.click();
  await pause();
  add(
    "SCOPE07",
    "grade cards remain reachable and can select school, class and student in the report area",
    state.reportTab === "karnameh" &&
      !!document.querySelector('[data-legacy-change="reports-student:0"]') &&
      !!document.querySelector('[data-legacy-change="reports-student:1"]') &&
      !!document.querySelector('[data-legacy-change="reports-student:2"]'),
  );
  add(
    "SCOPE08",
    "navigation reorganization does not alter stored classroom data",
    JSON.stringify(db) === before,
  );
  closeModal();
  goSchools();
  return cases;
};
