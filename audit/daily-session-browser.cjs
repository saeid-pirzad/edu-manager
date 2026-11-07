"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

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
  await globalThis.__unlockRecordedSessionForAudit(ids.session);
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
  const beforeSearch = JSON.stringify(getSessionById(ids.session));
  let search = document.querySelector(".session-attendance-search input");
  search.value = "no matching student";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  check(
    "SEARCH_EMPTY",
    "Attendance search shows an empty state without changing session data",
    [...document.querySelectorAll(".att-row")].every((row) => row.hidden) &&
      !document.querySelector(".session-attendance-no-results").hidden &&
      JSON.stringify(getSessionById(ids.session)) === beforeSearch,
  );
  search.value = "Synthetic daily student 12";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  openSessionModal(getSessionById(ids.session));
  check(
    "SEARCH_RETAINED",
    "Attendance search survives editor refresh and reveals only the matching student",
    document.querySelector(".session-attendance-search input").value ===
      "Synthetic daily student 12" &&
      [...document.querySelectorAll(".att-row")].filter((row) => !row.hidden)
        .length === 1,
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
  const meter = document.querySelector("[data-session-attendance-meter]");
  check(
    "METER_COMPLETE",
    "Progress reflects the full roster even while attendance search is active",
    meter.max === 12 && meter.value === 12,
  );
  search = document.querySelector(".session-attendance-search input");
  search.value = "";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  check(
    "SEARCH_RESET",
    "Clearing attendance search restores the full roster",
    [...document.querySelectorAll(".att-row")].every((row) => !row.hidden),
  );
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
  const bulk = document.querySelector(".session-attendance-bulk");
  const bulkActions = [
    ...(bulk?.querySelectorAll(":scope > button") || []),
  ].map((button) => button.dataset.legacyClick);
  check(
    "EXPLICIT_BULK",
    "Three direct bulk controls keep distinct remaining-only and overwrite-all actions",
    bulk?.getAttribute("role") === "group" &&
      !bulk.querySelector("details") &&
      JSON.stringify(bulkActions) ===
        JSON.stringify([
          "sessions-dialog:6",
          "sessions-dialog:all-present",
          "sessions-dialog:7",
        ]),
    { actions: bulkActions },
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
      focusTag: document.activeElement?.tagName,
      focusHTML: document.activeElement?.outerHTML.slice(0, 200),
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
      focusTag: document.activeElement?.tagName,
      focusHTML: document.activeElement?.outerHTML.slice(0, 200),
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
    "Positive entry keeps the student and leaves a quarter-point default for the next entry",
    form.elements.studentId.value === ids.students[1] &&
      form.elements.type.value === "positive" &&
      form.elements.value.value === "0.25" &&
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
  openSessionModal(getSessionById(ids.session));
  await globalThis.__unlockRecordedSessionForAudit(ids.session);
  showSessionPanel("activity");
  form = setForm({ studentId: ids.students[0], type: "positive" });
  check(
    "POSITIVE_SELECTION_DEFAULT",
    "Selecting positive supplies the quarter-point default without changing old records",
    form.elements.value.value === "0.25" &&
      JSON.stringify(
        (await stored()).scores.map(({ studentId, type, value, note }) => ({
          studentId,
          type,
          value,
          note,
        })),
      ) === JSON.stringify(scores),
    { value: form.elements.value.value, count: await count() },
  );
  form = setForm({ type: "negative" });
  check(
    "NEGATIVE_SELECTION_DEFAULT",
    "Switching from positive to negative selects the half-point default",
    form.elements.value.value === "0.5",
    { value: form.elements.value.value },
  );
  setForm({ type: "positive", value: "0.75" });
  form = setForm({ studentId: ids.students[1] });
  check(
    "MANUAL_AMOUNT_STUDENT_CHANGE",
    "Changing the student preserves a manually entered activity amount",
    form.elements.value.value === "0.75",
    { value: form.elements.value.value },
  );
  setForm({ value: "0", note: "pending-zero-default-check" });
  openSessionModal(getSessionById(ids.session));
  form = formNow();
  check(
    "DEFAULTS_RERENDER_ZERO",
    "A same-session refresh retains a pending zero rather than replacing it with the positive default",
    form.elements.value.value === "0" &&
      form.elements.note.value === "pending-zero-default-check" &&
      form.elements.type.value === "positive" &&
      form.elements.studentId.value === ids.students[1],
    {
      value: form.elements.value.value,
      student: form.elements.studentId.value,
    },
  );
  setForm({
    studentId: ids.students[0],
    type: "negative",
  });
  form = setForm({ type: "positive", note: "positive-default-persisted" });
  check(
    "POSITIVE_RESELECTION_DEFAULT",
    "Returning from negative to positive restores the quarter-point default",
    form.elements.value.value === "0.25",
    { value: form.elements.value.value },
  );
  form.requestSubmit(form.querySelector("[data-session-next]"));
  await waitCount(5);
  form = formNow();
  const positiveDefault = (await stored()).scores[4];
  check(
    "POSITIVE_DEFAULT_DURABLE_NEXT",
    "Save-and-next persists positive 0.25 and prepares the same default for the next student",
    positiveDefault.studentId === ids.students[0] &&
      positiveDefault.type === "positive" &&
      positiveDefault.value === 0.25 &&
      positiveDefault.note === "positive-default-persisted" &&
      form.elements.studentId.value === ids.students[1] &&
      form.elements.type.value === "positive" &&
      form.elements.value.value === "0.25" &&
      form.elements.note.value === "",
    {
      score: positiveDefault,
      nextStudent: form.elements.studentId.value,
      nextValue: form.elements.value.value,
    },
  );
  form = setForm({ type: "negative", note: "negative-default-persisted" });
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
    "A failed negative-default write did not leave a visible local error",
  );
  await settle();
  form = formNow();
  check(
    "NEGATIVE_DEFAULT_FAILURE_RETAINS",
    "A failed negative entry preserves its half-point value and note without adding any score",
    (await count()) === 5 &&
      form.elements.type.value === "negative" &&
      form.elements.value.value === "0.5" &&
      form.elements.note.value === "negative-default-persisted" &&
      !form.elements.value.disabled,
    { count: await count(), value: form.elements.value.value },
  );
  form.requestSubmit(
    form.querySelector('button[type="submit"]:not([data-session-next])'),
  );
  await waitCount(6);
  form = formNow();
  const negativeDefault = (await stored()).scores[5];
  check(
    "NEGATIVE_DEFAULT_DURABLE",
    "Retry persists the negative half-point default exactly once and prepares the same default for the next entry",
    negativeDefault.studentId === ids.students[1] &&
      negativeDefault.type === "negative" &&
      negativeDefault.value === 0.5 &&
      negativeDefault.note === "negative-default-persisted" &&
      form.elements.type.value === "negative" &&
      form.elements.value.value === "0.5" &&
      form.elements.note.value === "" &&
      (await stored()).scores[2].value === 1,
    { score: negativeDefault, nextValue: form.elements.value.value },
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
  check(
    "REUSE_FIRST_BELL",
    "First bell has no previous-attendance action",
    !document.querySelector(
      '[data-legacy-click="sessions-dialog:reuse-previous"]',
    ),
  );
  const sourceBeforeReuse = JSON.stringify(await stored());
  openSessionModal(getSessionById(audit.startedSessionId));
  await globalThis.__unlockRecordedSessionForAudit(audit.startedSessionId);
  const reuse = document.querySelector(
    '[data-legacy-click="sessions-dialog:reuse-previous"]',
  );
  check(
    "REUSE_AVAILABLE",
    "Next bell offers the same-class same-day attendance shortcut",
    !!reuse && reuse.textContent.includes("۱"),
  );
  document
    .querySelector('.att-btns[data-sid="' + ids.students[0] + '"] .present')
    .click();
  await wait(
    async () =>
      (await stored(audit.startedSessionId)).attendance[ids.students[0]] ===
        "present" && EduV24.test.getState().busy === 0,
    "Could not set the next-bell exception",
  );
  document
    .querySelector('[data-legacy-click="sessions-dialog:reuse-previous"]')
    .click();
  await wait(
    async () =>
      Object.keys((await stored(audit.startedSessionId)).attendance).length ===
        12 && EduV24.test.getState().busy === 0,
    "Previous attendance did not persist in the next bell",
  );
  const reused = await stored(audit.startedSessionId);
  check(
    "REUSE_DURABLE",
    "Reuse persists only unset statuses, keeps current exceptions and does not carry lateness minutes or scores",
    reused.attendance[ids.students[0]] === "present" &&
      reused.attendance[ids.students[1]] === "leave" &&
      reused.attendance[ids.students[2]] === "present" &&
      reused.scores.length === 0 &&
      JSON.stringify(await stored()) === sourceBeforeReuse,
  );
  check(
    "REUSE_COMPLETE",
    "Shortcut becomes disabled when all next-bell statuses are recorded",
    document.querySelector(
      '[data-legacy-click="sessions-dialog:reuse-previous"]',
    ).disabled,
  );
  document
    .querySelector('.att-btns[data-sid="' + ids.students[3] + '"] .present')
    .click();
  await wait(
    async () =>
      !(await stored(audit.startedSessionId)).attendance[ids.students[3]] &&
      EduV24.test.getState().busy === 0,
    "Could not prepare the failed-reuse scenario",
  );
  EduV24.test.failNextWrite();
  document
    .querySelector('[data-legacy-click="sessions-dialog:reuse-previous"]')
    .click();
  await wait(
    () =>
      EduV24.test.getState().busy === 0 &&
      !!document.querySelector(
        '[data-modal-save-feedback][data-state="error"]:not([hidden])',
      ),
    "Failed attendance reuse did not show a local save error",
  );
  check(
    "REUSE_FAILURE",
    "Failed reuse does not persist a partial attendance change or alter its source",
    !(await stored(audit.startedSessionId)).attendance[ids.students[3]] &&
      !getSessionById(audit.startedSessionId).attendance[ids.students[3]] &&
      JSON.stringify(await stored()) === sourceBeforeReuse,
  );
  openSessionModal(getSessionById(audit.startedSessionId));
  document
    .querySelector('[data-legacy-click="sessions-dialog:reuse-previous"]')
    .click();
  await wait(
    async () =>
      (await stored(audit.startedSessionId)).attendance[ids.students[3]] ===
        "present" && EduV24.test.getState().busy === 0,
    "Attendance reuse could not retry after a failed write",
  );
  check(
    "REUSE_RETRY",
    "Reusing previous attendance can safely retry after a failed write",
    (await stored(audit.startedSessionId)).attendance[ids.students[3]] ===
      "present",
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
    activityFormSurface:
      getComputedStyle(root.querySelector(".session-entry-form"))
        .backgroundColor === "rgb(255, 255, 255)" &&
      getComputedStyle(root.querySelector(".session-entry-form"))
        .borderTopColor === "rgb(228, 228, 231)",
    activeStatusesReadable: [
      ...root.querySelectorAll(".att-btns button.active"),
    ].every(
      (button) =>
        getComputedStyle(button).color === "rgb(255, 255, 255)" &&
        button.getAttribute("aria-pressed") === "true",
    ),
  };
}
async function run(env) {
  const { cdp, evaluate, cases, delay } = env;
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-session-ux-"));
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
    for (const width of [320, 390, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 850,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      for (const panel of ["attendance", "activity"]) {
        const observed = await page(measure, panel);
        await evaluate("document.getElementById('modalBody').scrollTop=0");
        await delay(80);
        const screenshot = await cdp("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          path.join(previews, width + "-" + panel + ".png"),
          Buffer.from(screenshot.data, "base64"),
        );
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
            observed.activityFormSurface &&
            observed.activeStatusesReadable &&
            observed.correctPanel,
          observed,
        });
      }
      const reuseAccess = await page(async () => {
        const id = globalThis.__dailySessionAudit.startedSessionId;
        openSessionModal(getSessionById(id));
        const root = document.querySelector("#modalBody .session-workspace"),
          writes = [
            ...root.querySelectorAll(
              '[data-mutating="1"]:is(button,input,select,textarea):not([data-session-edit-control])',
            ),
          ],
          viewReadonly =
            root.dataset.sessionMode === "view" &&
            writes.length > 0 &&
            writes.every((control) => control.disabled);
        if (!viewReadonly)
          throw Error("The recorded reuse session must open read-only");
        const beforeMemory = JSON.stringify(db),
          beforeStores = JSON.stringify(
            (await EduV24.snapshotInstallation()).stores,
          );
        await globalThis.__unlockRecordedSessionForAudit(id);
        await EduV24.test.settle();
        // Measure the real editing controls, not the disabled view badges or
        // their transient geometry while the view/edit transition is painting.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await Promise.all(
          root
            .getAnimations({ subtree: true })
            .filter((animation) =>
              Number.isFinite(animation.effect?.getTiming().iterations),
            )
            .map((animation) => animation.finished.catch(() => {})),
        );
        await new Promise(requestAnimationFrame);
        return {
          viewReadonly,
          editEnabled: root.dataset.sessionMode === "edit",
          activationPreservesData:
            beforeMemory === JSON.stringify(db) &&
            beforeStores ===
              JSON.stringify((await EduV24.snapshotInstallation()).stores),
        };
      });
      const reuseLayout = await page(measure, "attendance");
      cases.push({
        id: "DAILY_UX_REUSE_LAYOUT_" + width,
        name: "Next-bell attendance shortcut fits at " + width,
        pass:
          reuseAccess.viewReadonly &&
          reuseAccess.editEnabled &&
          reuseAccess.activationPreservesData &&
          reuseLayout.noModalOverflow &&
          reuseLayout.noEditorOverflow &&
          reuseLayout.touchTargets,
        observed: { ...reuseLayout, ...reuseAccess },
      });
      await evaluate("document.getElementById('modalBody').scrollTop=0");
      await delay(80);
      const reuseScreenshot = await cdp("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(previews, width + "-reuse-attendance.png"),
        Buffer.from(reuseScreenshot.data, "base64"),
      );
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
      await page(() => {
        goMaster();
        clickMasterCell(globalThis.__dailySessionAudit.day, 0);
      });
      await delay(80);
      const historyLayout = await page(() => {
        const section = document.querySelector(".session-setup-history"),
          rows = [...section.querySelectorAll(".session-setup-recent-item")];
        return {
          count: rows.length,
          fits:
            document.getElementById("modalBody").scrollWidth <=
            document.getElementById("modalBody").clientWidth + 1,
          compact: rows.every(
            (row) =>
              row.getBoundingClientRect().height >= 44 &&
              row.getBoundingClientRect().height <= 80 &&
              row.scrollWidth <= row.clientWidth + 1 &&
              getComputedStyle(row.querySelector("strong")).fontSize ===
                "12px" &&
              getComputedStyle(row.querySelector("small")).fontSize === "10px",
          ),
        };
      });
      cases.push({
        id: "DAILY_UX_HISTORY_" + width,
        name: "Previous bell sessions use compact readable rows at " + width,
        pass:
          historyLayout.count > 0 &&
          historyLayout.fits &&
          historyLayout.compact,
        observed: historyLayout,
      });
      const historyImage = await cdp("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(previews, width + "-history.png"),
        Buffer.from(historyImage.data, "base64"),
      );
      await page(() =>
        document.querySelector(".session-setup-recent-item").click(),
      );
      await delay(80);
      const historyOpened = await page(
        () =>
          currentSessionId === globalThis.__dailySessionAudit.ids.session &&
          !!document.querySelector(".session-workspace"),
      );
      cases.push({
        id: "DAILY_UX_HISTORY_OPEN_" + width,
        name: "Compact history row opens its original session at " + width,
        pass: historyOpened,
      });
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
    console.log("Session UI previews: " + previews);
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
