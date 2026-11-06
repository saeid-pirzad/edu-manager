"use strict";

// Synthetic installation only; the runner owns an isolated temporary browser.
// --baseline records old rendering costs without accepting them as release gates.
async function setup() {
  const original = await EduV24.snapshotInstallation();
  const ids = {
    workspace: "local_render_first",
    school: "local_render_school",
    classroom: "local_render_class",
    lesson: "local_render_lesson",
    session: "local_render_session",
    previous: "local_render_previous",
  };
  const year = EduAcademicYear.current(),
    date = todayISO(),
    students = Array.from({ length: 250 }, (_, index) => ({
      id: "local_render_student_" + index,
      code: String(index + 1),
      name: "Synthetic local student " + String(index + 1).padStart(3, "0"),
    }));
  const restore = async (value) => {
    closeModal();
    EduV24.previewFullBackup(value);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
    await EduV24.test.settle().catch(() => {});
  };
  globalThis.__sessionLocalAudit = { original, ids, restore, cases: [] };
  const fixture = structuredClone(original);
  fixture.activeWorkspace = ids.workspace;
  fixture.gradeDrafts = [];
  fixture.reportDrafts = { [ids.workspace]: {} };
  fixture.snapshotNotes = [];
  for (const key of Object.keys(fixture.stores)) fixture.stores[key] = [];
  const lesson = {
    id: ids.lesson,
    name: "Synthetic local course",
    teacher: "Synthetic teacher",
    gradeMode: "kardanesh",
    gradingPolicy: EduPolicy.defaults("dual", year),
    kardaneshScores: {},
    poudmans: [],
  };
  const common = {
    schoolId: ids.school,
    classId: ids.classroom,
    lessonId: ids.lesson,
    date,
    poudmanId: null,
    unitId: null,
    roster: structuredClone(students),
  };
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
        name: "Synthetic local school",
        classes: [
          {
            id: ids.classroom,
            name: "Synthetic local classroom",
            students,
            archivedStudents: [],
            lessons: [lesson],
          },
        ],
      },
    ],
    masterSchedule: Object.fromEntries(
      [0, 1].map((period) => [
        getDayIdxFromDate(date) + "-" + period + "-all",
        { schoolId: ids.school, classId: ids.classroom, lessonId: ids.lesson },
      ]),
    ),
    migrationWarnings: [],
    sessions: [
      {
        ...common,
        id: ids.previous,
        period: 0,
        attendance: Object.fromEntries(
          students.map((student, index) => [
            student.id,
            index % 4 === 0
              ? "late:7"
              : index % 4 === 1
                ? "absent"
                : index % 4 === 2
                  ? "leave"
                  : "present",
          ]),
        ),
        scores: [],
      },
      {
        ...common,
        id: ids.session,
        period: 1,
        attendance: {
          [students[0].id]: "absent",
          [students[1].id]: "leave",
          [students[2].id]: "late:7",
        },
        scores: students.slice(0, 125).map((student) => ({
          studentId: student.id,
          type: "positive",
          value: 0.25,
          note: "Synthetic initial activity",
          recordedAt: new Date().toISOString(),
        })),
      },
    ],
  });
  const { schools, sessions, ...meta } = data;
  meta.layout = [
    { id: ids.school, name: schools[0].name, classes: [ids.classroom] },
  ];
  fixture.stores.catalog.push({
    id: ids.workspace,
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
    ...sessions.map((session) => ["session:" + session.id, session]),
  ])
    fixture.stores.records.push({
      key: ids.workspace + "|" + logical,
      workspace: ids.workspace,
      logical,
      value,
    });
  await restore(fixture);
  goSchools();
  openSessionModal(getSessionById(ids.session));
  await globalThis.__unlockRecordedSessionForAudit(ids.session);
}

