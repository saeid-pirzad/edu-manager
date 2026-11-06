"use strict";

const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { main } = require("./data-integrity.cjs");

// Synthetic data only: a current-year directory with a long unit label, large
// counts, a plain session and a session owned by the other term.
async function seedLessonSessions() {
  const year = EduAcademicYear.current(),
    today = todayISO(),
    shift = (offset) => {
      const value = new Date(today + "T00:00:00Z");
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    },
    ids = {
      first: "compact-session-first",
      second: "compact-session-second",
      school: "compact-session-school",
      classroom: "compact-session-class",
      lesson: "compact-session-lesson",
      current: "compact-session-today",
      plain: "compact-session-yesterday",
      peer: "compact-session-peer",
      module: "compact-session-module",
      unit: "compact-session-unit",
    },
    students = Array.from({ length: 150 }, (_, index) => ({
      id: "compact-session-student-" + index,
      name: "هنرجوی مصنوعی " + index,
      code: String(index + 1).padStart(3, "0"),
    })),
    moduleName = "پودمان آزمایشی طراحی و تولید محتوای چندرسانه‌ای",
    unitName =
      'واحد یادگیری با نام بلند و عبارت <b data-audit-unsafe>آزمایشی</b> & "ویژه"',
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
          id: ids.school,
          name: "هنرستان مصنوعی جلسات جمع‌وجور",
          classes: [
            {
              id: ids.classroom,
              name: "کلاس مصنوعی جلسات",
              students,
              archivedStudents: [],
              lessons: [
                {
                  id: ids.lesson,
                  name: "درس مصنوعی نمایش جلسات",
                  gradeMode: "standard",
                  gradingPolicy: {
                    ...EduPolicy.defaults("modular", year),
                    confirmed: true,
                    code: "COMPACT-SESSION-TEST",
                  },
                  kardaneshScores: {},
                  poudmans: [
                    {
                      id: ids.module,
                      name: moduleName,
                      podScores: {},
                      units: [
                        {
                          id: ids.unit,
                          name: unitName,
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
      sessions: [],
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      periods: 2,
      masterSchedule: {},
    }),
    identity = {
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: ids.lesson,
    },
    meeting = (id, date, period) => ({
      id,
      ...identity,
      date,
      period,
      roster: structuredClone(students),
      attendance: {},
      scores: [],
      poudmanId: null,
      unitId: null,
    }),
    current = meeting(ids.current, today, 1),
    fixture = {
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      exportedAt: new Date().toISOString(),
      activeWorkspace: ids.first,
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
      snapshotNotes: [],
    },
    collect = EduWorkspaceRecords.create({
      clone: structuredClone,
    }).collectRecords;
  current.poudmanId = ids.module;
  current.unitId = ids.unit;
  for (let index = 0; index < students.length; index++)
    current.attendance[students[index].id] =
      index < 125
        ? "present"
        : index < 134
          ? "absent"
          : index < 142
            ? "late:10"
            : "leave";
  current.scores = students.slice(0, 126).map((student) => ({
    studentId: student.id,
    type: "positive",
    value: 1,
    note: "فعالیت مصنوعی",
  }));
  for (let day = 0; day < 7; day++)
    for (let period = 0; period < 2; period++)
      data.masterSchedule[`${day}-${period}-all`] = identity;
  for (const [id, term, kind] of [
    [ids.first, "اول", "first"],
    [ids.second, "دوم", "second"],
  ]) {
    const part = structuredClone(data);
    part.settings.academicTerm = term;
    part.sessions =
      kind === "first"
        ? [current, meeting(ids.plain, shift(-1), 0)]
        : [meeting(ids.peer, shift(-2), 0)];
    fixture.stores.catalog.push({
      id,
      year,
      term,
      termKind: kind,
      revision: 1,
      closed: false,
      createdAt: fixture.exportedAt,
      updatedAt: fixture.exportedAt,
    });
    for (const [logical, value] of collect(part))
      fixture.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  }
  closeModal();
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  globalThis.__compactSessionIds = ids;
  goSchool(ids.school);
  goClass(ids.classroom);
  goLesson(ids.lesson);
  return { ...ids, year, moduleName, unitName };
}

async function run({ cdp, evaluate, cases, delay }) {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-lesson-sessions-"),
    ),
    check = (id, pass, observed = {}) =>
      cases.push({
        id: "LESSON_SESSIONS_" + id,
        name: id,
        pass: !!pass,
        observed,
      }),
    wait = async (expression) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error("Lesson sessions browser wait: " + expression);
    },
    signature = () =>
      evaluate(`(async()=>{
        await EduV24.test.settle();
        const snapshot=await EduV24.snapshotInstallation();
        return JSON.stringify(snapshot.stores);
      })()`),
    navigate = () =>
      evaluate(`(()=>{
        closeModal();const ids=globalThis.__compactSessionIds;
        goSchool(ids.school);goClass(ids.classroom);goLesson(ids.lesson);
      })()`);
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  let originalConfirm = false;
  console.log("Compact lesson session previews: " + directory);
  try {
    const fixture = await evaluate("(" + seedLessonSessions.toString() + ")()");
    await wait(
      "document.querySelector('.session-directory')?.dataset.yearScope===" +
        JSON.stringify(fixture.year) +
        "&&document.querySelectorAll('.session-card').length===3",
    );
    const content = await evaluate(`(()=>{
      const cards=[...document.querySelectorAll('.session-directory .session-card')],
        first=cards[0],unit=first.querySelector('.session-unit');
      return {ids:cards.map(card=>{const b=card.querySelector('.session-open');return b.dataset.key||b.dataset.legacyClickArg0}),
        counts:[...first.querySelectorAll('.session-counts b')].map(b=>b.textContent),
        labels:[...first.querySelectorAll('.session-counts>span')].map(b=>b.textContent),
        unit:unit?.textContent,unsafeElements:first.querySelectorAll('[data-audit-unsafe]').length,
        today:!!first.querySelector('.session-today'),
        openNames:cards.map(card=>card.querySelector('.session-open').getAttribute('aria-label')),
        currentDeletes:cards.filter(card=>card.querySelector('.session-delete')).length,
        peerDelete:!!cards[2].querySelector('.session-delete')};
    })()`);
    check(
      "CONTENT_AND_ROUTES",
      JSON.stringify(content.ids) ===
        JSON.stringify([fixture.current, fixture.plain, fixture.peer]) &&
        JSON.stringify(content.counts) ===
          JSON.stringify(
            [125, 9, 8, 8, 126].map((n) => n.toLocaleString("fa-IR")),
          ) &&
        content.labels.every((label) => label.trim().length > 1) &&
        content.unit.includes(fixture.moduleName) &&
        content.unit.includes(fixture.unitName) &&
        content.unsafeElements === 0 &&
        content.today &&
        content.openNames.every((label) => label?.includes("ورود به جلسه")) &&
        content.currentDeletes === 2 &&
        !content.peerDelete,
      content,
    );
    const before = await signature();
    for (const width of [
      320, 390, 700, 701, 768, 999, 1000, 1024, 1100, 1101, 1440,
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width <= 700,
      });
      await cdp("Emulation.setTouchEmulationEnabled", {
        enabled: width <= 1024,
        maxTouchPoints: 5,
      });
      await delay(70);
      const layout = await evaluate(`(()=>{
        const root=document.querySelector('.session-directory'),
          header=root.querySelector('.session-list-heading'),
          box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},
          inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1,
          overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,
          cards=[...root.querySelectorAll('.session-card')].map(card=>{
            const r=box(card),button=card.querySelector('.session-open'),deletion=card.querySelector('.session-delete'),
              bits=[...card.querySelectorAll('.session-date strong,.session-period,.session-counts>span,.session-enter-label,.session-unit')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'),
              b=bits.map(box),d=deletion?box(deletion):null;
            return {rect:r,unit:!!card.querySelector('.session-unit'),button:box(button),delete:d,
              piecesInside:b.every(p=>inside(p,r)),piecesOverlap:b.some((p,i)=>b.slice(i+1).some(q=>overlaps(p,q))),
              deletionOverlap:!!d&&b.some(p=>overlaps(p,d)),
              overflow:card.scrollWidth>card.clientWidth+1,
              counts:[...card.querySelectorAll('.session-counts>span')].map(el=>({rect:box(el),clipped:el.scrollWidth>el.clientWidth+1,font:parseFloat(getComputedStyle(el).fontSize)})),
              label:card.querySelector('.session-enter-label')?.textContent};
          });
        return {width:innerWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
          root:box(root),header:box(header),rootOverflow:root.scrollWidth>root.clientWidth+1,cards};
      })()`);
      check(
        "COMPACT_LAYOUT_" + width,
        !layout.pageOverflow &&
          !layout.rootOverflow &&
          layout.header.height <= 105 &&
          layout.cards.length === 3 &&
          layout.cards.every(
            (card) =>
              !card.overflow &&
              card.piecesInside &&
              !card.piecesOverlap &&
              !card.deletionOverlap &&
              card.button.height >= 44 &&
              (!card.delete ||
                (card.delete.width >= 44 && card.delete.height >= 44)) &&
              card.counts.length === 5 &&
              card.counts.every(
                (count) => !count.clipped && count.font >= 10,
              ) &&
              card.label?.includes("ورود") &&
              card.rect.height <= (card.unit ? 210 : width <= 700 ? 122 : 112),
          ),
        layout,
      );
      if ([320, 390, 768, 1024, 1440].includes(width)) {
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(directory, `lesson-sessions-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
    }
    check("RESIZING_IS_READ_ONLY", before === (await signature()));
    await evaluate(
      "document.querySelector('.session-card .session-open').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .session-workspace[data-session-mode=view]')&&currentSessionId===__compactSessionIds.current",
    );
    check(
      "REAL_OPEN_REMAINS_READ_ONLY",
      before === (await signature()) &&
        (await evaluate(
          "document.getElementById('sessDate').disabled&&document.getElementById('sessPeriod').disabled",
        )),
    );
    await navigate();
    await wait("document.querySelectorAll('.session-card').length===3");
    await evaluate(`(()=>{
      globalThis.__compactSessionsOriginalConfirm=window.confirm;
      globalThis.__compactSessionsConfirmations=[];
      window.confirm=message=>{__compactSessionsConfirmations.push(message);return false};
      document.querySelector('.session-card .session-delete').click();
    })()`);
    originalConfirm = true;
    await wait("globalThis.__compactSessionsConfirmations.length===1");
    check(
      "DELETE_CANCEL_PRESERVES_DATA",
      before === (await signature()) &&
        (await evaluate(
          "__compactSessionsConfirmations[0].includes('حذف این جلسه')&&document.querySelectorAll('.session-card').length===3&&document.getElementById('modal').classList.contains('hidden')",
        )),
    );
    await evaluate(`(()=>{
      window.confirm=message=>{__compactSessionsConfirmations.push(message);return true};
      document.querySelector('.session-card .session-delete').click();
    })()`);
    await wait(
      "!db.sessions.some(s=>s.id===__compactSessionIds.current)&&document.querySelectorAll('.session-card').length===2&&!EduV24.test.getState().busy",
    );
    check(
      "DELETE_TARGETS_ONE_SESSION",
      await evaluate(`(async()=>{
        const snapshot=await EduV24.snapshotInstallation(),ids=__compactSessionIds;
        return __compactSessionsConfirmations.length===2&&
          !snapshot.stores.records.some(r=>r.logical==='session:'+ids.current)&&
          snapshot.stores.records.some(r=>r.logical==='session:'+ids.plain)&&
          snapshot.stores.records.some(r=>r.logical==='session:'+ids.peer);
      })()`),
    );
    const beforePeer = await signature();
    await evaluate(
      "window.confirm=globalThis.__compactSessionsOriginalConfirm;document.querySelector('.session-open[data-workspace]').click()",
    );
    await wait(
      "EduV24.getReportContext().id===__compactSessionIds.second&&currentSessionId===__compactSessionIds.peer&&!!document.querySelector('#modal:not(.hidden) .session-workspace[data-session-mode=view]')",
    );
    check("PEER_OPEN_PRESERVES_OWNER", beforePeer === (await signature()));
    check(
      "PREVIEWS",
      fs.readdirSync(directory).filter((name) => name.endsWith(".png"))
        .length === 5,
      { directory },
    );
  } catch (error) {
    const state = await evaluate(
      "({context:EduV24.getReportContext(),status:EduV24.test.getState().status})",
    ).catch(() => null);
    console.error("Compact lesson session flow: " + (error.stack || error));
    check("FLOW_COMPLETED", false, {
      error: error.stack || error.message,
      state,
    });
  } finally {
    if (originalConfirm)
      await evaluate(
        "window.confirm=globalThis.__compactSessionsOriginalConfirm;delete globalThis.__compactSessionsOriginalConfirm;delete globalThis.__compactSessionsConfirmations",
      );
    try {
      await require("./browser-ready.cjs")({ cdp, evaluate, delay });
      await evaluate(
        `(async()=>{closeModal();EduV24.previewFullBackup(${JSON.stringify(original)});document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup();delete globalThis.__compactSessionIds})()`,
      );
    } catch (error) {
      check("FIXTURE_CLEANUP", false, { error: error.stack || error.message });
    }
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}

module.exports = { run };
if (require.main === module)
  main({ stage: "lesson-sessions-compact", runExtra: run }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 2;
  });
