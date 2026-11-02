"use strict";

// Uses ordinary delegated teacher editors and their real IndexedDB transactions.
module.exports = async function deputyTeacherEdits(ids) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (predicate) => {
      for (let i = 0; i < 240; i++) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(
        "Teacher sync editor did not settle: " +
          EduV24.test.getState().status.message,
      );
    },
    gradeInput = (lessonId, field) =>
      document.querySelector(
        '#app [data-grade="1"][data-lesson="' +
          lessonId +
          '"][data-student="' +
          ids.a +
          '"][data-field="' +
          field +
          '"]',
      ),
    openStage = async (lessonId, stage) => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.classroom);
      goLesson(lessonId);
      setTab("grades");
      document
        .querySelector(
          '#app [data-workspace-action="assessment-stage"][data-term="دوم"][data-stage="' +
            stage +
            '"]',
        )
        .click();
      await wait(
        () =>
          document.querySelector(
            '#app [data-workspace-action="assessment-stage"][data-term="دوم"][data-stage="' +
              stage +
              '"][aria-pressed="true"]',
          ) &&
          gradeInput(
            lessonId,
            stage === "midterm" ? "midtermTheory" : "theory",
          ),
      );
    },
    enter = async (lessonId, field, value) => {
      const input = gradeInput(lessonId, field);
      if (!input || input.readOnly || input.disabled)
        throw Error(
          "Teacher grade field is unavailable: " + lessonId + "/" + field,
        );
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await EduV24.flushDrafts({ strict: true });
      await EduV24.test.settle();
    },
    clear = async (lessonId, field) => {
      const input = gradeInput(lessonId, field),
        button = input?.parentElement.querySelector("[data-clear-grade]");
      if (!button)
        throw Error("Teacher grade clear button unavailable: " + field);
      button.click();
      await EduV24.flushDrafts({ strict: true });
      await EduV24.test.settle();
    };
  await openStage(ids.dual, "final");
  await enter(ids.dual, "practical", "0");
  await enter(ids.dual, "theory", "12");
  await openStage(ids.general, "final");
  await enter(ids.general, "theory", "0");
  await openStage(ids.general, "midterm");
  await clear(ids.general, "midtermTheory");
  closeModal();
  goSchool(ids.school);
  goClass(ids.classroom);
  goLesson(ids.modular);
  setTab("grades");
  await wait(() => gradeInput(ids.modular, "m"));
  await enter(ids.modular, "m", "0");
  await clear(ids.modular, "c");
  const firstSession = getSessionById("deputy_audit_session_1");
  openSessionModal(firstSession);
  document
    .querySelector('#modalBody [data-sid="' + ids.a + '"] button.absent')
    .click();
  await EduV24.test.settle();
  const previousPrompt = window.prompt;
  try {
    window.prompt = () => "10";
    document
      .querySelector('#modalBody [data-sid="' + ids.b + '"] button.late')
      .click();
    await EduV24.test.settle();
  } finally {
    window.prompt = previousPrompt;
  }
  closeModal();
  const snapshot = await EduV24.snapshotInstallation(),
    classroom = (period) =>
      snapshot.stores.records.find(
        (row) =>
          row.workspace === period && row.logical === "class:" + ids.classroom,
      ).value,
    lesson = (period, lessonId) =>
      classroom(period).lessons.find((row) => row.id === lessonId),
    dual = lesson(ids.second, ids.dual).kardaneshScores[ids.a],
    general = lesson(ids.second, ids.general).kardaneshScores[ids.a],
    module = (period) =>
      lesson(period, ids.modular).poudmans[0].podScores[ids.a],
    session = snapshot.stores.records.find(
      (row) =>
        row.workspace === ids.second &&
        row.logical === "session:deputy_audit_session_1",
    ).value;
  check(
    "DEPUTY_TEACHER_EDIT",
    "actual teacher grade editors persist dual zero, general zero and a genuine cleared grade before the second export",
    dual.practical === 0 &&
      dual.theory === 12 &&
      general.theory === 0 &&
      general.midtermTheory == null,
  );
  check(
    "DEPUTY_TEACHER_ANNUAL",
    "actual modular editor synchronizes zero and cleared competency into both terms, including the closed first term",
    [ids.first, ids.second].every(
      (period) => module(period).m === 0 && module(period).c == null,
    ),
  );
  check(
    "DEPUTY_TEACHER_ATTENDANCE",
    "actual teacher attendance buttons persist corrected absence and ten-minute lateness",
    session.attendance[ids.a] === "absent" &&
      session.attendance[ids.b] === "late:10",
  );
  return cases;
};
