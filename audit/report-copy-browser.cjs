"use strict";

// Genuine two-window regression. Only data-integrity's temporary browser
// profile is used, and clipboard delivery is replaced with an in-page spy.
async function reportCopyFlow() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    ids = {
      school: "copy_guard_school",
      classroom: "copy_guard_class",
      lesson: "copy_guard_lesson",
      module: "copy_guard_module",
      unit: "copy_guard_unit",
      student: "copy_guard_student",
      session: "copy_guard_session",
    },
    wait = async (predicate, message) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(message || "Report-copy browser regression timed out");
    },
    activityButton = async () => {
      closeModal();
      goReports();
      state.reportTab = "comprehensive";
      resetGlobalFilters();
      await wait(() =>
        document.querySelector(
          '[data-legacy-click="reports-comprehensive:20"]',
        ),
      );
      return document.querySelector(
        '[data-legacy-click="reports-comprehensive:20"]',
      );
    },
    lessonButton = async () => {
      closeModal();
      goReports();
      state.reportTab = "lessonReport";
      lessonReportFilter = {
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
      };
      render();
      await wait(() =>
        document.querySelector('[data-legacy-click="reports-lesson:3"]'),
      );
      return document.querySelector('[data-legacy-click="reports-lesson:3"]');
    },
    sessionButton = () => {
      closeModal();
      openSessionModal(getSessionById(ids.session));
      return document.querySelector('[data-legacy-click="sessions-dialog:13"]');
    },
    copy = async (button) => {
      if (!button || button.disabled)
        throw Error("The actual report copy button is missing or disabled");
      const previous = window.__eduCopyGuardResults.length;
      button.click();
      await wait(
        () => window.__eduCopyGuardResults.length > previous,
        "The report copy handler did not settle",
      );
      return window.__eduCopyGuardResults.at(-1);
    };
  try {
    closeModal();
    await EduV24.test.settle();
    const snapshot = await EduV24.snapshotInstallation(),
      occupiedYears = new Set(
        snapshot.stores.catalog.map((period) => period.year),
      );
    let firstYear = 1493;
    while (occupiedYears.has(firstYear + "-" + (firstYear + 1))) firstYear++;
    const year = firstYear + "-" + (firstYear + 1);
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const pupils = [
      { id: ids.student, name: "COPY_GUARD_STUDENT", code: "001" },
      {
        id: ids.student + "_present",
        name: "COPY_GUARD_PRESENT_PRIVATE",
        code: "002",
      },
      { id: ids.student + "_late", name: "COPY_GUARD_LATE", code: "003" },
      {
        id: ids.student + "_leave",
        name: "COPY_GUARD_LEAVE <em>ESCAPE</em>",
        code: "004",
      },
      { id: ids.student + "_unknown", name: "COPY_GUARD_UNKNOWN", code: "005" },
    ];
    db = EduV24.normalizeDB({
      ...defaultDB(),
      settings: {
        ...db.settings,
        password: "",
        academicYear: year,
        academicTerm: "اول",
      },
      schools: [
        {
          id: ids.school,
          name: "COPY_GUARD_SCHOOL",
          classes: [
            {
              id: ids.classroom,
              name: "COPY_GUARD_CLASS",
              students: pupils.map((student) => ({ ...student })),
              archivedStudents: [],
              lessons: [
                {
                  id: ids.lesson,
                  name: "COPY_GUARD_LESSON",
                  teacher: "COPY_GUARD_TEACHER",
                  gradeMode: "standard",
                  weightMostamar: 40,
                  weightPayani: 60,
                  kardaneshScores: {},
                  poudmans: [
                    {
                      id: ids.module,
                      name: "COPY_GUARD_MODULE",
                      units: [
                        {
                          id: ids.unit,
                          name: "COPY_GUARD_UNIT",
                          unitScores: {},
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
      sessions: [
        {
          id: ids.session,
          schoolId: ids.school,
          classId: ids.classroom,
          lessonId: ids.lesson,
          date: EduAcademicYear.range(year).start,
          period: 0,
          poudmanId: ids.module,
          unitId: ids.unit,
          roster: pupils.map((student) => ({ ...student })),
          attendance: {
            [ids.student]: "absent",
            [ids.student + "_present"]: "present",
            [ids.student + "_late"]: "late:10",
            [ids.student + "_leave"]: "leave",
          },
          scores: [
            {
              studentId: ids.student,
              type: "classGrade",
              value: 18,
              note: "COPY_GUARD_ACTIVITY",
            },
          ],
        },
      ],
      masterSchedule: {},
      migrationWarnings: [],
    });
    db.sessions.push({
      ...structuredClone(db.sessions[0]),
      id: ids.session + "_unrelated",
      period: 1,
      scores: [],
    });
    const scheduledDay = getDayIdxFromDate(db.sessions[0].date);
    db.activeDays = [
      ...new Set([...(db.activeDays || [0, 1, 2, 3, 4, 5]), scheduledDay]),
    ];
    for (const period of [0, 1])
      db.masterSchedule[scheduledDay + "-" + period + "-all"] = {
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
      };
    await saveDB({ action: "Synthetic two-window report-copy fixture" });
    window.__eduCopyGuardCalls = [];
    window.__eduCopyGuardResults = [];
    const originalCopy = EduV24.copyReport;
    EduV24.copyReport = (...args) =>
      Promise.resolve(originalCopy(...args)).then((result) => {
        window.__eduCopyGuardResults.push(result);
        return result;
      });
    copyToClipboard = (text, button, html) => {
      window.__eduCopyGuardCalls.push({
        text,
        html: html || "",
        route: button?.getAttribute("data-legacy-click"),
      });
    };

    for (const [index, route, button] of [
      [1, "activity", activityButton],
      [2, "lesson", lessonButton],
      [3, "session", sessionButton],
    ]) {
      const before = window.__eduCopyGuardCalls.length,
        result = await copy(await button()),
        delivery = window.__eduCopyGuardCalls.at(-1);
      check(
        "COPY_GUARD0" + index,
        "the actual " + route + " copy button delivers an authorized report",
        result === true &&
          window.__eduCopyGuardCalls.length === before + 1 &&
          delivery.text.includes("COPY_GUARD_STUDENT") &&
          delivery.text.includes("COPY_GUARD_LESSON"),
        { route: delivery?.route, result },
      );
    }

    const sessionDelivery = window.__eduCopyGuardCalls.at(-1),
      deputyText = sessionDelivery?.text || "",
      deputyHTML = sessionDelivery?.html || "",
      rich = document.createElement("div");
    rich.innerHTML = deputyHTML;
    check(
      "COPY_FORMAT01",
      "the session button delivers the shared deputy attendance format without present names or academic activities",
      deputyText.startsWith("📋 گزارش کلی برای معاون\n") &&
        deputyText.includes("مدرسه: COPY_GUARD_SCHOOL") &&
        deputyText.includes("سال تحصیلی: " + year) &&
        deputyText.includes("ترم: اول") &&
        deputyText.includes("🟢 حاضر: ۲ نفر") &&
        deputyText.includes("🔴 غایب (۱): COPY_GUARD_STUDENT") &&
        deputyText.includes("🟠 تأخیر (۱): COPY_GUARD_LATE (۱۰ دقیقه)") &&
        deputyText.includes("🟣 مرخصی (۱): COPY_GUARD_LEAVE <em>ESCAPE</em>") &&
        deputyText.includes("⚪ تعیین‌نشده (۱): COPY_GUARD_UNKNOWN") &&
        deputyText.includes("تعیین‌نشده به معنی غیبت نیست") &&
        !deputyText.includes("COPY_GUARD_PRESENT_PRIVATE") &&
        !deputyText.includes("COPY_GUARD_ACTIVITY") &&
        !deputyText.includes("نمره کلاسی") &&
        (deputyText.match(/تاریخ:/g) || []).length === 1,
      { route: sessionDelivery?.route, text: deputyText },
    );
    const boldLabels = [...rich.querySelectorAll("strong")].map(
      (node) => node.textContent,
    );
    check(
      "COPY_FORMAT02",
      "the session button supplies rich RTL attendance labels and escapes names for the clipboard",
      !!rich.querySelector('div[dir="rtl"]') &&
        ["حاضر", "غایب", "تأخیر", "مرخصی", "تعیین‌نشده"].every((label) =>
          boldLabels.includes(label),
        ) &&
        deputyHTML.includes("&lt;em&gt;ESCAPE&lt;/em&gt;") &&
        !rich.querySelector("em") &&
        !deputyHTML.includes("COPY_GUARD_ACTIVITY") &&
        rich.textContent === deputyText.replace(/\n/g, ""),
      { hasHTML: !!deputyHTML, boldLabels },
    );
    const reportFilters = { ...EduPeriodicReports.filters };
    try {
      Object.assign(EduPeriodicReports.filters, {
        mode: "annual",
        schoolId: "UNRELATED_SCHOOL",
        classId: "UNRELATED_CLASS",
        studentId: "UNRELATED_STUDENT",
        audience: "parent",
        date: "2027-01-01",
      });
      const selectedFilters = JSON.stringify(EduPeriodicReports.filters),
        before = window.__eduCopyGuardCalls.length,
        result = await copy(sessionButton()),
        isolated = window.__eduCopyGuardCalls.at(-1);
      check(
        "COPY_FORMAT03",
        "session deputy copy ignores unrelated report filters and excludes the other stored session",
        result === true &&
          window.__eduCopyGuardCalls.length === before + 1 &&
          isolated.text === deputyText &&
          isolated.html === deputyHTML &&
          JSON.stringify(EduPeriodicReports.filters) === selectedFilters &&
          (isolated.text.match(/تاریخ:/g) || []).length === 1 &&
          !isolated.text.includes("UNRELATED_"),
        { result, route: isolated?.route },
      );
    } finally {
      Object.assign(EduPeriodicReports.filters, reportFilters);
    }
    // Keep only synthetic fixture helpers for the second phase. The Node
    // wrapper creates a genuine peer target without depending on popup policy.
    window.__eduCopyGuard = {
      ids,
      wait,
      activityButton,
      lessonButton,
      sessionButton,
      copy,
      periodId: EduV24.getReportContext().id,
      beforeRevision: EduV24.getReportContext().revision,
    };
  } catch (error) {
    check(
      "COPY_GUARD99",
      "report-copy fixture and allowed copies completed",
      false,
      {
        error: error.stack || error.message,
      },
    );
  }
  return cases;
}

async function staleReportCopyFlow(peer) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    {
      ids,
      wait,
      activityButton,
      lessonButton,
      sessionButton,
      copy,
      periodId,
      beforeRevision,
    } = window.__eduCopyGuard;
  try {
    await wait(
      () => EduV24.getReportContext().blocked,
      "The primary window did not receive the real revision broadcast",
    );
    check(
      "COPY_GUARD04",
      "a genuine peer save changes absent to present and invalidates the primary revision",
      peer.attendance === "present" &&
        peer.periodId === periodId &&
        peer.revision > beforeRevision &&
        getSessionById(ids.session).attendance[ids.student] === "absent" &&
        EduV24.getReportContext().blocked,
      {
        originalRevision: beforeRevision,
        peerRevision: peer.revision,
        primaryBlocked: EduV24.getReportContext().blocked,
      },
    );
    for (const [index, route, button] of [
      [5, "session", sessionButton],
      [6, "activity", activityButton],
      [7, "lesson", lessonButton],
    ]) {
      const before = window.__eduCopyGuardCalls.length,
        result = await copy(await button());
      check(
        "COPY_GUARD0" + index,
        "the actual stale " + route + " button cannot deliver old report data",
        result === false && window.__eduCopyGuardCalls.length === before,
        { result, delivered: window.__eduCopyGuardCalls.length - before },
      );
    }
  } catch (error) {
    check("COPY_GUARD99", "two-window report-copy flow completed", false, {
      error: error.stack || error.message,
    });
  }
  return cases;
}

async function connectPeer(cdp, ws, url) {
  const target = await cdp("Target.createTarget", { url, newWindow: true }),
    port = new URL(ws.url).port;
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    const targets = await (
      await fetch("http://127.0.0.1:" + port + "/json")
    ).json();
    page = targets.find((candidate) => candidate.id === target.targetId);
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!page) {
    await cdp("Target.closeTarget", { targetId: target.targetId });
    throw Error("The peer debugging target did not become available");
  }
  const socket = new WebSocket(page.webSocketDebuggerUrl),
    pending = new Map();
  try {
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
  } catch (error) {
    socket.close();
    await cdp("Target.closeTarget", { targetId: target.targetId });
    throw error;
  }
  let sequence = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data),
      request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.error
      ? request.reject(Error(JSON.stringify(message.error)))
      : request.resolve(message.result);
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("Peer browser timeout: " + method));
        }, 25000);
      timer.unref();
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return {
    async evaluate(expression) {
      const result = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    async close() {
      socket.close();
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(Error("Peer browser closed"));
      }
      pending.clear();
      await cdp("Target.closeTarget", { targetId: target.targetId });
    },
  };
}

async function run({ cdp, evaluate, cases, delay, ws }) {
  const reloadReady = require("./browser-ready.cjs"),
    environment = { cdp, evaluate, delay };
  await reloadReady(environment);
  const original = await evaluate("EduV24.snapshotInstallation()");
  let peer;
  try {
    const prepared = await evaluate("(" + reportCopyFlow.toString() + ")()");
    cases.push(...prepared);
    if (prepared.some((result) => !result.pass)) return;
    const fixture = await evaluate(
      "({url:location.href,periodId:window.__eduCopyGuard.periodId,sessionId:window.__eduCopyGuard.ids.session,studentId:window.__eduCopyGuard.ids.student})",
    );
    peer = await connectPeer(cdp, ws, fixture.url);
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      ready = await peer.evaluate(
        "!!globalThis.EduV24?.getReportContext?.().ready",
      );
      if (ready) break;
      await delay(25);
    }
    if (!ready) throw Error("The genuine peer window did not become ready");
    await require("./session-edit-test-helpers.cjs").installSessionEditTestHelper(
      (expression) => peer.evaluate(expression),
    );
    const changed = await peer.evaluate(
      "(async()=>{const expected=" +
        JSON.stringify(fixture) +
        ";if(EduV24.getReportContext().id!==expected.periodId)throw Error('Peer loaded a different academic term');openSessionModal(getSessionById(expected.sessionId));await globalThis.__unlockRecordedSessionForAudit(expected.sessionId);await setAllAttendance('present');return {periodId:EduV24.getReportContext().id,revision:EduV24.getReportContext().revision,attendance:getSessionById(expected.sessionId).attendance[expected.studentId]};})()",
    );
    cases.push(
      ...(await evaluate(
        "(" +
          staleReportCopyFlow.toString() +
          ")(" +
          JSON.stringify(changed) +
          ")",
      )),
    );
  } finally {
    // The stale primary cannot restore safely until its peer has closed and a
    // fresh execution context has loaded the actual committed revision.
    if (peer) await peer.close();
    await reloadReady(environment);
    await evaluate(
      "(async()=>{closeModal();EduV24.previewFullBackup(" +
        JSON.stringify(original) +
        ");document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup();await EduV24.test.settle();})()",
    );
  }
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "guarded-report-copy-two-windows", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
