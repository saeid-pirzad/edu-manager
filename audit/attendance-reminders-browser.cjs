"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { main } = require("./data-integrity.cjs");

async function seedReminders() {
  const year = EduAcademicYear.current(),
    now = todayISO(),
    shift = (offset) => {
      const value = new Date(now + "T00:00:00Z");
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    },
    date = shift(-1),
    prior = shift(-2),
    students = [
      { id: "reminder-student-a", name: "هنرجوی آزمایشی اول", code: "001" },
      { id: "reminder-student-b", name: "هنرجوی آزمایشی دوم", code: "002" },
    ],
    data = EduV24.normalizeDB({
      ...defaultDB(),
      settings: {
        ...defaultDB().settings,
        academicYear: year,
        academicTerm: "اول",
        password: "",
      },
      schools: [
        {
          id: "reminder-school",
          name: "هنرستان آزمایشی پیگیری",
          classes: [
            {
              id: "reminder-class",
              name: "یازدهم تصویرسازی آزمایشی",
              students,
              archivedStudents: [],
              lessons: [
                {
                  id: "reminder-lesson",
                  name: "درس آزمایشی رایانه و تصویرسازی",
                  gradeMode: "kardanesh",
                  gradingPolicy: {
                    ...EduPolicy.defaults("dual", year),
                    confirmed: true,
                    code: "REMINDER-TEST",
                  },
                  poudmans: [],
                  kardaneshScores: {},
                },
              ],
            },
          ],
        },
      ],
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      periods: 2,
      sessions: [],
      masterSchedule: {},
    }),
    identity = {
      schoolId: "reminder-school",
      classId: "reminder-class",
      lessonId: "reminder-lesson",
    },
    makeSession = (id, when, period, attendance) => ({
      id,
      ...identity,
      date: when,
      period,
      roster: structuredClone(students),
      attendance,
      scores: [],
      poudmanId: null,
      unitId: null,
    }),
    seed = {
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      exportedAt: new Date().toISOString(),
      activeWorkspace: "reminder-first",
      stores: {
        catalog: [],
        records: [],
        events: [],
        backups: [],
        undo: [],
        reports: [],
      },
      reportDrafts: {},
      gradeDrafts: [],
    },
    collect = EduWorkspaceRecords.create({
      clone: structuredClone,
    }).collectRecords;
  for (let day = 0; day < 7; day++)
    for (let bell = 0; bell < 2; bell++)
      data.masterSchedule[`${day}-${bell}-all`] = identity;
  for (const [id, kind, label] of [
    ["reminder-first", "first", "اول"],
    ["reminder-second", "second", "دوم"],
  ]) {
    const part = structuredClone(data);
    part.settings.academicTerm = label;
    part.sessions =
      kind === "first"
        ? [
            makeSession("reminder-incomplete", date, 1, {
              "reminder-student-a": "late:5",
            }),
          ]
        : [
            makeSession("reminder-complete-peer", prior, 0, {
              "reminder-student-a": "present",
              "reminder-student-b": "leave",
            }),
          ];
    seed.stores.catalog.push({
      id,
      year,
      term: label,
      termKind: kind,
      revision: 1,
      closed: false,
      createdAt: seed.exportedAt,
      updatedAt: seed.exportedAt,
    });
    for (const [logical, value] of collect(part))
      seed.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  }
  closeModal();
  EduV24.previewFullBackup(seed);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  globalThis.__attendanceFixture = {
    date,
    prior,
    key: [date, 0, identity.schoolId, identity.classId, identity.lessonId].join(
      "|",
    ),
  };
  goSchools();
  return globalThis.__attendanceFixture;
}