async function flow(baseline) {
  const audit = globalThis.__sessionLocalAudit,
    id = audit.ids.session,
    body = document.getElementById("modalBody");
  const add = (name, pass, observed) =>
    audit.cases.push({
      id: "LOCAL_SESSION_" + name,
      name,
      pass: !!pass,
      observed,
    });
  const settle = async () => {
    await EduV24.test.settle().catch(() => {});
    for (let frame = 0; frame < 4; frame++)
      await new Promise(requestAnimationFrame);
  };
  const wait = async (predicate) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error("Local session delegated action did not settle");
  };
  const form = () => body.querySelector(".session-entry-form");
  const measure = async (action) => {
    await settle();
    const root = body.querySelector(".session-workspace"),
      previousForm = form(),
      rows = [...body.querySelectorAll(".att-row")],
      scores = [...body.querySelectorAll(".session-score-table tbody tr")],
      active = document.activeElement,
      selectionStart = active.selectionStart,
      selectionEnd = active.selectionEnd,
      scrollTop = body.scrollTop,
      search = body.querySelector(".session-attendance-search input"),
      searchValue = search.value,
      entry = captureSessionActivityForm();
    const mutations = [];
    const observer = new MutationObserver((records) =>
      mutations.push(...records),
    );
    observer.observe(body, { childList: true, subtree: true });
    const start = performance.now();
    try {
      await action();
      await settle();
    } finally {
      observer.disconnect();
    }
    const result = {
      durationMs: Math.round((performance.now() - start) * 10) / 10,
      roster: rows.length,
      scoreRowsBefore: scores.length,
      rootRetained: root === body.querySelector(".session-workspace"),
      formRetained: previousForm === form(),
      attendanceRowsRetained: rows.filter((row) => row.isConnected).length,
      scoreRowsRetained: scores.filter((row) => row.isConnected).length,
      removedScoreRows: mutations.reduce(
        (sum, record) =>
          sum +
          [...record.removedNodes].reduce(
            (count, node) =>
              count +
              scores.filter(
                (row) =>
                  node === row || (node.nodeType === 1 && node.contains(row)),
              ).length,
            0,
          ),
        0,
      ),
      removedAttendanceRows: mutations.reduce(
        (sum, record) =>
          sum +
          [...record.removedNodes].reduce(
            (count, node) =>
              count +
              rows.filter(
                (row) =>
                  node === row || (node.nodeType === 1 && node.contains(row)),
              ).length,
            0,
          ),
        0,
      ),
      focusRetained: active === document.activeElement,
      selectionRetained:
        active === document.activeElement &&
        active.selectionStart === selectionStart &&
        active.selectionEnd === selectionEnd,
      scrollRetained: Math.abs(scrollTop - body.scrollTop) < 2,
      searchRetained:
        body.querySelector(".session-attendance-search input").value ===
        searchValue,
      entryRetained:
        JSON.stringify(entry) === JSON.stringify(captureSessionActivityForm()),
      removedElements: mutations.reduce(
        (sum, record) =>
          sum +
          [...record.removedNodes].reduce(
            (count, node) =>
              count +
              (node.nodeType === 1 ? 1 + node.querySelectorAll("*").length : 0),
            0,
          ),
        0,
      ),
    };
    return result;
  };
  const setEntry = () => {
    const current = form();
    current.elements.studentId.value = "local_render_student_249";
    current.elements.type.value = "positive";
    current.elements.value.value = "0";
    current.elements.note.value = "Unfinished synthetic input";
    refreshSessionActivityInput(current);
  };
  // Opening a modal schedules its initial focus/locks on a timer. Finish that
  // lifecycle before treating the focused search field as user-owned state.
  await settle();
  setEntry();
  const search = body.querySelector(".session-attendance-search input");
  search.value = "student 250";
  filterSessionAttendance(search);
  search.focus();
  search.setSelectionRange(2, 5);
  const bulk = await measure(() =>
    setAllAttendance("present", { onlyUnset: true }),
  );
  add(
    "BULK_LOCAL",
    baseline ||
      (bulk.rootRetained &&
        bulk.formRetained &&
        bulk.attendanceRowsRetained === 250 &&
        bulk.focusRetained &&
        bulk.selectionRetained &&
        bulk.scrollRetained),
    bulk,
  );
  const noOp = await measure(() =>
    setAllAttendance("present", { onlyUnset: true }),
  );
  add(
    "BULK_NOOP",
    noOp.rootRetained &&
      noOp.formRetained &&
      noOp.removedElements === 0 &&
      noOp.entryRetained,
    noOp,
  );
  add(
    "BULK_INPUTS_AND_BUSINESS",
    bulk.searchRetained &&
      bulk.entryRetained &&
      getSessionById(id).attendance.local_render_student_0 === "absent" &&
      getSessionById(id).attendance.local_render_student_1 === "leave" &&
      getSessionById(id).attendance.local_render_student_2 === "late:7" &&
      Object.keys(getSessionById(id).attendance).length === 250,
    { searchRetained: bulk.searchRetained, entryRetained: bulk.entryRetained },
  );
  // Unset a single row through the real persisted mutation before the reuse check.
  const target = body.querySelector(
    '[data-sid="local_render_student_249"] .present',
  );
  const single = await measure(() => toggleAtt(target, "present"));
  add(
    "SINGLE_LOCAL",
    single.rootRetained &&
      single.formRetained &&
      single.attendanceRowsRetained === 250 &&
      single.scoreRowsRetained === 125 &&
      single.entryRetained,
    single,
  );
  const reuse = await measure(() => copyPreviousAttendance(id));
  add(
    "REUSE_LOCAL",
    baseline ||
      (reuse.rootRetained &&
        reuse.formRetained &&
        reuse.attendanceRowsRetained === 250),
    reuse,
  );
  add(
    "REUSE_BUSINESS",
    getSessionById(id).attendance.local_render_student_249 === "absent",
    { attendance: getSessionById(id).attendance.local_render_student_249 },
  );

  showSessionPanel("activity");
  setEntry();
  form().elements.note.focus();
  const beforeAdd = getSessionById(id).scores.length;
  const added = await measure(() =>
    addSessionScore(
      {
        preventDefault() {},
        target: form(),
        submitter: form().querySelector('button[type="submit"]'),
      },
      id,
    ),
  );
  add(
    "ADD_LOCAL",
    baseline ||
      (added.rootRetained &&
        added.formRetained &&
        added.attendanceRowsRetained === 250 &&
        added.scoreRowsRetained === beforeAdd &&
        added.removedScoreRows === 0),
    added,
  );
  add(
    "ADD_ZERO_AND_RESET",
    getSessionById(id).scores.length === beforeAdd + 1 &&
      getSessionById(id).scores.at(-1).value === 0 &&
      form().elements.value.value === "0.25" &&
      form().elements.note.value === "" &&
      document.activeElement === form().elements.value,
    {
      count: getSessionById(id).scores.length,
      value: form().elements.value.value,
      note: form().elements.note.value,
    },
  );
  setEntry();
  form().elements.note.focus();
  form().elements.note.setSelectionRange(2, 8);
  const beforeRemove = getSessionById(id).scores.length;
  const removed = await measure(() => removeSessionScore(id, 3));
  add(
    "REMOVE_LOCAL",
    baseline ||
      (removed.rootRetained &&
        removed.formRetained &&
        removed.attendanceRowsRetained === 250 &&
        removed.scoreRowsRetained === beforeRemove - 1 &&
        removed.removedScoreRows === 1 &&
        removed.focusRetained &&
        removed.selectionRetained &&
        removed.scrollRetained),
    removed,
  );
  add(
    "REMOVE_INPUTS_AND_COUNT",
    removed.entryRetained &&
      removed.searchRetained &&
      getSessionById(id).scores.length === beforeRemove - 1 &&
      body.querySelectorAll(".session-score-table tbody tr").length ===
        beforeRemove - 1,
    {
      entryRetained: removed.entryRetained,
      scoreCount: getSessionById(id).scores.length,
    },
  );
  add(
    "DELETE_INDICES",
    [
      ...body.querySelectorAll('[data-legacy-click="sessions-dialog:12"]'),
    ].every(
      (button, index) => Number(button.dataset.legacyClickArg6) === index,
    ),
    {
      count: body.querySelectorAll('[data-legacy-click="sessions-dialog:12"]')
        .length,
    },
  );
  // A successful save must not reset a newer draft or steal focus from a panel
  // selected while the write is pending. This exercises the awaited boundary.
  setEntry();
  const changed = await measure(async () => {
    const currentForm = form();
    const saving = addSessionScore(
      { preventDefault() {}, target: currentForm },
      id,
    );
    currentForm.elements.value.value = "0.75";
    currentForm.elements.note.value = "Newer draft while save is pending";
    showSessionPanel("attendance");
    body.querySelector(".session-attendance-search input").focus();
    await saving;
  });
  add(
    "PENDING_DRAFT_AND_PANEL",
    form().elements.value.value === "0.75" &&
      form().elements.note.value === "Newer draft while save is pending" &&
      !body.querySelector('[data-session-panel="attendance"]').hidden &&
      (baseline ||
        document.activeElement ===
          body.querySelector(".session-attendance-search input")),
    {
      ...changed,
      liveValue: form().elements.value.value,
      liveNote: form().elements.note.value,
      attendanceVisible: !body.querySelector(
        '[data-session-panel="attendance"]',
      ).hidden,
    },
  );

  // Write failure replaces the live data model with its durable snapshot. The
  // retained rows must rebind to that snapshot before either retry or deletion.
  showSessionPanel("activity");
  setEntry();
  form().elements.type.value = "classGrade";
  form().elements.value.value = "17";
  form().elements.note.value = "Synthetic retry after rollback";
  const beforeFailedAdd = getSessionById(id),
    addCount = beforeFailedAdd.scores.length;
  let addError = "";
  EduV24.test.failNextWrite();
  const failedAdd = await measure(async () => {
    try {
      await addSessionScore({ preventDefault() {}, target: form() }, id);
    } catch (error) {
      addError = error.message;
    }
  });
  add(
    "ADD_ROLLBACK",
    !!addError &&
      beforeFailedAdd !== getSessionById(id) &&
      getSessionById(id).scores.length === addCount &&
      failedAdd.rootRetained &&
      failedAdd.formRetained &&
      failedAdd.scoreRowsRetained === addCount &&
      failedAdd.entryRetained &&
      !form().elements.value.disabled &&
      !!body.querySelector(
        '[data-modal-save-feedback][data-state="error"]:not([hidden])',
      ),
    {
      ...failedAdd,
      addError,
      modelReplaced: beforeFailedAdd !== getSessionById(id),
    },
  );
  const retryAdd = await measure(() =>
    addSessionScore({ preventDefault() {}, target: form() }, id),
  );
  add(
    "ADD_RETRY",
    getSessionById(id).scores.filter(
      (score) =>
        score.note === "Synthetic retry after rollback" && score.value === 17,
    ).length === 1 &&
      getSessionById(id).scores.length === addCount + 1 &&
      body.querySelectorAll(".session-score-table tbody tr").length ===
        addCount + 1 &&
      (baseline ||
        (retryAdd.rootRetained &&
          retryAdd.formRetained &&
          retryAdd.scoreRowsRetained === addCount)),
    retryAdd,
  );

  setEntry();
  const beforeFailedDelete = getSessionById(id),
    deleteCount = beforeFailedDelete.scores.length,
    scoreList = JSON.stringify(beforeFailedDelete.scores),
    victim = structuredClone(beforeFailedDelete.scores[3]),
    survivor = structuredClone(beforeFailedDelete.scores[4]),
    staleDeletedButton = body.querySelectorAll(
      '[data-legacy-click="sessions-dialog:12"]',
    )[3],
    survivingButton = body.querySelectorAll(
      '[data-legacy-click="sessions-dialog:12"]',
    )[4];
  let deleteError = "";
  EduV24.test.failNextWrite();
  const failedDelete = await measure(async () => {
    try {
      await removeSessionScore(id, 3);
    } catch (error) {
      deleteError = error.message;
    }
  });
  add(
    "DELETE_ROLLBACK",
    !!deleteError &&
      beforeFailedDelete !== getSessionById(id) &&
      JSON.stringify(getSessionById(id).scores) === scoreList &&
      failedDelete.rootRetained &&
      failedDelete.formRetained &&
      failedDelete.scoreRowsRetained === deleteCount &&
      failedDelete.entryRetained,
    {
      ...failedDelete,
      deleteError,
      modelReplaced: beforeFailedDelete !== getSessionById(id),
    },
  );
  const retryDelete = await measure(() => removeSessionScore(id, 3));
  add(
    "DELETE_RETRY",
    !getSessionById(id).scores.some(
      (score) => JSON.stringify(score) === JSON.stringify(victim),
    ) &&
      getSessionById(id).scores.length === deleteCount - 1 &&
      (baseline ||
        (retryDelete.rootRetained &&
          retryDelete.formRetained &&
          retryDelete.scoreRowsRetained === deleteCount - 1)),
    retryDelete,
  );
  staleDeletedButton.click();
  await settle();
  add(
    "REMOVED_BUTTON_CANNOT_DELETE_AGAIN",
    !staleDeletedButton.isConnected &&
      getSessionById(id).scores.length === deleteCount - 1,
    {
      connected: staleDeletedButton.isConnected,
      count: getSessionById(id).scores.length,
    },
  );
  const renumbered = body.querySelectorAll(
    '[data-legacy-click="sessions-dialog:12"]',
  )[3];
  const shiftedDelete = await measure(async () => {
    renumbered.click();
    await wait(
      () =>
        getSessionById(id).scores.length === deleteCount - 2 &&
        EduV24.test.getState().busy === 0,
    );
  });
  add(
    "SHIFTED_BUTTON_DELETES_CORRECT_SCORE",
    !getSessionById(id).scores.some(
      (score) => JSON.stringify(score) === JSON.stringify(survivor),
    ) &&
      Number(renumbered.dataset.legacyClickArg6) === 3 &&
      (baseline || survivingButton === renumbered),
    {
      ...shiftedDelete,
      originalButtonRetained: survivingButton === renumbered,
    },
  );
  // Empty -> first record -> empty must not replace the roster or form either.
  closeModal();
  openSessionModal(getSessionById(audit.ids.previous));
  await globalThis.__unlockRecordedSessionForAudit(audit.ids.previous);
  showSessionPanel("activity");
  setEntry();
  const first = await measure(() =>
    addSessionScore(
      { preventDefault() {}, target: form() },
      audit.ids.previous,
    ),
  );
  add(
    "FIRST_ACTIVITY_LOCAL",
    baseline ||
      (first.rootRetained &&
        first.formRetained &&
        first.attendanceRowsRetained === 250),
    first,
  );
  add(
    "FIRST_ACTIVITY_TABLE",
    !body.querySelector(".session-activity-records .empty") &&
      body.querySelectorAll(".session-score-table tbody tr").length === 1 &&
      [...body.querySelectorAll(".session-score-table tbody td")].every(
        (cell) => !!cell.dataset.label,
      ),
    { rows: body.querySelectorAll(".session-score-table tbody tr").length },
  );
  const newDelete = body.querySelector(
    '[data-legacy-click="sessions-dialog:12"]',
  );
  add(
    "NEW_ROW_EDITABLE",
    newDelete.dataset.mutating === "1" && !newDelete.disabled,
    { mutating: newDelete.dataset.mutating, disabled: newDelete.disabled },
  );
  body.querySelector("[data-session-edit-control]").click();
  let viewDeleteRejected = false;
  try {
    await removeSessionScore(audit.ids.previous, 0);
  } catch {
    viewDeleteRejected = true;
  }
  add(
    "NEW_ROW_READONLY_LOCK",
    newDelete.disabled &&
      viewDeleteRejected &&
      getSessionById(audit.ids.previous).scores.length === 1 &&
      body.querySelector(".session-workspace").dataset.sessionMode === "view",
    { disabled: newDelete.disabled, rejected: viewDeleteRejected },
  );
  await globalThis.__unlockRecordedSessionForAudit(audit.ids.previous);
  setEntry();
  const last = await measure(() => removeSessionScore(audit.ids.previous, 0));
  add(
    "LAST_ACTIVITY_LOCAL",
    baseline ||
      (last.rootRetained &&
        last.formRetained &&
        last.attendanceRowsRetained === 250 &&
        last.entryRetained),
    last,
  );
  add(
    "EMPTY_ACTIVITY",
    !!body.querySelector(".session-activity-records .empty") &&
      !body.querySelector(".session-score-table") &&
      getSessionById(audit.ids.previous).scores.length === 0,
    { empty: !!body.querySelector(".session-activity-records .empty") },
  );
  const tx = EduV24.test.getConnection().transaction("records", "readonly"),
    done = EduDataStoreRuntime.transactionDone(tx);
  const stored = await Promise.all(
    [id, audit.ids.previous].map((sessionId) =>
      EduDataStoreRuntime.requestPromise(
        tx
          .objectStore("records")
          .get(audit.ids.workspace + "|session:" + sessionId),
      ),
    ),
  );
  await done;
  add(
    "DURABLE_SESSION_MATCH",
    stored.every(
      (record, index) =>
        JSON.stringify(record.value) ===
        JSON.stringify(getSessionById([id, audit.ids.previous][index])),
    ),
    { records: stored.length },
  );
  return audit.cases;
}

