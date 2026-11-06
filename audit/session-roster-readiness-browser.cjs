"use strict";

const { main } = require("./data-integrity.cjs"),
  { seedReminders } = require("./attendance-reminders-browser.cjs");

// All fixtures live in the isolated audit profile. Restore the original full
// installation even if a native browser assertion or production action fails.
async function run({ cdp, evaluate, cases, delay }) {
  const check = (id, pass, observed) =>
      cases.push({
        id: "SESSION_ROSTER_" + id,
        name: id,
        pass: !!pass,
        observed,
      }),
    page = (fn, value = null) =>
      evaluate("(" + fn.toString() + ")(" + JSON.stringify(value) + ")"),
    wait = async (expression) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error("Session roster readiness wait: " + expression);
    },
    click = (selector) =>
      evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    signature = () =>
      evaluate(`(async()=>{
        const snapshot=await EduV24.snapshotInstallation();
        return JSON.stringify({data:db,stores:snapshot.stores,reportDrafts:snapshot.reportDrafts,gradeDrafts:snapshot.gradeDrafts});
      })()`),
    restore = (backup) =>
      page(async (backup) => {
        closeModal();
        EduV24.previewFullBackup(backup);
        document.getElementById("fullRestoreConfirmed").checked = true;
        await EduV24.restoreFullBackup();
        goSchools();
      }, backup),
    resetFeedback = () =>
      evaluate(`(()=>{
        globalThis.__sessionRosterAudit.alerts.length=0;
        globalThis.__sessionRosterAudit.confirmations.length=0;
      })()`);

  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  await evaluate(`(()=>{
    globalThis.__sessionRosterOriginalAlert=window.alert;
    globalThis.__sessionRosterOriginalConfirm=window.confirm;
    globalThis.__sessionRosterAudit={alerts:[],confirmations:[],accept:true};
    window.alert=message=>globalThis.__sessionRosterAudit.alerts.push(String(message));
    window.confirm=message=>{
      globalThis.__sessionRosterAudit.confirmations.push(String(message));
      return globalThis.__sessionRosterAudit.accept;
    };
  })()`);
  try {
    await evaluate("(" + seedReminders.toString() + ")()");
    const fixture = await evaluate("EduV24.snapshotInstallation()"),
      prior = await evaluate("globalThis.__attendanceFixture.date"),
      historyDate = await evaluate("globalThis.__attendanceFixture.prior"),
      students = fixture.stores.records.find(
        (row) => row.logical === "class:reminder-class",
      ).value.students,
      prepare = (kind) => {
        const backup = structuredClone(fixture);
        backup.stores.records = backup.stores.records.filter(
          (row) => !row.logical.startsWith("session:"),
        );
        for (const row of backup.stores.records)
          if (row.logical === "class:reminder-class") {
            row.value.students =
              kind === "active" ? structuredClone(students) : [];
            row.value.archivedStudents =
              kind === "archived" ? structuredClone(students) : [];
          }
        return backup;
      };

    for (const kind of ["empty", "archived"]) {
      await restore(prepare(kind));
      await resetFeedback();
      await evaluate(
        "state.view='master';render();openMasterConfig(todayIdx(),0)",
      );
      const configBefore = await signature();
      await click('[data-legacy-click="schedule-timetable:18"]');
      await wait("globalThis.__sessionRosterAudit.alerts.length>0");
      check(
        kind.toUpperCase() + "_SCHEDULE_DENIED",
        configBefore === (await signature()) &&
          (await evaluate(
            "globalThis.__sessionRosterAudit.alerts.some(message=>message.includes('هنرجو'))&&!!document.getElementById('cfgAllClass')",
          )),
        await evaluate("globalThis.__sessionRosterAudit.alerts"),
      );

      await evaluate(
        "closeModal();goSchool('reminder-school');goClass('reminder-class');goLesson('reminder-lesson');setTab('sessions')",
      );
      await resetFeedback();
      await evaluate(`(()=>{
        const form=document.querySelector('.session-create-form');
        form.elements.date.value=todayISO();refreshSessionDateSchedule();
        form.elements.period.value='2';form.requestSubmit();
      })()`);
      await wait(
        "!!document.querySelector('.session-create .session-validation-alert')",
      );
      const manualBefore = await signature();
      check(
        kind.toUpperCase() + "_MANUAL_SESSION_DENIED",
        configBefore === manualBefore &&
          (await evaluate(
            "db.sessions.length===0&&document.querySelector('.session-create .session-validation-alert').textContent.includes('هنرجو')&&!document.querySelector('#modal:not(.hidden) .session-workspace')",
          )),
      );

      await evaluate(
        "state.view='master';render();clickMasterCell(todayIdx(),0)",
      );
      await resetFeedback();
      await click('[data-legacy-click="schedule-timetable:15"]');
      await wait(
        "!!document.querySelector('.session-start-panel .session-validation-alert')",
      );
      check(
        kind.toUpperCase() + "_WEEKLY_SESSION_DENIED",
        configBefore === (await signature()) &&
          (await evaluate(
            "db.sessions.length===0&&document.querySelector('.session-start-panel .session-validation-alert').textContent.includes('هنرجو')&&globalThis.__sessionRosterAudit.confirmations.length===0",
          )),
      );

      await evaluate("closeModal();goSchools()");
      await resetFeedback();
      await click('[data-legacy-click="today-agenda"][data-period="0"]');
      await wait(
        "!!document.querySelector('.today-agenda-row .session-validation-alert')",
      );
      check(
        kind.toUpperCase() + "_TODAY_SESSION_DENIED",
        configBefore === (await signature()) &&
          (await evaluate(
            "db.sessions.length===0&&document.querySelector('.today-agenda-row .session-validation-alert').textContent.includes('هنرجو')",
          )),
      );
    }

    const recovery = prepare("active"),
      makeSession = (id, date, roster, attendance = {}) => ({
        id,
        schoolId: "reminder-school",
        classId: "reminder-class",
        lessonId: "reminder-lesson",
        date,
        period: 1,
        roster,
        attendance,
        scores: [],
        poudmanId: null,
        unitId: null,
      });
    for (const session of [
      makeSession("readiness-empty", prior, []),
      makeSession("readiness-history", historyDate, [students[0]], {
        [students[0].id]: "present",
      }),
    ])
      recovery.stores.records.push({
        key: "reminder-first|session:" + session.id,
        workspace: "reminder-first",
        logical: "session:" + session.id,
        value: session,
      });
    await restore(recovery);
    await resetFeedback();
    const recoveryBefore = await signature();
    await evaluate("openSessionModal(getSessionById('readiness-empty'))");
    check(
      "EMPTY_SESSION_OPEN_NEVER_WRITES",
      recoveryBefore === (await signature()) &&
        (await evaluate(
          "document.querySelector('.session-workspace').dataset.sessionMode==='view'&&document.querySelector('.session-attendance-list .empty [data-workspace-action=session-restore-roster][data-key=readiness-empty][data-mutating=\"1\"]').disabled",
        )),
    );
    await click("[data-workspace-action=session-toggle-edit]");
    check(
      "UNLOCK_OFFERS_EXPLICIT_RECOVERY_WITHOUT_WRITING",
      recoveryBefore === (await signature()) &&
        (await evaluate(
          "document.querySelector('.session-workspace').dataset.sessionMode==='edit'&&!document.querySelector('[data-workspace-action=session-restore-roster]').disabled&&getSessionById('readiness-empty').roster.length===0",
        )),
    );

    for (const width of [320, 390, 768, 1024, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const observed = await evaluate(`(()=>{
        const button=document.querySelector('[data-workspace-action=session-restore-roster]'),root=document.querySelector('.session-workspace'),b=button.getBoundingClientRect(),r=root.getBoundingClientRect();
        return {inside:b.left>=r.left-1&&b.right<=r.right+1,width:b.width,height:b.height,overflow:document.getElementById('modalBody').scrollWidth>document.getElementById('modalBody').clientWidth+1};
      })()`);
      check(
        "RECOVERY_LAYOUT_" + width,
        observed.inside &&
          observed.width > 0 &&
          observed.height > 0 &&
          !observed.overflow,
        observed,
      );
    }

    await evaluate("globalThis.__sessionRosterAudit.accept=false");
    await click("[data-workspace-action=session-restore-roster]");
    await wait("globalThis.__sessionRosterAudit.confirmations.length===1");
    check(
      "CANCEL_RECOVERY_LEAVES_ALL_STORES_UNCHANGED",
      recoveryBefore === (await signature()) &&
        (await evaluate("getSessionById('readiness-empty').roster.length===0")),
    );
    await evaluate("globalThis.__sessionRosterAudit.accept=true");
    await click("[data-workspace-action=session-restore-roster]");
    await wait(
      "getSessionById('readiness-empty').roster.length===2&&!EduV24.test.getState().busy&&document.querySelectorAll('.att-btns').length===2",
    );
    check(
      "CONFIRMED_RECOVERY_PERSISTS_ONLY_CURRENT_ACTIVE_SNAPSHOT",
      await evaluate(`(async()=>{
        const snapshot=await EduV24.snapshotInstallation(),row=snapshot.stores.records.find(record=>record.workspace==='reminder-first'&&record.logical==='session:readiness-empty'),session=row.value;
        return JSON.stringify(session.roster)===JSON.stringify(getClassObj('reminder-school','reminder-class').students)&&Object.keys(session.attendance).length===0&&session.scores.length===0&&session.poudmanId===null&&session.unitId===null&&document.querySelector('.session-workspace').dataset.sessionMode==='edit'&&!document.querySelector('[data-workspace-action=session-restore-roster]')&&globalThis.__sessionRosterAudit.confirmations.length===2;
      })()`),
    );
    check(
      "RECOVERY_NEVER_REWRITES_OTHER_RECORDS",
      await page(async (before) => {
        const snapshot = await EduV24.snapshotInstallation(),
          otherRecords = (records) =>
            records.filter(
              (row) =>
                row.workspace !== "reminder-first" ||
                row.logical !== "session:readiness-empty",
            );
        return (
          JSON.stringify(otherRecords(snapshot.stores.records)) ===
          JSON.stringify(otherRecords(before))
        );
      }, JSON.parse(recoveryBefore).stores.records),
    );
    const repaired = await evaluate(
        "JSON.stringify(getSessionById('readiness-empty'))",
      ),
      historical = await evaluate(
        "JSON.stringify(getSessionById('readiness-history'))",
      );
    await evaluate(
      "closeModal();openSessionModal(getSessionById('readiness-empty'))",
    );
    check(
      "REPAIRED_SESSION_REOPEN_REQUIRES_ACTIVATION",
      await evaluate(
        "document.querySelector('.session-workspace').dataset.sessionMode==='view'&&[...document.querySelectorAll('.att-btns button')].every(button=>button.disabled)",
      ),
    );
    await evaluate(
      "closeModal();goSchool('reminder-school');goClass('reminder-class');setTab('students')",
    );
    await evaluate(`(()=>{
      const form=document.querySelector('.student-add-form');form.closest('details').open=true;
      form.elements.name.value='هنرجوی مصنوعی سوم';form.elements.code.value='003';form.requestSubmit();
    })()`);
    await wait(
      "getClassObj('reminder-school','reminder-class').students.length===3&&!EduV24.test.getState().busy",
    );
    await evaluate(
      "goLesson('reminder-lesson');setTab('sessions');openSessionModal(getSessionById('readiness-empty'))",
    );
    check(
      "LATER_STUDENT_DOES_NOT_BACKFILL_REPAIRED_SESSION",
      repaired ===
        (await evaluate("JSON.stringify(getSessionById('readiness-empty'))")) &&
        (await evaluate(
          "document.querySelectorAll('.att-btns').length===2&&!document.querySelector('[data-workspace-action=session-restore-roster]')",
        )),
    );
    await evaluate(
      "closeModal();openSessionModal(getSessionById('readiness-history'))",
    );
    check(
      "HISTORICAL_NONEMPTY_SNAPSHOT_NEVER_BACKFILLED",
      historical ===
        (await evaluate(
          "JSON.stringify(getSessionById('readiness-history'))",
        )) &&
        (await evaluate(
          "document.querySelectorAll('.att-btns').length===1&&!document.querySelector('[data-workspace-action=session-restore-roster]')&&getSessionById('readiness-history').attendance['reminder-student-a']==='present'",
        )),
    );
    await evaluate(
      "closeModal();state.view='master';render();openMasterConfig(todayIdx(),0)",
    );
    await resetFeedback();
    await click('[data-legacy-click="schedule-timetable:18"]');
    await wait(
      "document.getElementById('modal').classList.contains('hidden')&&!EduV24.test.getState().busy",
    );
    check(
      "READY_CLASS_CAN_SAVE_SCHEDULE",
      await evaluate(
        "globalThis.__sessionRosterAudit.alerts.length===0&&getMasterEntry(todayIdx(),0,todayISO()).classId==='reminder-class'",
      ),
    );
    await evaluate(
      "goSchool('reminder-school');goClass('reminder-class');goLesson('reminder-lesson');setTab('sessions')",
    );
    await evaluate(`(()=>{
      const form=document.querySelector('.session-create-form');form.elements.date.value=todayISO();refreshSessionDateSchedule();form.elements.period.value='2';form.requestSubmit();
    })()`);
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .session-workspace[data-session-mode=edit]')&&!EduV24.test.getState().busy",
    );
    check(
      "READY_CLASS_NEW_SESSION_INCLUDES_ALL_CURRENT_STUDENTS",
      await evaluate(`(async()=>{
        const snapshot=await EduV24.snapshotInstallation(),session=getSessionById(currentSessionId),row=snapshot.stores.records.find(record=>record.workspace==='reminder-first'&&record.logical==='session:'+currentSessionId);
        return session.roster.length===3&&row.value.roster.length===3&&document.querySelectorAll('.att-btns').length===3&&Object.keys(session.attendance).length===0&&!document.querySelector('[data-session-edit-control]');
      })()`),
    );
  } finally {
    await evaluate(`(()=>{
      window.alert=globalThis.__sessionRosterOriginalAlert;
      window.confirm=globalThis.__sessionRosterOriginalConfirm;
      delete globalThis.__sessionRosterOriginalAlert;delete globalThis.__sessionRosterOriginalConfirm;delete globalThis.__sessionRosterAudit;
    })()`);
    await restore(original);
  }
}

module.exports = { run };
if (require.main === module)
  main({ stage: "session-roster-readiness", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
