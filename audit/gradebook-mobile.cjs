"use strict";
const { main } = require("./data-integrity.cjs");
async function gradebookSetup() {
  closeModal();
  await EduV24.test.prepareLegacyPeriodFixture();
  document.getElementById("periodYear").value = "1422-1423";
  document.getElementById("periodTerm").value = "اول";
  await EduV24.test.createLegacyPeriod();
  const school = db.schools[0];
  const classroom = school.classes[0];
  const lesson = classroom.lessons.find(
    (item) =>
      item.gradeMode === "kardanesh" &&
      item.gradingPolicy?.subjectType !== "general",
  );
  if (!lesson) throw Error("Mobile fixture requires a vocational lesson");
  state = {
    ...state,
    view: "lesson",
    schoolId: school.id,
    classId: classroom.id,
    lessonId: lesson.id,
    tab: "grades",
  };
  render();
  return lesson.id;
}
async function measure() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const root =
    document.querySelector("#modal:not(.hidden) .assessment-editor") ||
    document.querySelector("#lessonGradesArea .assessment-editor");
  if (!root) throw Error("Gradebook is not visible");
  const labels = [...root.querySelectorAll(".assessment-inputs label")];
  const headingsFit = labels.every((label) => {
    const heading = label.querySelector(".assessment-field-heading");
    const name = heading?.querySelector("span");
    const weight = heading?.querySelector(".assessment-field-weight");
    if (!heading || !name || !weight) return false;
    const a = name.getBoundingClientRect(),
      b = weight.getBoundingClientRect();
    return (
      heading.scrollWidth <= heading.clientWidth + 1 &&
      (a.right <= b.left + 1 || b.right <= a.left + 1)
    );
  });
  const touchTargets = [...root.querySelectorAll(".grade-clear")].every(
    (button) => {
      const box = button.getBoundingClientRect();
      return box.width >= 44 && box.height >= 44;
    },
  );
  const fieldsFit = labels.every(
    (label) => label.scrollWidth <= label.clientWidth + 1,
  );
  const compactMobile =
    window.innerWidth > 700 ||
    [...root.querySelectorAll(".assessment-student")].every(
      (row) => row.getBoundingClientRect().height <= 195,
    );
  const usableInputs = [...root.querySelectorAll("[data-grade]")].every(
    (input) => input.getBoundingClientRect().width >= 96,
  );
  const resultSeparated = [
    ...root.querySelectorAll(".assessment-student"),
  ].every((row) => {
    const inputs = row
      .querySelector(".assessment-inputs")
      .getBoundingClientRect();
    const result = row
      .querySelector(".gradebook-result")
      .getBoundingClientRect();
    return (
      (result.top >= inputs.bottom ||
        result.right <= inputs.left ||
        result.left >= inputs.right) &&
      result.bottom <= row.getBoundingClientRect().bottom
    );
  });
  return {
    headingsFit,
    touchTargets,
    fieldsFit,
    compactMobile,
    usableInputs,
    resultSeparated,
    geometry: Object.fromEntries(
      [
        ".assessment-student",
        ".gradebook-student",
        ".assessment-inputs",
        ".gradebook-result",
      ].map((selector) => [
        selector,
        root.querySelector(selector).getBoundingClientRect().height,
      ]),
    ),
    rootFits: root.scrollWidth <= root.clientWidth + 1,
  };
}
if (require.main === module)
  main({
    stage: "gradebook-mobile-layout",
    runExtra: async ({ cdp, evaluate, cases, delay }) => {
      await require("./browser-ready.cjs")({ cdp, evaluate, delay });
      const lessonId = await evaluate("(" + gradebookSetup.toString() + ")()");
      for (const modal of [false, true]) {
        await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
        if (modal)
          await evaluate(
            "openBulkScoreModal(" + JSON.stringify(lessonId) + ")",
          );
        for (const width of [
          320, 360, 390, 430, 600, 700, 701, 768, 820, 900, 1024, 1280, 1440,
          1920,
        ]) {
          await cdp("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 700,
          });
          const observed = await evaluate("(" + measure.toString() + ")()");
          if (width >= 701 && width <= 1100)
            observed.singleColumn = await evaluate(
              "getComputedStyle((document.querySelector('#modal:not(.hidden) .assessment-editor') || document.querySelector('#lessonGradesArea .assessment-editor')).querySelector('.assessment-students')).gridTemplateColumns.split(' ').length === 1",
            );
          cases.push({
            id: "GRADE_MOBILE_" + width + "_" + (modal ? "modal" : "page"),
            name: "Grade headers and touch targets fit " + width,
            pass: Object.values(observed).every(Boolean),
            observed,
          });
        }
        await cdp("Emulation.setTouchEmulationEnabled", {
          enabled: true,
          maxTouchPoints: 5,
        });
        for (const [width, height] of [
          [768, 1024],
          [820, 1180],
          [1024, 768],
          [1180, 820],
          [1280, 800],
          [1366, 1024],
        ]) {
          await cdp("Emulation.setDeviceMetricsOverride", {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: true,
          });
          const observed = await evaluate("(" + measure.toString() + ")()");
          const tablet = await evaluate(`(() => {
            const root = document.querySelector('#modal:not(.hidden) .assessment-editor') || document.querySelector('#lessonGradesArea .assessment-editor');
            const columns = getComputedStyle(root.querySelector('.assessment-students')).gridTemplateColumns.split(' ').length;
            return { touch: matchMedia('(pointer: coarse)').matches, columnsFit: columns === 1 };
          })()`);
          cases.push({
            id:
              "GRADE_TABLET_" +
              width +
              "x" +
              height +
              "_" +
              (modal ? "modal" : "page"),
            name: "Touch tablet grade layout in portrait and landscape",
            pass:
              Object.values(observed).every(Boolean) &&
              tablet.touch &&
              tablet.columnsFit,
            observed: { ...observed, ...tablet },
          });
        }
      }
    },
  }).catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
