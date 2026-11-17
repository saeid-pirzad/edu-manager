"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { main } = require("./data-integrity.cjs");
const { seedReminders } = require("./attendance-reminders-browser.cjs");

async function annualUnitFlow() {
  const cases = [];
  const check = (id, pass, observed = {}) =>
    cases.push({
      id: "MODULAR_UNIT_ANNUAL_" + id,
      name: id,
      pass: !!pass,
      observed,
    });
  const year = "1447-1448",
    nextYear = "1448-1449";
  const ids = {
    school: "annual-unit-school",
    classroom: "annual-unit-class",
    lesson: "annual-unit-lesson",
    student: "annual-unit-student",
    pod: "annual-unit-pod",
    first: "annual-unit-one",
    second: "annual-unit-two",
  };
  const lessonIn = (snapshot, workspace) =>
    snapshot.stores.records
      .find(
        (row) =>
          row.workspace === workspace &&
          row.logical === "class:" + ids.classroom,
      )
      ?.value.lessons.find((lesson) => lesson.id === ids.lesson);
  const scoreIn = (snapshot, workspace, unitId) =>
    lessonIn(snapshot, workspace)?.poudmans[0].units.find(
      (unit) => unit.id === unitId,
    )?.competencyScores[ids.student];
  const frozenIn = (snapshot, workspace) =>
    JSON.stringify(
      snapshot.stores.reports.filter((row) => row.workspace === workspace),
    );
  const create = async (academicYear, term) => {
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = academicYear;
    document.getElementById("periodTerm").value = term;
    await EduV24.test.createLegacyPeriod();
    return EduV24.getReportContext().id;
  };
  const openGrades = () => {
    closeModal();
    goSchool(ids.school);
    goClass(ids.classroom);
    goLesson(ids.lesson);
    setTab("grades");
  };
  const field = (unit, component) =>
    document.querySelector(
      '[data-grade="1"][data-kind="unit"][data-unit="' +
        unit +
        '"][data-student="' +
        ids.student +
        '"][data-field="' +
        component +
        '"]',
    );
  try {
    const first = await create(year, "اول");
    Object.assign(
      db,
      EduV24.normalizeDB({
        ...db,
        settings: { ...db.settings, password: "" },
        sessions: [],
        masterSchedule: {},
        schools: [
          {
            id: ids.school,
            name: "مدرسه واحد کار سالانه",
            classes: [
              {
                id: ids.classroom,
                name: "کلاس واحد کار سالانه",
                students: [
                  {
                    id: ids.student,
                    name: "هنرجوی واحد کار سالانه",
                    code: "U001",
                  },
                ],
                archivedStudents: [],
                lessons: [
                  {
                    id: ids.lesson,
                    name: "واحد کار سالانه مستقل",
                    gradeMode: "standard",
                    gradingPolicy: {
                      ...EduPolicy.defaults("modular", year),
                      version: 2,
                      modularScope: "unit",
                      unitCount: 2,
                      confirmed: true,
                      code: "ANNUAL-UNIT",
                    },
                    kardaneshScores: {},
                    poudmans: [
                      {
                        id: ids.pod,
                        name: "پودمان مستقل",
                        podScores: {},
                        units: [
                          {
                            id: ids.first,
                            name: "واحد کار اول",
                            unitScores: {},
                            competencyScores: { [ids.student]: { m: 0, c: 3 } },
                          },
                          {
                            id: ids.second,
                            name: "واحد کار دوم",
                            unitScores: {},
                            competencyScores: {},
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    await saveDB({ action: "آماده‌سازی واحد کار سالانه" });
    await EduV24.finalizePeriod();
    let snapshot = await EduV24.snapshotInstallation();
    const frozenFirst = frozenIn(snapshot, first);
    check(
      "FIRST_TERM_INCOMPLETE_CLOSE",
      EduV24.getReportContext().closed &&
        frozenFirst !== "[]" &&
        scoreIn(snapshot, first, ids.first)?.m === 0 &&
        !scoreIn(snapshot, first, ids.second),
    );
    if (!EduV24.getReportContext().closed)
      throw Error(
        "First term could not close with its annual work unit incomplete",
      );
    const second = await create(year, "دوم");
    snapshot = await EduV24.snapshotInstallation();
    const continued = lessonIn(snapshot, second);
    check(
      "SECOND_TERM_CONTINUATION",
      first !== second &&
        continued?.id === ids.lesson &&
        continued?.poudmans[0].id === ids.pod &&
        continued?.poudmans[0].units.map((unit) => unit.id).join() ===
          [ids.first, ids.second].join() &&
        scoreIn(snapshot, second, ids.first)?.m === 0 &&
        scoreIn(snapshot, second, ids.first)?.c === 3 &&
        !scoreIn(snapshot, second, ids.second),
      {
        first: scoreIn(snapshot, second, ids.first),
        units: continued?.poudmans[0].units.map((unit) => unit.id),
      },
    );
    check(
      "NO_LEGACY_GRADE_CONTAMINATION",
      [first, second].every((id) => {
        const lesson = lessonIn(snapshot, id);
        return (
          Object.keys(lesson.kardaneshScores).length === 0 &&
          Object.keys(lesson.poudmans[0].podScores).length === 0 &&
          lesson.poudmans[0].units.every(
            (unit) => Object.keys(unit.unitScores).length === 0,
          )
        );
      }),
    );
    openGrades();
    const picker = document.querySelector("[data-unit-picker]:not([hidden])");
    picker.value = ids.second;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    for (const [component, value] of [
      ["m", "۴"],
      ["c", "۲"],
    ]) {
      const input = field(ids.second, component);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await EduV24.flushDrafts({ strict: true });
    snapshot = await EduV24.snapshotInstallation();
    check(
      "UI_WRITES_BOTH_TERM_RECORDS",
      [first, second].every(
        (id) =>
          scoreIn(snapshot, id, ids.second)?.m === 4 &&
          scoreIn(snapshot, id, ids.second)?.c === 2 &&
          scoreIn(snapshot, id, ids.first)?.m === 0,
      ) &&
        JSON.stringify(lessonIn(snapshot, first).poudmans) ===
          JSON.stringify(lessonIn(snapshot, second).poudmans),
      {
        first: scoreIn(snapshot, first, ids.second),
        second: scoreIn(snapshot, second, ids.second),
      },
    );
    check(
      "FIRST_FROZEN_REPORT_UNCHANGED",
      frozenIn(snapshot, first) === frozenFirst &&
        snapshot.stores.catalog.find((row) => row.id === first).closed,
    );
    await EduV24.finalizePeriod();
    snapshot = await EduV24.snapshotInstallation();
    const completed = EduReportGrades.modular(
      lessonIn(snapshot, second),
      ids.student,
    );
    check(
      "SECOND_TERM_FINALIZES_WITHOUT_COURSE_TOTAL",
      EduV24.getReportContext().closed &&
        completed.complete &&
        completed.final == null &&
        completed.provisionalAverage == null &&
        frozenIn(snapshot, first) === frozenFirst,
      {
        closed: EduV24.getReportContext().closed,
        final: completed.final,
        mean: completed.provisionalAverage,
        complete: completed.complete,
      },
    );
    const frozenSecond = frozenIn(snapshot, second),
      backup = snapshot;
    const valid = EduV24.validateFullBackup(backup);
    check(
      "UNIT_BACKUP_VALIDATION",
      valid.some((part) => part.period.id === first) &&
        valid.some((part) => part.period.id === second),
    );
    closeModal();
    EduV24.previewFullBackup(backup);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
    openGrades();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "RESTORE_PRESERVES_INPUTS_AND_FROZEN_REPORTS",
      field(ids.first, "m")?.value === "0" &&
        field(ids.first, "c")?.value === "3" &&
        field(ids.second, "m")?.value === "4" &&
        field(ids.second, "c")?.value === "2" &&
        frozenIn(snapshot, first) === frozenFirst &&
        frozenIn(snapshot, second) === frozenSecond &&
        [first, second].every(
          (id) => snapshot.stores.catalog.find((row) => row.id === id).closed,
        ),
    );
    const next = await create(nextYear, "اول");
    snapshot = await EduV24.snapshotInstallation();
    const fresh = lessonIn(snapshot, next);
    check(
      "NEW_YEAR_CLEARS_ONLY_NEW_YEAR_GRADES",
      EduV24.getReportContext().year === nextYear &&
        fresh?.gradingPolicy.modularScope === "unit" &&
        fresh?.poudmans.length === 1 &&
        fresh.poudmans[0].units.length === 2 &&
        fresh.poudmans[0].units.every(
          (unit) => Object.keys(unit.competencyScores || {}).length === 0,
        ) &&
        [first, second].every(
          (id) =>
            scoreIn(snapshot, id, ids.first)?.m === 0 &&
            scoreIn(snapshot, id, ids.second)?.m === 4,
        ) &&
        frozenIn(snapshot, first) === frozenFirst &&
        frozenIn(snapshot, second) === frozenSecond,
    );
  } catch (error) {
    check("LIFECYCLE_COMPLETED", false, {
      error: error.stack || error.message,
    });
  }
  return cases;
}

async function run({ cdp, evaluate, cases, delay }) {
  const page = (fn, arg) =>
    evaluate("(" + fn.toString() + ")(" + JSON.stringify(arg ?? null) + ")");
  const check = (id, pass, observed) =>
    cases.push({ id: "MODULAR_UNIT_" + id, name: id, pass: !!pass, observed });
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  try {
    await evaluate("(" + seedReminders.toString() + ")()");
    await page(async () => {
      closeModal();
      Object.assign(state, {
        view: "class",
        schoolId: "reminder-school",
        classId: "reminder-class",
        tab: "lessons",
      });
      render();
      await EduV24.course.open();
      const method = document.getElementById("course_method");
      method.value = "modular";
      method.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const defaults = await page(() => ({
      scope: document.getElementById("course_modularScope").value,
      units: document.getElementById("course_unitCount").value,
      label: document.getElementById("course_moduleMin").closest("label")
        .textContent,
    }));
    check(
      "NEW_COURSE_DEFAULTS",
      defaults.scope === "unit" &&
        defaults.units === "2" &&
        defaults.label.includes("واحد کار"),
      defaults,
    );
    const formStructure = await page(() => {
      const row = document.querySelector("#courseEditor .course-method-fields");
      const controls = ["subjectType", "method", "modularScope"].map((id) =>
        document.getElementById("course_" + id),
      );
      return {
        sameRow: controls.every(
          (control) => control.closest("label").parentElement === row,
        ),
        noNames: !document.querySelector(
          "#courseEditor #courseNames,#courseEditor #courseStructure",
        ),
        noHint: !document.getElementById("courseScopeHint"),
        scopeVisible: controls[2].getClientRects().length > 0,
      };
    });
    check(
      "COMPACT_NEW_FORM",
      Object.values(formStructure).every(Boolean),
      formStructure,
    );
    const scopeVisibility = await page(() => {
      const subject = document.getElementById("course_subjectType");
      const method = document.getElementById("course_method");
      const scope = document.getElementById("course_modularScope");
      const change = (control, value) => {
        control.value = value;
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };
      change(method, "dual");
      const dualHidden = scope.getClientRects().length === 0;
      change(subject, "general");
      const generalHidden =
        scope.getClientRects().length === 0 &&
        method.getClientRects().length === 0;
      change(subject, "vocational");
      change(method, "modular");
      return {
        dualHidden,
        generalHidden,
        modularVisible: scope.getClientRects().length > 0,
      };
    });
    check(
      "SCOPE_METHOD_VISIBILITY",
      Object.values(scopeVisibility).every(Boolean),
      scopeVisibility,
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      await delay(80);
      const layout = await page(() => {
        const form = document.getElementById("courseEditor");
        const row = form.querySelector(".course-method-fields");
        const bounds = row.getBoundingClientRect();
        const columns =
          getComputedStyle(row).gridTemplateColumns.split(/\s+/).length;
        const labels = [...row.children].filter(
          (label) => label.getClientRects().length > 0,
        );
        return {
          rowFits: row.scrollWidth <= row.clientWidth + 1,
          formFits: form.scrollWidth <= form.clientWidth + 1,
          controlsFit: labels.every((label) => {
            const field = label.querySelector("select");
            const box = field.getBoundingClientRect();
            return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
          }),
          desktopColumns: bounds.width < 600 || columns === 3,
          sameDesktopLine:
            bounds.width < 600 ||
            labels.every(
              (label) =>
                Math.abs(
                  label.getBoundingClientRect().top -
                    labels[0].getBoundingClientRect().top,
                ) <= 1,
            ),
          geometry: { rowWidth: bounds.width, columns },
        };
      });
      check(
        "FORM_LAYOUT_" + width,
        layout.rowFits &&
          layout.formFits &&
          layout.controlsFit &&
          layout.desktopColumns &&
          layout.sameDesktopLine,
        layout,
      );
    }
    await cdp("Emulation.clearDeviceMetricsOverride");
    const lessonId = await page(async () => {
      document.getElementById("course_name").value = "پودمانی واحد کار آزمایشی";
      document.getElementById("course_podCount").value = "2";
      await EduV24.course.save();
      const lesson = db.schools[0].classes[0].lessons.find(
        (item) => item.name === "پودمانی واحد کار آزمایشی",
      );
      if (!lesson) throw Error("Unit-based course was not saved");
      globalThis.__modularUnitLesson = lesson.id;
      return lesson.id;
    });
    const saved = await page((id) => {
      const lesson = db.schools[0].classes[0].lessons.find((l) => l.id === id);
      return {
        scope: lesson.gradingPolicy.modularScope,
        version: lesson.gradingPolicy.version,
        pods: lesson.poudmans.length,
        units: lesson.poudmans.map((pod) => pod.units.length),
      };
    }, lessonId);
    check(
      "NEW_COURSE_STRUCTURE",
      saved.scope === "unit" &&
        saved.version === 2 &&
        saved.pods === 2 &&
        saved.units.every((count) => count === 2),
      saved,
    );
    await page((id) => {
      Object.assign(state, { view: "lesson", lessonId: id, tab: "grades" });
      render();
    }, lessonId);
    const initial = await page(() => {
      const root = document.querySelector(".unit-gradebook");
      const fields = [...root.querySelectorAll("[data-grade]")].filter(
        (field) => !field.closest("[hidden]"),
      );
      return {
        modulePicker: !!root.querySelector("[data-module-picker]"),
        unitPicker: root.querySelectorAll("[data-unit-picker]:not([hidden])")
          .length,
        fields: fields.map((field) => field.dataset.kind),
        aggregates: root.querySelectorAll(
          "[data-pod-final],[data-course-final],[data-course-mean]",
        ).length,
      };
    });
    check(
      "UNIT_GRADEBOOK",
      initial.modulePicker &&
        initial.unitPicker === 1 &&
        initial.fields.length === 4 &&
        initial.fields.every((kind) => kind === "unit") &&
        initial.aggregates === 0,
      initial,
    );
    const graded = await page(async () => {
      const root = document.querySelector(".unit-gradebook");
      const row = [...root.querySelectorAll(".assessment-student")].find(
        (item) => !item.closest("[hidden]"),
      );
      for (const [field, value] of [
        ["m", "4.5"],
        ["c", "3"],
      ]) {
        const input = row.querySelector('[data-field="' + field + '"]');
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await EduV24.test.settle();
      const lesson = db.schools[0].classes[0].lessons.find(
        (item) => item.id === globalThis.__modularUnitLesson,
      );
      return {
        score:
          lesson.poudmans[0].units[0].competencyScores["reminder-student-a"],
        other: lesson.poudmans[0].units[1].competencyScores,
        pod: lesson.poudmans[0].podScores,
        result: row.querySelector("[data-unit-final]").textContent,
      };
    });
    check(
      "INDEPENDENT_UNIT_SCORES",
      graded.score?.m === 4.5 &&
        graded.score?.c === 3 &&
        Object.keys(graded.other || {}).length === 0 &&
        Object.keys(graded.pod || {}).length === 0 &&
        /19[.٫]5/.test(graded.result),
      graded,
    );
    const switchUnit = await page(() => {
      const root = document.querySelector(".unit-gradebook");
      const picker = root.querySelector("[data-unit-picker]:not([hidden])");
      picker.selectedIndex = 1;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
      const fields = [...root.querySelectorAll("[data-grade]")].filter(
        (field) => !field.closest("[hidden]"),
      );
      const search = root.querySelector("[data-assessment-search]");
      search.value = "هنرجوی آزمایشی دوم";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        fields: fields.length,
        empty: fields.every((field) => field.value === ""),
        visibleStudents: [...root.querySelectorAll(".assessment-student")]
          .filter((row) => !row.closest("[hidden]"))
          .map((row) => row.dataset.assessmentName),
      };
    });
    check(
      "UNIT_SELECTION_AND_SEARCH",
      switchUnit.fields === 4 &&
        switchUnit.empty &&
        switchUnit.visibleStudents.length === 1 &&
        switchUnit.visibleStudents[0] === "هنرجوی آزمایشی دوم",
      switchUnit,
    );
    const switchModule = await page(() => {
      const root = document.querySelector(".unit-gradebook");
      const picker = root.querySelector("[data-module-picker]");
      picker.selectedIndex = 1;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        activeModule: root.querySelector("[data-module-panel]:not([hidden])")
          .dataset.modulePanel,
        pickerModule: root.querySelector("[data-unit-picker]:not([hidden])")
          .dataset.unitModule,
        search: root.querySelector("[data-assessment-search]").value,
        students: [...root.querySelectorAll(".assessment-student")].filter(
          (row) => !row.closest("[hidden]"),
        ).length,
      };
    });
    check(
      "MODULE_SWITCH",
      switchModule.activeModule === switchModule.pickerModule &&
        switchModule.search === "" &&
        switchModule.students === 2,
      switchModule,
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      await delay(80);
      const layout = await page(() => {
        const root = document.querySelector(".unit-gradebook");
        const visible = [...root.querySelectorAll("input,select")].filter(
          (field) => !field.closest("[hidden]"),
        );
        return {
          root: root.scrollWidth <= root.clientWidth + 1,
          controls: visible.every((field) => {
            const box = field.getBoundingClientRect();
            const bounds = root.getBoundingClientRect();
            return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
          }),
          rows: [...root.querySelectorAll(".assessment-student")]
            .filter((row) => !row.closest("[hidden]"))
            .every((row) => row.scrollWidth <= row.clientWidth + 1),
        };
      });
      check("LAYOUT_" + width, Object.values(layout).every(Boolean), layout);
      if (width === 320 || width === 390) {
        const shot = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        const directory = path.join(__dirname, "../.cache/modular-unit");
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
          path.join(directory, "gradebook-" + width + ".png"),
          Buffer.from(shot.data, "base64"),
        );
      }
    }
    const report = await page((id) => {
      const classroom = db.schools[0].classes[0];
      const lesson = classroom.lessons.find((l) => l.id === id);
      const host = document.createElement("div");
      host.innerHTML = EduV24.course.table(classroom, lesson);
      return {
        units: host.querySelectorAll("[data-unit-final]").length,
        aggregates: host.querySelectorAll(
          "[data-pod-final],[data-course-final],[data-course-mean]",
        ).length,
        headings: host.querySelectorAll(".unit-report-module h5").length,
      };
    }, lessonId);
    check(
      "READONLY_REPORT",
      report.units === 8 && report.aggregates === 0 && report.headings === 4,
      report,
    );
    await page(async (id) => {
      await EduV24.course.open(id);
      document.querySelector("[data-record-enable-edit]").click();
    }, lessonId);
    const locked = await page(() => ({
      scope: document
        .getElementById("course_modularScope")
        .matches(":disabled"),
      structure: document
        .getElementById("course_unitCount")
        .matches(":disabled"),
      noNames: !document.querySelector(
        "#courseEditor #courseNames,#courseEditor #courseStructure",
      ),
      noHint: !document.getElementById("courseScopeHint"),
    }));
    check("SCORED_COURSE_LOCK", Object.values(locked).every(Boolean), locked);
    const explicitNames = await page(async (id) => {
      await EduV24.course.openNames(id);
      const section = document.querySelector("#courseEditor #courseNames");
      return {
        visible: !!section && !section.hidden && section.open,
        structure: !!section?.querySelector("#courseStructure"),
        pods: section?.querySelectorAll('input[id^="course_pod_"]').length,
        units: section?.querySelectorAll('input[id^="course_unit_"]').length,
        noHint: !document.getElementById("courseScopeHint"),
      };
    }, lessonId);
    check(
      "EXPLICIT_NAME_EDITOR",
      explicitNames.visible &&
        explicitNames.structure &&
        explicitNames.pods === 2 &&
        explicitNames.units === 4 &&
        explicitNames.noHint,
      explicitNames,
    );
    await page(async () => {
      EduV24.course.cancelEditor();
      const classroom = db.schools[0].classes[0];
      classroom.lessons.push({
        id: "legacy-modular-unit-audit",
        name: "روش قبلی پودمان آزمایشی",
        teacher: "",
        periodsPerWeek: 2,
        gradeMode: "standard",
        gradingPolicy: EduPolicy.defaults("modular", EduAcademicYear.current()),
        kardaneshScores: {},
        poudmans: [
          {
            id: "legacy-audit-pod",
            name: "پودمان قدیمی",
            podScores: {},
            units: [
              {
                id: "legacy-audit-unit",
                name: "واحد قدیمی",
                unitScores: {},
                applyOptions: {},
              },
            ],
          },
        ],
      });
      await EduV24.saveDB({ classId: classroom.id, action: "نمونه روش قبلی" });
      await EduV24.course.open("legacy-modular-unit-audit");
    });
    const legacy = await page(async () => {
      const scope = document.getElementById("course_modularScope").value;
      document.querySelector("[data-record-enable-edit]").click();
      document.getElementById("course_name").value += " ویرایش";
      await EduV24.course.save();
      const classroom = db.schools[0].classes[0];
      const lesson = classroom.lessons.find(
        (l) => l.id === "legacy-modular-unit-audit",
      );
      const host = document.createElement("div");
      host.innerHTML = EduV24.course.table(classroom, lesson, null, true);
      return {
        scope,
        explicit: Object.hasOwn(lesson.gradingPolicy, "modularScope"),
        podFields: host.querySelectorAll('[data-kind="pod"]').length,
        units: host.querySelectorAll("[data-unit-picker]").length,
      };
    });
    check(
      "LEGACY_MODE_UNCHANGED",
      legacy.scope === "module" &&
        !legacy.explicit &&
        legacy.podFields === 4 &&
        legacy.units === 0,
      legacy,
    );
    cases.push(...(await evaluate("(" + annualUnitFlow.toString() + ")()")));
  } finally {
    await page(async (backup) => {
      closeModal();
      EduV24.previewFullBackup(backup);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
    }, original);
  }
}

if (require.main === module)
  main({ stage: "modular-unit-grading", runExtra: run }).catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
module.exports = { run };
