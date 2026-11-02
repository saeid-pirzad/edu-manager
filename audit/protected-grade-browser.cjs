"use strict";

// Synthetic UI regression. The shared runner owns an isolated browser profile;
// no normal browser profile, project data or application files are modified.
async function protectedGradeAccess() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    previous = EduV24.getReportContext().id,
    year = "1438-1439",
    password = "protected-grade-destination",
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error("Protected grade access UI timed out");
    };
  try {
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const first = EduV24.getReportContext().id,
      school = structuredClone(db.schools[0]),
      classroom = school.classes[0],
      student = classroom.students[0],
      lesson = classroom.lessons.find(
        (item) =>
          item.gradeMode === "kardanesh" &&
          item.gradingPolicy?.subjectType !== "general",
      );
    if (!student || !lesson)
      throw Error("Protected grade fixture needs a student and a dual lesson");
    school.classes = [classroom];
    classroom.students = [student];
    classroom.archivedStudents = [];
    classroom.lessons = [lesson];
    lesson.gradingPolicy = EduPolicy.defaults("dual", year);
    lesson.poudmans = [];
    lesson.kardaneshScores = {
      [student.id]: {
        midtermPractical: 20,
        midtermTheory: 20,
        practical: 20,
        theory: 20,
      },
    };
    db.schools = [school];
    db.sessions = [];
    db.masterSchedule = {};
    await saveDB({ action: "Synthetic protected grade access fixture" });
    await EduV24.finalizePeriod();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "دوم";
    await EduV24.test.createLegacyPeriod();
    const second = EduV24.getReportContext().id;
    db.schools[0].classes[0].lessons[0].kardaneshScores[student.id] = {
      midtermPractical: 17,
      midtermTheory: 11,
      practical: 17,
      theory: 11,
    };
    await saveDB({ action: "Synthetic distinct destination grades" });
    await openSettingsModal();
    document.getElementById("newPass").value = password;
    if (!(await saveSettings()))
      throw Error("Could not protect the synthetic destination period");
    await EduV24.switchPeriod(first);
    state = {
      ...state,
      schoolId: school.id,
      classId: classroom.id,
      lessonId: lesson.id,
      view: "lesson",
      tab: "grades",
    };
    render();
    await openBulkScoreModal(lesson.id);
    const staleInput = document
      .querySelector("#modalBody [data-grade]")
      .cloneNode(true);
    document
      .querySelector('#modalBody .assessment-term-navigation [data-term="دوم"]')
      .click();
    await wait(
      () =>
        EduV24.getReportContext().id === second &&
        !!document.getElementById("loginPass"),
    );
    // The async command must finish before checking that no new modal appears.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const locked = EduV24.getReportContext();
    check(
      "AUTH01",
      "cross-term grade modal stops at the protected destination login",
      !locked.authenticated &&
        document.getElementById("modal").classList.contains("hidden") &&
        !document.querySelector("#modal:not(.hidden) [data-grade]"),
      { authenticated: locked.authenticated },
    );
    staleInput.value = "9";
    EduV24.gradeInput(staleInput);
    check(
      "AUTH02",
      "stale grade inputs cannot create drafts in the locked destination",
      EduV24.getReportContext().pendingDrafts === 0,
    );
    let denied = false;
    try {
      await EduV24.saveDB({ action: "Must reject locked write" });
    } catch {
      denied = true;
    }
    check("AUTH03", "data writes require destination authentication", denied);
    document.getElementById("loginPass").value = "incorrect-password";
    await checkPassword({
      preventDefault() {},
      target: document.getElementById("loginForm"),
    });
    check(
      "AUTH04",
      "incorrect destination password cannot reveal the requested gradebook",
      !EduV24.getReportContext().authenticated &&
        !!document.getElementById("loginPass") &&
        !document.querySelector("#app [data-grade]"),
    );
    document.getElementById("loginPass").value = password;
    await checkPassword({
      preventDefault() {},
      target: document.getElementById("loginForm"),
    });
    await wait(() => document.querySelector("#lessonGradesArea [data-grade]"));
    const input = document.querySelector(
      '#lessonGradesArea [data-student="' +
        student.id +
        '"][data-field$="Theory"],#lessonGradesArea [data-student="' +
        student.id +
        '"][data-field="theory"]',
    );
    check(
      "AUTH05",
      "successful login restores the selected lesson with untouched destination grades",
      EduV24.getReportContext().authenticated && input?.value === "11",
      { value: input?.value },
    );
    input.value = "9";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await EduV24.flushDrafts({ strict: true });
    const stored = await new Promise((resolve, reject) => {
      const request = EduV24.test
        .getConnection()
        .transaction("records")
        .objectStore("records")
        .get(second + "|class:" + classroom.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    check(
      "AUTH06",
      "authenticated grade editing still persists the intended destination value",
      stored.value.lessons[0].kardaneshScores[student.id][
        input.dataset.field
      ] === 9,
    );
  } catch (error) {
    check("AUTH99", "protected grade access flow completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    closeModal();
    await EduV24.switchPeriod(previous);
  }
  return cases;
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  cases.push(
    ...(await evaluate("(" + protectedGradeAccess.toString() + ")()")),
  );
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "protected-grade-access", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