async function run({ cdp, evaluate, cases, delay }) {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-attendance-reminders-"),
    ),
    check = (id, pass, observed) =>
      cases.push({
        id: "ATTENDANCE_REMINDER_" + id,
        name: id,
        pass: !!pass,
        observed,
      }),
    call = (fn) => evaluate("(" + fn.toString() + ")()"),
    wait = async (expression) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error("Attendance reminder browser wait: " + expression);
    },
    click = (token) =>
      evaluate(
        `document.querySelector('[data-workspace-action="${token}"]').click()`,
      );
  console.log("Attendance reminder previews: " + directory);
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  const fixture = await call(seedReminders);
  try {
    await wait(
      "!!document.querySelector('#attendanceReminderRegion .attendance-reminders')",
    );
    const initial = await evaluate(`({
      placement: document.querySelector('.schools-welcome').nextElementSibling.id === 'attendanceReminderRegion',
      count: document.querySelectorAll('#attendanceReminderRegion .attendance-reminder-item').length,
      incomplete: !!document.querySelector('#attendanceReminderRegion .is-incomplete'),
      selected: [...document.querySelectorAll('#attendanceReminderRegion [data-key]')].some(b=>b.dataset.key===__attendanceFixture.key),
      peerDuplicated: [...document.querySelectorAll('#attendanceReminderRegion [data-key]')].some(b=>b.dataset.key.startsWith(__attendanceFixture.prior+'|0|')),
      range:document.querySelector('.attendance-reminder-range').textContent
    })`);
    check(
      "PLACEMENT_AND_YEAR_SCOPE",
      initial.placement &&
        initial.count === 3 &&
        initial.incomplete &&
        initial.selected &&
        !initial.peerDuplicated &&
        initial.range.includes("فعلی"),
      initial,
    );
    for (const width of [320, 390, 768, 1024, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate("scrollTo(0,0)");
      await delay(80);
      const layout = await evaluate(`(()=>{
        const region=document.getElementById('attendanceReminderRegion'),box=region.getBoundingClientRect(),welcome=document.querySelector('.schools-welcome').getBoundingClientRect(),agenda=document.querySelector('.today-agenda').getBoundingClientRect();
        return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
          afterBanner:box.top>=welcome.bottom-1,beforeAgenda:box.bottom<=agenda.top+1,
          top:box.top,bottom:box.bottom,height:box.height,visibility:getComputedStyle(region).visibility,
          inside:[...region.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1&&r.height>=40}),
          grid:getComputedStyle(region.querySelector('.attendance-reminder-open')).display};
      })()`);
      check(
        "LAYOUT_" + width,
        !layout.overflow &&
          layout.inside &&
          layout.grid === "grid" &&
          layout.height > 100 &&
          layout.visibility === "visible" &&
          layout.afterBanner &&
          layout.beforeAgenda,
        layout,
      );
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, `dashboard-${width}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    await evaluate(
      "[...document.querySelectorAll('#attendanceReminderRegion [data-key]')].find(b=>b.dataset.key===__attendanceFixture.key).click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog')",
    );
    check(
      "MISSING_CHOICES",
      await evaluate(
        "!!document.querySelector('[data-workspace-action=attendance-reminder-record]')&&!!document.querySelector('[data-workspace-action=attendance-reminder-not-held]')",
      ),
    );
    await click("attendance-reminder-not-held");
    await wait(
      "EduV24.test.getState().db.notHeldSessions.length===1&&!EduV24.test.getState().busy&&document.getElementById('modal').classList.contains('hidden')",
    );
    const marked = await evaluate(
      "(async()=>({sessions:db.sessions.length,markers:db.notHeldSessions.length,backup:EduV24.validateFullBackup(await EduV24.snapshotInstallation()).find(p=>p.period.id==='reminder-first').data.notHeldSessions.length}))()",
    );
    check(
      "NOT_HELD_DURABLE_NO_FAKE_SESSION",
      marked.sessions === 1 && marked.markers === 1 && marked.backup === 1,
      marked,
    );
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    await evaluate("goSchools()");
    await wait(
      "!!document.querySelector('[data-workspace-action=attendance-reminders-not-held]')",
    );
    const durable = await evaluate(
      "({markers:db.notHeldSessions.length,sessions:db.sessions.length,missing:!!document.querySelector('#attendanceReminderRegion .attendance-reminder-open[data-key=\"'+db.notHeldSessions[0].date+'|0|reminder-school|reminder-class|reminder-lesson\"]')})",
    );
    check(
      "RELOAD",
      durable.markers === 1 && durable.sessions === 1 && !durable.missing,
      durable,
    );
    await click("attendance-reminders-not-held");
    await wait(
      "!!document.querySelector('[data-workspace-action=attendance-reminder-restore]')",
    );
    await click("attendance-reminder-restore");
    await wait(
      "db.notHeldSessions.length===0&&!EduV24.test.getState().busy&&!!document.querySelector('.attendance-reminder-history .attendance-reminders-empty')",
    );
    await evaluate("closeModal();goSchools()");
    await wait(
      "!!document.querySelector('#attendanceReminderRegion .is-missing')",
    );
    check(
      "RESTORE_REMINDER",
      await evaluate("db.sessions.length===1&&db.notHeldSessions.length===0"),
    );
    const beforeFailure = await evaluate("JSON.stringify(db.sessions)");
    await evaluate(
      "document.querySelector('#attendanceReminderRegion .is-missing button').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog')",
    );
    await evaluate("EduV24.test.failNextWrite()");
    await click("attendance-reminder-not-held");
    await wait(
      "!EduV24.test.getState().busy&&!!document.getElementById('operationError')?.textContent",
    );
    check(
      "FAILED_WRITE_PRESERVES_DATA",
      (await evaluate("db.notHeldSessions.length===0")) &&
        (await evaluate("JSON.stringify(db.sessions)")) === beforeFailure,
    );
    await evaluate("closeModal();goSchools()");
    await wait(
      "!!document.querySelector('#attendanceReminderRegion .is-missing button')",
    );
    await evaluate(
      "document.querySelector('#attendanceReminderRegion .is-missing button').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog')",
    );
    check("REVIEW_RECOVERS_AFTER_FAILED_WRITE", true);
    await evaluate("closeModal()");
    await wait(
      "!!document.querySelector('#attendanceReminderRegion .is-incomplete button')",
    );
    await evaluate(
      "document.querySelector('#attendanceReminderRegion .is-incomplete button').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog')",
    );
    check(
      "INCOMPLETE_NO_DESTRUCTIVE_CHOICE",
      await evaluate(
        "!document.querySelector('[data-workspace-action=attendance-reminder-not-held]')",
      ),
    );
    await click("attendance-reminder-record");
    await wait(
      "!!document.querySelector('.session-workspace[data-session-id=reminder-incomplete]')",
    );
    await evaluate(
      "document.querySelector('[data-workspace-action=session-toggle-edit]').click()",
    );
    await evaluate(
      "document.querySelector('.att-btns[data-sid=reminder-student-b] .present').click()",
    );
    await wait(
      "db.sessions.find(s=>s.id==='reminder-incomplete').attendance['reminder-student-b']==='present'&&!EduV24.test.getState().busy",
    );
    await evaluate("closeModal();goSchools()");
    await wait(
      "!!document.querySelector('#attendanceReminderRegion .attendance-reminders')&&!document.querySelector('#attendanceReminderRegion .is-incomplete')",
    );
    check(
      "COMPLETE_EXISTING",
      await evaluate(
        "db.sessions.length===1&&db.sessions[0].attendance['reminder-student-a']==='late:5'",
      ),
    );
    await evaluate(
      "document.querySelector('#attendanceReminderRegion .is-missing button').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog')",
    );
    await click("attendance-reminder-record");
    await wait(
      "!!document.querySelector('.session-workspace')&&db.sessions.length===2&&!EduV24.test.getState().busy",
    );
    const created = await evaluate(
      '({count:db.sessions.length,unknown:db.sessions.find(s=>s.id!=="reminder-incomplete").attendance,roster:db.sessions.find(s=>s.id!=="reminder-incomplete").roster.length})',
    );
    check(
      "RECORD_MISSING_EXACT_SESSION",
      created.count === 2 &&
        created.roster === 2 &&
        Object.keys(created.unknown).length === 0,
      created,
    );
    await evaluate("closeModal();goSchools()");
    await wait(
      "!!document.querySelector('[data-workspace-action=attendance-reminders-all]')",
    );
    await click("attendance-reminders-all");
    await wait("!!document.querySelector('.attendance-reminder-list-dialog')");
    check(
      "BOUNDED_FULL_LIST",
      await evaluate(
        "document.querySelectorAll('.attendance-reminder-list-dialog .attendance-reminder-item').length<=50",
      ),
    );
  } finally {
    await evaluate(`(async()=>{
      closeModal();EduV24.previewFullBackup(${JSON.stringify(original)});
      document.getElementById('fullRestoreConfirmed').checked=true;
      await EduV24.restoreFullBackup();
    })()`);
  }
  check(
    "PREVIEWS",
    fs.readdirSync(directory).filter((name) => name.endsWith(".png")).length ===
      5,
    { directory, fixture },
  );
}

module.exports = { run, seedReminders };
if (require.main === module)
  main({ stage: "attendance-reminders", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