async function viewportFlow({ baseline, width }) {
  const audit = globalThis.__sessionLocalAudit,
    body = document.getElementById("modalBody");
  closeModal();
  openSessionModal(getSessionById(audit.ids.session));
  await globalThis.__unlockRecordedSessionForAudit(audit.ids.session);
  await EduV24.test.settle();
  for (let frame = 0; frame < 4; frame++)
    await new Promise(requestAnimationFrame);
  const root = body.querySelector(".session-workspace"),
    form = body.querySelector(".session-entry-form"),
    rows = [...body.querySelectorAll(".att-row")],
    search = body.querySelector(".session-attendance-search input");
  form.elements.note.value = "Viewport unfinished input " + width;
  search.value = "student 250";
  filterSessionAttendance(search);
  search.focus({ preventScroll: true });
  search.setSelectionRange(2, 7);
  const focusedBeforeWrite = document.activeElement === search;
  await setAllAttendance(width === 768 ? "present" : "absent");
  await EduV24.test.settle();
  for (let frame = 0; frame < 4; frame++)
    await new Promise(requestAnimationFrame);
  const current = body.querySelector(".session-workspace"),
    currentForm = body.querySelector(".session-entry-form");
  const observed = {
    width,
    focusedBeforeWrite,
    rootRetained: root === current,
    formRetained: form === currentForm,
    rowsRetained: rows.filter((row) => row.isConnected).length,
    focusRetained: document.activeElement === search,
    focusedAfterWrite: {
      tag: document.activeElement.tagName,
      name: document.activeElement.getAttribute("name"),
      action:
        document.activeElement.dataset.workspaceAction ||
        document.activeElement.dataset.legacyClick ||
        null,
    },
    searchDisabled: search.disabled,
    searchVisible: search.getClientRects().length > 0,
    caretRetained: search.selectionStart === 2 && search.selectionEnd === 7,
    inputRetained:
      currentForm.elements.note.value === "Viewport unfinished input " + width,
    visibleRows: [...body.querySelectorAll(".att-row")].filter(
      (row) => !row.hidden,
    ).length,
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    noModalOverflow: body.scrollWidth <= body.clientWidth + 1,
    noEditorOverflow: current.scrollWidth <= current.clientWidth + 1,
  };
  return {
    id: "LOCAL_SESSION_VIEWPORT_" + width,
    name: "Attendance updates preserve editing context and layout at " + width,
    pass:
      observed.inputRetained &&
      observed.visibleRows === 1 &&
      observed.noPageOverflow &&
      observed.noModalOverflow &&
      observed.noEditorOverflow &&
      (baseline ||
        (observed.rootRetained &&
          observed.formRetained &&
          observed.rowsRetained === 250 &&
          observed.focusRetained &&
          observed.caretRetained)),
    observed,
  };
}

async function run(env) {
  const { evaluate, cases, cdp, delay } = env,
    baseline = process.argv.includes("--baseline");
  await require("./browser-ready.cjs")(env);
  try {
    await evaluate("(" + setup.toString() + ")()");
    cases.push(
      ...(await evaluate("(" + flow.toString() + ")(" + baseline + ")")),
    );
    for (const width of [390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 850,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await delay(80);
      cases.push(
        await evaluate(
          "(" +
            viewportFlow.toString() +
            ")(" +
            JSON.stringify({ baseline, width }) +
            ")",
        ),
      );
    }
  } finally {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate(
      "(async()=>{const audit=globalThis.__sessionLocalAudit;if(audit)await audit.restore(audit.original);delete globalThis.__sessionLocalAudit;})()",
    );
  }
}
module.exports = { run };
if (require.main === module)
  require("./data-integrity.cjs")
    .main({
      stage: "session-local-render",
      runExtra: run,
    })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
