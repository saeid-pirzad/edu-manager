"use strict";

// Real delegated daily-session controls and IndexedDB in the isolated runner.
// The original synthetic installation is restored after this flow.
async function setup() {
  const original = await EduV24.snapshotInstallation();
  const ids = {
    period: "daily_ux_first",
    school: "daily_ux_school",
    classroom: "daily_ux_class",
    lesson: "daily_ux_lesson",
    session: "daily_ux_session",
    students: Array.from(
      { length: 12 },
      (_, index) => "daily_ux_student_" + index,
    ),
  };
  const year = EduAcademicYear.current();
  const date = todayISO();
  const day = getDayIdxFromDate(date);
  const restore = async (value) => {
    closeModal();
    EduV24.previewFullBackup(value);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
    await EduV24.test.settle();
  };
  globalThis.__dailySessionAudit = {
    ids,
    date,
    day,
    restore,
    original,
    cases: [],
  };
  const fixture = structuredClone(original);
  fixture.activeWorkspace = ids.period;
  fixture.gradeDrafts = [];
  fixture.reportDrafts = { [ids.period]: {} };
  fixture.snapshotNotes = [];
  for (const key of Object.keys(fixture.stores)) fixture.stores[key] = [];
  const students = ids.students.map((id, index) => ({
    id,
    code: String(index + 1),
    name: "Synthetic daily student " + (index + 1),
  }));
  const data = EduV24.normalizeDB({
    ...defaultDB(),
    settings: {
      ...db.settings,
      academicYear: year,
      academicTerm: "اول",
      password: "",
    },
    periods: 2,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    schools: [
      {
        id: ids.school,
        name: "Synthetic daily school",
        classes: [
          {
            id: ids.classroom,
            name: "Synthetic daily classroom",
            students,
            archivedStudents: [],
            lessons: [
              {
                id: ids.lesson,
                name: "Synthetic daily course",
                teacher: "Synthetic teacher",
                gradeMode: "kardanesh",
                gradingPolicy: EduPolicy.defaults("dual", year),
                kardaneshScores: {},
                poudmans: [],
              },
            ],
          },
        ],
      },
    ],
    masterSchedule: Object.fromEntries(
      [0, 1].map((period) => [
        day + "-" + period + "-all",
        { schoolId: ids.school, classId: ids.classroom, lessonId: ids.lesson },
      ]),
    ),
    migrationWarnings: [],
    sessions: [
      {
        id: ids.session,
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
        date,
        period: 0,
        poudmanId: null,
        unitId: null,
        roster: structuredClone(students),
        attendance: {
          [ids.students[0]]: "absent",
          [ids.students[1]]: "leave",
          [ids.students[2]]: "late:7",
          [ids.students[3]]: "present",
        },
        scores: [],
      },
    ],
  });
  const { schools, sessions, ...meta } = data;
  meta.layout = [
    { id: ids.school, name: schools[0].name, classes: [ids.classroom] },
  ];
  fixture.stores.catalog.push({
    id: ids.period,
    year,
    term: "اول",
    termKind: "first",
    closed: false,
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  for (const [logical, value] of [
    ["meta", meta],
    ["class:" + ids.classroom, schools[0].classes[0]],
    ["session:" + ids.session, sessions[0]],
  ])
    fixture.stores.records.push({
      key: ids.period + "|" + logical,
      workspace: ids.period,
      logical,
      value,
    });
  await restore(fixture);
  goSchools();
}
async function dailyFlow() {
  const audit = globalThis.__dailySessionAudit;
  const { ids, date, day } = audit;
  const check = (id, name, pass, observed = {}) =>
    audit.cases.push({ id: "DAILY_UX_" + id, name, pass: !!pass, observed });
  const wait = async (predicate, message) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(message);
  };
  const settle = async () => {
    await EduV24.test.settle().catch(() => {});
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  };
  const formNow = () =>
    document.querySelector("#modalBody .session-entry-form");
  const stored = async (id = ids.session) => {
    const tx = EduV24.test.getConnection().transaction("records", "readonly");
    const done = EduDataStoreRuntime.transactionDone(tx);
    const [record] = await Promise.all([
      EduDataStoreRuntime.requestPromise(
        tx.objectStore("records").get(ids.period + "|session:" + id),
      ),
      done,
    ]);
    return record?.value;
  };
  const count = async () => (await stored()).scores.length;
  const setForm = (values) => {
    const form = formNow();
    for (const [name, value] of Object.entries(values)) {
      form.elements.namedItem(name).value = value;
      form.elements
        .namedItem(name)
        .dispatchEvent(
          new Event(
            form.elements.namedItem(name).tagName === "SELECT"
              ? "change"
              : "input",
            { bubbles: true },
          ),
        );
    }
    return form;
  };
  const waitCount = async (expected) => {
    await wait(
      async () =>
        (await count()) === expected && EduV24.test.getState().busy === 0,
      "Activity did not persist exactly " + expected + " records",
    );
    await settle();
  };
  const starting = document.querySelector(
    '[data-legacy-click="today-agenda"][data-period="1"]',
  );
  check(
    "TODAY_CHOICES",
    "Today's ordered schedule distinguishes continue from start",
    !!starting &&
      !starting.dataset.session &&
      document.querySelector(
        '[data-legacy-click="today-agenda"][data-period="0"]',
      ).dataset.session === ids.session &&
      [...document.querySelectorAll(".today-agenda-row [data-period]")]
        .map((button) => button.dataset.period)
        .join(",") === "0,1",
  );
  starting.click();
  await wait(
    () =>
      !!document.querySelector("#modalBody .session-workspace") &&
      db.sessions.length === 2,
    "One scheduled start click did not open the actual editor",
  );
  await settle();
  const started = db.sessions.find((session) => session.period === 1);
  audit.startedSessionId = started.id;
  check(
    "TODAY_START",
    "A single today action creates only the selected valid date, class, lesson and bell",
    started.date === date &&
      started.classId === ids.classroom &&
      started.lessonId === ids.lesson &&
      currentSessionId === started.id &&
      !document.querySelector("#modalBody .session-start-panel"),
    {
      date: started.date,
      period: started.period,
      sessionCount: db.sessions.length,
    },
  );
  closeModal();
  goSchools();
  document
    .querySelector('[data-legacy-click="today-agenda"][data-period="0"]')
    .click();
  await wait(
    () => currentSessionId === ids.session && !!formNow(),
    "Continue did not open the existing session",
  );
  const existingCount = db.sessions.length;
  check(
    "TODAY_CONTINUE",
    "Continue reuses the existing session without creating a duplicate",
    currentSessionId === ids.session && existingCount === 2,
  );
  const initialProgress = document.querySelector(
    "[data-session-attendance-progress]",
  );
  check(
    "PROGRESS_INITIAL",
    "The session presents attendance progress before any group update",
    !!initialProgress &&
      initialProgress.getAttribute("role") === "status" &&
      initialProgress.textContent.includes("۸"),
    { text: initialProgress?.textContent },
  );
  document.querySelector('[data-legacy-click="sessions-dialog:6"]').click();
  await wait(
    async () =>
      (await stored()).attendance[ids.students[11]] === "present" &&
      EduV24.test.getState().busy === 0,
    "Unmarked students were not saved as present",
  );
  await settle();
  const attendance = (await stored()).attendance;
  const progress = document.querySelector("[data-session-attendance-progress]");
  check(
    "ONLY_UNSET",
    "Mark remaining present preserves recorded absence, leave, lateness and presence",
    attendance[ids.students[0]] === "absent" &&
      attendance[ids.students[1]] === "leave" &&
      attendance[ids.students[2]] === "late:7" &&
      attendance[ids.students[3]] === "present" &&
      ids.students.slice(4).every((id) => attendance[id] === "present"),
    { attendance },
  );
  check(
    "PROGRESS_COMPLETE",
    "Attendance completion and local saved feedback are visible",
    !!progress &&
      progress.textContent.includes("۰") &&
      !!document.querySelector(
        '[data-modal-save-feedback][data-state="saved"]:not([hidden])',
      ),
    {
      progress: progress?.textContent,
      status: document.querySelector("[data-modal-save-feedback]")?.textContent,
    },
  );
  const bulk = document.querySelector(".session-attendance-bulk details");
  check(
    "EXPLICIT_BULK",
    "Overwrite-all controls remain in an explicit secondary disclosure",
    !!bulk &&
      !!bulk.querySelector('[data-legacy-click="sessions-dialog:7"]') &&
      bulk.querySelectorAll("button").length >= 2,
  );
  showSessionPanel("activity");
  let form = setForm({
    studentId: ids.students[0],
    type: "classGrade",
    value: "0",
    note: "daily-zero",
  });
  const submit = form.querySelector(
    'button[type="submit"]:not([data-session-next])',
  );
  form.requestSubmit(submit);
  form.requestSubmit(submit);
  await waitCount(1);
  form = formNow();
  check(
    "SAVE_ZERO_ONCE",
    "Rapid repeated submit records zero once and keeps the selected student and activity type",
    (await stored()).scores[0].value === 0 &&
      form.elements.studentId.value === ids.students[0] &&
      form.elements.type.value === "classGrade" &&
      form.elements.value.value === "" &&
      form.elements.note.value === "" &&
      document.activeElement === form.elements.value,
    {
      scores: (await stored()).scores,
      student: form.elements.studentId.value,
      type: form.elements.type.value,
      value: form.elements.value.value,
      note: form.elements.note.value,
      focus: document.activeElement?.name,
    },
  );
  form = setForm({ value: "18.5", note: "daily-next" });
  form.requestSubmit(form.querySelector("[data-session-next]"));
  await waitCount(2);
  form = formNow();
  check(
    "EXPLICIT_NEXT",
    "Only explicit save-and-next advances the student and returns focus to value",
    form.elements.studentId.value === ids.students[1] &&
      form.elements.type.value === "classGrade" &&
      form.elements.value.value === "" &&
      form.elements.note.value === "" &&
      document.activeElement === form.elements.value,
    {
      student: form.elements.studentId.value,
      focus: document.activeElement?.name,
    },
  );
  form = setForm({ type: "positive", value: "1", note: "daily-positive" });
  form.requestSubmit(
    form.querySelector('button[type="submit"]:not([data-session-next])'),
  );
  await waitCount(3);
  form = formNow();
  check(
    "POSITIVE_DEFAULT",
    "Positive entry keeps the student and leaves a one-point default for the next entry",
    form.elements.studentId.value === ids.students[1] &&
      form.elements.type.value === "positive" &&
      form.elements.value.value === "1" &&
      form.elements.note.value === "",
    {
      student: form.elements.studentId.value,
      type: form.elements.type.value,
      value: form.elements.value.value,
      note: form.elements.note.value,
    },
  );
  form = setForm({
    type: "classGrade",
    value: "21",
    note: "retain-invalid-input",
  });
  form.requestSubmit(
    form.querySelector('button[type="submit"]:not([data-session-next])'),
  );
  await settle();
  check(
    "VALIDATION_RETAINS",
    "Invalid grade does not enter the database and leaves the activity inputs available for correction",
    (await count()) === 3 &&
      formNow().elements.value.value === "21" &&
      formNow().elements.note.value === "retain-invalid-input" &&
      formNow().elements.studentId.value === ids.students[1],
    { count: await count(), value: formNow()?.elements.value.value },
  );
  setForm({ type: "homework", value: "0", note: "pending-homework" });
  const body = document.getElementById("modalBody");
  body.scrollTop = Math.min(120, body.scrollHeight - body.clientHeight);
  const beforeScroll = body.scrollTop;
  openSessionModal(getSessionById(ids.session));
  form = formNow();
  check(
    "RERENDER_DRAFT",
    "A same-session refresh preserves pending student, type, zero and note",
    form.elements.studentId.value === ids.students[1] &&
      form.elements.type.value === "homework" &&
      form.elements.value.value === "0" &&
      form.elements.note.value === "pending-homework" &&
      !document.querySelector('[data-session-panel="activity"]').hidden,
    {
      student: form.elements.studentId.value,
      type: form.elements.type.value,
      value: form.elements.value.value,
      note: form.elements.note.value,
    },
  );
  check(
    "RERENDER_SCROLL",
    "A same-session refresh retains the modal scroll position",
    Math.abs(document.getElementById("modalBody").scrollTop - beforeScroll) < 2,
    {
      before: beforeScroll,
      after: document.getElementById("modalBody").scrollTop,
    },
  );
  form = setForm({
    type: "classGrade",
    value: "17",
    note: "retained-after-failure",
  });
  EduV24.test.failNextWrite();
  form.requestSubmit(
    form.querySelector('button[type="submit"]:not([data-session-next])'),
  );
  await wait(
    () =>
      EduV24.test.getState().busy === 0 &&
      !!document.querySelector(
        '[data-modal-save-feedback][data-state="error"]:not([hidden])',
      ),
    "A failed session write did not leave a visible local error",
  );
  await settle();
  form = formNow();
  check(
    "WRITE_FAILURE",
    "A failed write preserves the editable values, does not add a score and reports failure in the session",
    (await count()) === 3 &&
      form.elements.studentId.value === ids.students[1] &&
      form.elements.type.value === "classGrade" &&
      form.elements.value.value === "17" &&
      form.elements.note.value === "retained-after-failure" &&
      !form.elements.value.disabled,
    {
      count: await count(),
      value: form.elements.value.value,
      status: document.querySelector("[data-modal-save-feedback]")?.textContent,
    },
  );
  form.requestSubmit(
    form.querySelector('button[type="submit"]:not([data-session-next])'),
  );
  await waitCount(4);
  check(
    "RETRY",
    "Retry after write failure records the intended value exactly once and changes local feedback to saved",
    (await stored()).scores[3].value === 17 &&
      (await stored()).scores[3].note === "retained-after-failure" &&
      !!document.querySelector(
        '[data-modal-save-feedback][data-state="saved"]:not([hidden])',
      ),
  );
  const staleForm = setForm({
    value: "19",
    note: "must-not-save-from-detached-form",
  });
  openSessionModal(getSessionById(audit.startedSessionId));
  let staleRejected;
  try {
    const result = await addSessionScore(
      {
        target: staleForm,
        currentTarget: staleForm,
        submitter: staleForm.querySelector(
          'button[type="submit"]:not([data-session-next])',
        ),
        preventDefault() {},
      },
      ids.session,
    );
    staleRejected = result === false;
  } catch {
    staleRejected = true;
  }
  await settle();
  check(
    "STALE_FORM",
    "A detached form from the earlier session cannot write after another session is opened",
    staleRejected &&
      (await count()) === 4 &&
      (await stored(audit.startedSessionId)).scores.length === 0 &&
      currentSessionId === audit.startedSessionId,
  );
  const scores = (await stored()).scores.map(
    ({ studentId, type, value, note }) => ({
      studentId,
      type,
      value,
      note,
    }),
  );
  check(
    "RAW_RECORDS",
    "The exact durable score sequence contains only the four intended entries",
    JSON.stringify(scores) ===
      JSON.stringify([
        {
          studentId: ids.students[0],
          type: "classGrade",
          value: 0,
          note: "daily-zero",
        },
        {
          studentId: ids.students[0],
          type: "classGrade",
          value: 18.5,
          note: "daily-next",
        },
        {
          studentId: ids.students[1],
          type: "positive",
          value: 1,
          note: "daily-positive",
        },
        {
          studentId: ids.students[1],
          type: "classGrade",
          value: 17,
          note: "retained-after-failure",
        },
      ]),
    { scores },
  );
  const before = db.sessions.length;
  let denied = false;
  try {
    await EduV24.startTodaySession({
      date,
      day,
      period: 4,
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: ids.lesson,
    });
  } catch {
    denied = true;
  }
  check(
    "SCHEDULE_GUARD",
    "The faster today entry still rejects an unplanned bell without creating any session",
    denied && db.sessions.length === before,
  );
  openSessionModal(getSessionById(ids.session));
  return audit.cases;
}
function measure(panel) {
  showSessionPanel(panel);
  const root = document.querySelector("#modalBody .session-workspace");
  const body = document.getElementById("modalBody");
  const visible = (element) =>
    element.getClientRects().length > 0 &&
    !element.closest("[hidden]") &&
    getComputedStyle(element).visibility !== "hidden";
  const controls = [
    ...root.querySelectorAll("button,select,input,summary"),
  ].filter(visible);
  const boxes = controls.map((element) => ({
    name: element.name || element.dataset.legacyClick || element.tagName,
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  return {
    panel,
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    noModalOverflow: body.scrollWidth <= body.clientWidth + 1,
    noEditorOverflow: root.scrollWidth <= root.clientWidth + 1,
    targets: boxes,
    touchTargets: boxes.every((box) => box.height >= 43.9 && box.width >= 43.9),
    correctPanel: !root.querySelector('[data-session-panel="' + panel + '"]')
      .hidden,
  };
}
async function run(env) {
  const { cdp, evaluate, cases, delay } = env;
  const page = (fn, value = null) =>
    evaluate("(" + fn.toString() + ")(" + JSON.stringify(value) + ")");
  await require("./browser-ready.cjs")(env);
  try {
    await page(setup);
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 850,
      deviceScaleFactor: 1,
      mobile: true,
    });
    cases.push(...(await page(dailyFlow)));
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 850,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      for (const panel of ["attendance", "activity"]) {
        const observed = await page(measure, panel);
        cases.push({
          id: "DAILY_UX_LAYOUT_" + panel.toUpperCase() + "_" + width,
          name:
            "Daily session " +
            panel +
            " fits and keeps touch controls accessible at " +
            width,
          pass:
            observed.noPageOverflow &&
            observed.noModalOverflow &&
            observed.noEditorOverflow &&
            observed.touchTargets &&
            observed.correctPanel,
          observed,
        });
      }
      await page(() => {
        closeModal();
        goSchools();
      });
      await delay(25);
      const observed = await page(() => {
        const root = document.querySelector(".today-agenda");
        const actions = [...root.querySelectorAll("button")];
        return {
          noPageOverflow:
            document.documentElement.scrollWidth <= innerWidth + 1,
          noAgendaOverflow: root.scrollWidth <= root.clientWidth + 1,
          touchTargets: actions.every(
            (button) => button.getBoundingClientRect().height >= 43.9,
          ),
          rows: root.querySelectorAll(".today-agenda-row").length,
        };
      });
      cases.push({
        id: "DAILY_UX_AGENDA_" + width,
        name:
          "Today's ordered start/continue actions fit the dashboard at " +
          width,
        pass:
          observed.noPageOverflow &&
          observed.noAgendaOverflow &&
          observed.touchTargets &&
          observed.rows === 2,
        observed,
      });
      await page(() =>
        openSessionModal(
          getSessionById(globalThis.__dailySessionAudit.ids.session),
        ),
      );
    }
  } catch (error) {
    const partial = await page(
      () => globalThis.__dailySessionAudit?.cases || [],
    ).catch(() => []);
    const known = new Set(cases.map((item) => item.id));
    cases.push(...partial.filter((item) => !known.has(item.id)));
    cases.push({
      id: "DAILY_UX_BROWSER_ERROR",
      name: "The isolated daily session browser flow completed",
      pass: false,
      observed: { error: error.stack || error.message },
    });
  } finally {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page(async () => {
      const audit = globalThis.__dailySessionAudit;
      if (audit) await audit.restore(audit.original);
      delete globalThis.__dailySessionAudit;
    });
  }
}
module.exports = { run };
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "daily-session-usability", runExtra: run })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 2;
    });
