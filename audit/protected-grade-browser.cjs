"use strict";

// Synthetic UI regression. The shared runner owns an isolated browser profile;
// no normal browser profile, project data or application files are modified.
async function protectedGradeAccess() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    previous = EduV24.getReportContext().id,
    originalPrompt = window.prompt,
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
        .cloneNode(true),
      sourceBefore = JSON.stringify(db),
      sourceState = JSON.stringify(state),
      sourceContext = EduV24.getReportContext(),
      readClass = (id) =>
        new Promise((resolve, reject) => {
          const request = EduV24.test
            .getConnection()
            .transaction("records")
            .objectStore("records")
            .get(id + "|class:" + classroom.id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }),
      targetBefore = JSON.stringify(await readClass(second));
    let prompts = 0;
    const select = async (answer, { rejected = false } = {}) => {
      const panel = document.getElementById("modalBody"),
        before = prompts;
      // Each attempt must produce its own visible error in the real editor.
      panel.querySelector("[data-modal-save-feedback]")?.remove();
      window.prompt = () => {
        prompts++;
        return answer;
      };
      const button = panel.querySelector(
        '.assessment-term-navigation [data-term="دوم"][data-stage="midterm"]',
      );
      if (!button || button.disabled)
        throw Error("Second assessment action unavailable");
      button.click();
      await wait(() => prompts > before);
      if (rejected)
        await wait(() => {
          const notice = panel.querySelector(
            "[data-modal-save-feedback][data-state=error]",
          );
          return (
            notice &&
            !notice.hidden &&
            notice.textContent.includes("دسترسی به نمرات این نوبت تأیید نشد.")
          );
        });
      else
        await wait(
          () =>
            document.querySelector(
              '#modalBody [data-term="دوم"][data-stage="midterm"][aria-pressed="true"]',
            ) && document.querySelector("#modalBody [data-assessment-context]"),
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
    };
    await select("incorrect-password", { rejected: true });
    check(
      "AUTH01",
      "incorrect foreign assessment password preserves active authentication and source context",
      EduV24.getReportContext().id === first &&
        EduV24.getReportContext().authenticated ===
          sourceContext.authenticated &&
        JSON.stringify(db) === sourceBefore &&
        JSON.stringify(state) === sourceState &&
        !document.querySelector("#modalBody [data-assessment-context]"),
    );
    await select(null, { rejected: true });
    check(
      "AUTH02",
      "cancelled assessment authentication reveals no target grades or target changes",
      EduV24.getReportContext().id === first &&
        JSON.stringify(db) === sourceBefore &&
        JSON.stringify(await readClass(second)) === targetBefore &&
        !document.querySelector("#modalBody [data-assessment-context]"),
    );
    staleInput.dataset.assessmentContext = "unverified-target";
    staleInput.value = "9";
    let staleDenied = false;
    try {
      EduV24.gradeInput(staleInput);
      await EduV24.flushDrafts({ strict: true });
    } catch {
      staleDenied = true;
    }
    check(
      "AUTH03",
      "unverified target-context inputs cannot bypass foreign assessment authorization",
      staleDenied &&
        EduV24.getReportContext().pendingDrafts === 0 &&
        JSON.stringify(await readClass(second)) === targetBefore,
    );
    await select(password);
    const input = document.querySelector(
      '#modalBody [data-assessment-context][data-student="' +
        student.id +
        '"][data-field="midtermTheory"]',
    );
    check(
      "AUTH04",
      "verified target opens directly without global switch or login and retains target grade",
      EduV24.getReportContext().id === first &&
        EduV24.getReportContext().authenticated ===
          sourceContext.authenticated &&
        !document.getElementById("loginPass") &&
        input?.value === "11" &&
        JSON.stringify(db) === sourceBefore,
      { value: input?.value, active: EduV24.getReportContext().id },
    );
    input.value = "9";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await EduV24.flushDrafts({ strict: true });
    let stored = await readClass(second);
    check(
      "AUTH05",
      "verified foreign grade edit changes only target term while annual source remains active",
      stored.value.lessons[0].kardaneshScores[student.id].midtermTheory === 9 &&
        JSON.stringify(db) === sourceBefore &&
        EduV24.getReportContext().id === first,
    );
    EduV24.clearGrade(input);
    await EduV24.flushDrafts({ strict: true });
    stored = await readClass(second);
    check(
      "AUTH06",
      "clear action removes only the selected target-stage field",
      stored.value.lessons[0].kardaneshScores[student.id].midtermTheory ==
        null &&
        stored.value.lessons[0].kardaneshScores[student.id].theory === 11 &&
        JSON.stringify(db) === sourceBefore &&
        EduV24.getReportContext().id === first,
    );
    closeModal();
    window.prompt = () => "incorrect-password";
    let snapshotDenied = false;
    try {
      await EduV24.prepareReportSnapshot({ yearWide: true });
    } catch {
      snapshotDenied = true;
    }
    check(
      "AUTH07",
      "annual snapshot independently rejects an unverified protected peer",
      snapshotDenied && EduV24.getReportContext().id === first,
    );
    window.prompt = () => password;
    const snapshot = await EduV24.prepareReportSnapshot({ yearWide: true });
    check(
      "AUTH08",
      "verified annual snapshot includes protected target without changing source authentication",
      snapshot.parts.some((part) => part.period.id === second) &&
        EduV24.getReportContext().id === first &&
        EduV24.getReportContext().authenticated === sourceContext.authenticated,
    );
  } catch (error) {
    check("AUTH99", "protected grade access flow completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    window.prompt = originalPrompt;
    closeModal();
    await EduV24.test.switchLegacyPeriod(previous);
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
