"use strict";
module.exports = async function sessionAlerts() {
  const cases = [],
    native = [];
  const oldAlert = window.alert,
    oldConfirm = window.confirm;
  window.alert = (m) => native.push(["alert", m]);
  window.confirm = (m) => {
    native.push(["confirm", m]);
    return true;
  };
  const pause = () => new Promise((r) => setTimeout(r, 350));
  const school = db.schools.find((s) =>
      s.classes.some((c) => c.lessons.length),
    ),
    cls = school.classes.find((c) => c.lessons.length),
    lesson = cls.lessons[0];
  const context = EduV24.test.getState(),
    oldClosed = context.workspace.closed,
    oldSessions = [...db.sessions];
  context.workspace.closed = false;
  const open = () => {
    closeModal();
    goSchool(school.id);
    goClass(cls.id);
    goLesson(lesson.id);
  };
  try {
    open();
    await pause();
    let form = document.querySelector(".session-create-form");
    form.elements.date.value = "";
    form.requestSubmit();
    await pause();
    cases.push({
      id: "REAL-ALERT-INVALID",
      name: "Real session submit paints custom error without native alert",
      pass:
        !!document.querySelector(".session-validation-alert") &&
        native.length === 0,
      observed: { native: [...native] },
    });
    const date = "2026-10-31";
    db.sessions.push({
      id: "alert-ui-existing",
      schoolId: school.id,
      classId: cls.id,
      lessonId: lesson.id,
      date,
      period: 0,
      poudmanId: null,
      unitId: null,
      attendance: {},
      scores: [],
      roster: cls.students.map((s) => ({ id: s.id, name: s.name })),
    });
    db.sessions = db.sessions.filter(
      (s) => s.id === "alert-ui-existing" || s.date !== date || s.period !== 0,
    );
    open();
    await pause();
    form = document.querySelector(".session-create-form");
    form.elements.date.value = date;
    form.elements.date.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.period.value = "1";
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await pause();
    cases.push({
      id: "REAL-ALERT-CONTINUE",
      name: "Real continue button opens existing session without native confirmation",
      pass:
        currentSessionId === "alert-ui-existing" &&
        !document.getElementById("modal").classList.contains("hidden") &&
        native.length === 0,
      observed: {
        currentSessionId,
        native: [...native],
        error: document.querySelector(".session-validation-alert")?.textContent,
      },
    });
    const dateTools = document.querySelector("#modalBody .session-date-tools");
    dateTools.open = false;
    const message = "تداخل جلسه آزمایشی";
    EduV24.course.error(Error(message));
    await pause();
    const feedback = document.querySelector(
      "#modalBody [data-modal-save-feedback]",
    );
    cases.push({
      id: "REAL-ALERT-FALLBACK",
      name: "Generic session failure stays in scoped feedback without opening date controls",
      pass:
        !!feedback &&
        !feedback.hidden &&
        feedback.getClientRects().length > 0 &&
        feedback.dataset.state === "error" &&
        feedback.textContent === message &&
        feedback.getAttribute("role") === "status" &&
        feedback.getAttribute("aria-live") === "polite" &&
        !dateTools.open &&
        !dateTools.querySelector(".session-validation-alert") &&
        native.length === 0,
      observed: {
        native: [...native],
        feedback: feedback?.textContent,
        state: feedback?.dataset.state,
        visible:
          !!feedback &&
          !feedback.hidden &&
          feedback.getClientRects().length > 0,
        dateToolsOpen: dateTools.open,
      },
    });
  } finally {
    db.sessions = oldSessions;
    context.workspace.closed = oldClosed;
    window.alert = oldAlert;
    window.confirm = oldConfirm;
    closeModal();
  }
  return cases;
};
