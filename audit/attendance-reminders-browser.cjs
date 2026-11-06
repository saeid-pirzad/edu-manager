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

async function run({ cdp, evaluate, cases, delay, baselineFooter = false }) {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-attendance-reminders-"),
    ),
    reminderViewSource = fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/reminder-view.js"),
      "utf8",
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
      ),
    signature = () =>
      evaluate(`(async()=>{
        const backup=await EduV24.snapshotInstallation();
        return JSON.stringify({data:db,stores:backup.stores,reportDrafts:backup.reportDrafts,gradeDrafts:backup.gradeDrafts});
      })()`),
    reviewLayouts = async (kind) => {
      const before = await signature();
      for (const width of [320, 390, 768, 1024, 1440]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await delay(100);
        const layout = await evaluate(`(()=>{
          const root=document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog'),
            shell=root.closest('.modal-dialog'),title=document.getElementById('modalTitle'),
            rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},
            inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1,
            overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,
            box=rect(root),shellBox=rect(shell),summary=root.querySelector('.attendance-reminder-summary'),
            meta=summary.querySelector('.attendance-reminder-summary-meta'),
            cards=[...root.querySelectorAll('.attendance-reminder-choice,.attendance-reminder-not-held')],
            buttons=[...root.querySelectorAll('button')].filter(b=>b.getClientRects().length),
            cardLayout=cards.map(card=>{const r=rect(card),parts=[...card.children].filter(e=>e.getClientRects().length).map(rect);return {rect:r,
              inside:parts.every(p=>inside(p,r)),overlap:parts.some((p,i)=>parts.slice(i+1).some(q=>overlaps(p,q))),
              clipped:card.scrollWidth>card.clientWidth+1}}),
            record=root.querySelector('[data-workspace-action=attendance-reminder-record]'),
            notHeld=root.querySelector('[data-workspace-action=attendance-reminder-not-held]');
          return {width:innerWidth,kind:root.classList.contains('is-${kind}'),
            pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
            modalOverflow:shell.scrollWidth>shell.clientWidth+1,
            rootInside:box.left>=shellBox.left-1&&box.right<=shellBox.right+1,
            title:{text:title.textContent,rect:rect(title),visible:rect(title).height>0&&inside(rect(title),shellBox)},
            summaryMeta:!!meta&&inside(rect(meta),rect(summary)),
            buttons:buttons.map(b=>({action:b.dataset.workspaceAction,rect:rect(b),enabled:!b.disabled,
              inside:inside(rect(b),box),clipped:b.scrollWidth>b.clientWidth+1,
              decorations:b.querySelectorAll('svg,.control-icon').length,
              pseudo:['::before','::after'].map(p=>getComputedStyle(b,p).content)})),
            cards:cardLayout,cardCount:cards.length,
            choiceStacked:cards.length===2&&cardLayout[0].rect.bottom<=cardLayout[1].rect.top+1,
            choiceSideBySide:cards.length===2&&Math.abs(cardLayout[0].rect.top-cardLayout[1].rect.top)<2&&
              !overlaps(cardLayout[0].rect,cardLayout[1].rect),
            hasRecord:!!record,hasNotHeld:!!notHeld};
        })()`);
        check(
          "REVIEW_" + kind.toUpperCase() + "_LAYOUT_" + width,
          layout.kind &&
            !layout.pageOverflow &&
            !layout.modalOverflow &&
            layout.rootInside &&
            layout.title.visible &&
            layout.title.text.trim().length > 0 &&
            layout.summaryMeta &&
            layout.hasRecord &&
            layout.hasNotHeld === ["missing", "empty"].includes(kind) &&
            layout.buttons.length >= 2 &&
            layout.buttons.every(
              (b) =>
                b.enabled &&
                b.inside &&
                !b.clipped &&
                b.rect.height >= 44 &&
                (b.action === "close" ||
                  (b.decorations === 0 &&
                    b.pseudo.every((value) =>
                      ["none", "normal", '""'].includes(value),
                    ))),
            ) &&
            layout.cards.every((c) => c.inside && !c.overlap && !c.clipped) &&
            (!["missing", "empty"].includes(kind) ||
              (layout.cardCount === 2 &&
                (width <= 600
                  ? layout.choiceStacked
                  : layout.choiceSideBySide))),
          layout,
        );
        await evaluate(
          "document.querySelector('.attendance-reminder-dialog [data-workspace-action=attendance-reminder-record]').focus({preventScroll:true})",
        );
        const expectedFocus = await evaluate(`(()=>{
          const elements=modalFocusableElements(),index=elements.indexOf(document.activeElement);
          return elements[index+1]?.dataset.workspaceAction;
        })()`);
        await cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
        });
        await cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
        });
        const focus = await evaluate(`(()=>{
          const button=document.activeElement,style=getComputedStyle(button);
          return {action:button.dataset.workspaceAction,inside:!!button.closest('.attendance-reminder-dialog'),
            visible:button.getClientRects().length>0,focusVisible:button.matches(':focus-visible'),
            outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
        })()`);
        check(
          "REVIEW_" + kind.toUpperCase() + "_KEYBOARD_" + width,
          focus.action === expectedFocus &&
            focus.inside &&
            focus.visible &&
            focus.focusVisible &&
            focus.outline !== "none" &&
            focus.outlineWidth >= 2,
          { expectedFocus, ...focus },
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(directory, `review-${kind}-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
      check(
        "REVIEW_" + kind.toUpperCase() + "_NO_WRITES",
        before === (await signature()),
      );
    },
    historyLayouts = async () => {
      const before = await signature();
      for (const width of [320, 390, 768, 1024, 1440]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await delay(100);
        const layout = await evaluate(`(()=>{
          const root=document.querySelector('#modal:not(.hidden) .attendance-reminder-history'),
            shell=root.closest('.modal-dialog'),title=document.getElementById('modalTitle'),
            rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},
            inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1,
            overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,
            box=rect(root),shellBox=rect(shell),heading=root.querySelector('.attendance-reminder-history-heading'),
            count=root.querySelector('.attendance-reminder-history-count'),
            buttons=[...root.querySelectorAll('button')].filter(b=>b.getClientRects().length),
            rows=[...root.querySelectorAll('.attendance-reminder-history-item')].map(row=>{
              const details=row.querySelector('.attendance-reminder-history-details'),
                meta=row.querySelector('.attendance-reminder-history-meta'),
                identity=row.querySelector('.attendance-reminder-history-identity'),
                school=row.querySelector('.attendance-reminder-school'),
                lesson=row.querySelector('.attendance-reminder-lesson'),
                action=row.querySelector('.attendance-reminder-history-restore'),
                rowBox=rect(row),contents=details&&getComputedStyle(details).display==='contents',
                parts=(contents?[meta,identity,school,action]:[details,action]).filter(Boolean).map(rect),
                detailParts=[meta,identity,school].filter(Boolean).map(rect),
                clipped=[row,details,meta,identity,school,lesson,action].filter(Boolean).some(e=>e.scrollWidth>e.clientWidth+1);
              return {height:rowBox.height,hasParts:!!details&&!!meta&&!!identity&&!!school&&!!lesson&&!!action,
                inside:parts.every(p=>inside(p,rowBox))&&detailParts.every(p=>inside(p,contents?rowBox:rect(details))),
                overlap:parts.some((p,i)=>parts.slice(i+1).some(q=>overlaps(p,q)))||
                  detailParts.some((p,i)=>detailParts.slice(i+1).some(q=>overlaps(p,q))),
                clipped,hasStatus:meta.textContent.includes('برگزار نشده'),hasUndo:!!action.querySelector('svg'),
                target:{id:action.dataset.key,workspace:action.dataset.workspace,mutating:action.dataset.mutating},
                identityText:identity.textContent,schoolText:school.textContent};
            }),marker=db.notHeldSessions[0];
          return {width:innerWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
            modalOverflow:shell.scrollWidth>shell.clientWidth+1,rootInside:inside(box,shellBox),
            titleVisible:rect(title).height>0&&inside(rect(title),shellBox),
            headingInside:!!heading&&inside(rect(heading),box),
            count:count?.textContent.trim(),expectedCount:db.notHeldSessions.length.toLocaleString('fa-IR'),
            expectedId:marker.id||marker.key,expectedWorkspace:EduV24.test.getState().workspace.id,
            rows,buttons:buttons.map(b=>({height:rect(b).height,inside:inside(rect(b),box),
              enabled:!b.disabled,clipped:b.scrollWidth>b.clientWidth+1}))};
        })()`);
        check(
          "HISTORY_LAYOUT_" + width,
          !layout.pageOverflow &&
            !layout.modalOverflow &&
            layout.rootInside &&
            layout.titleVisible &&
            layout.headingInside &&
            layout.count?.includes(layout.expectedCount) &&
            layout.rows.length === 1 &&
            layout.rows.every(
              (row) =>
                row.hasParts &&
                row.inside &&
                !row.overlap &&
                !row.clipped &&
                row.hasStatus &&
                row.hasUndo &&
                row.height <= (width <= 600 ? 140 : 100) &&
                row.target.id === layout.expectedId &&
                row.target.workspace === layout.expectedWorkspace &&
                row.target.mutating === "1" &&
                row.identityText.includes("یازدهم تصویرسازی آزمایشی") &&
                row.identityText.includes("درس آزمایشی رایانه و تصویرسازی") &&
                row.schoolText.includes("هنرستان آزمایشی پیگیری"),
            ) &&
            layout.buttons.length === 2 &&
            layout.buttons.every(
              (button) =>
                button.enabled &&
                button.inside &&
                !button.clipped &&
                button.height >= 44,
            ),
          layout,
        );
        await evaluate(
          "document.querySelector('.attendance-reminder-history [data-workspace-action=attendance-reminder-restore]').focus({preventScroll:true})",
        );
        const expectedFocus = await evaluate(`(()=>{
          const elements=modalFocusableElements(),index=elements.indexOf(document.activeElement);
          return elements[index+1]?.dataset.workspaceAction;
        })()`);
        for (const type of ["keyDown", "keyUp"])
          await cdp("Input.dispatchKeyEvent", {
            type,
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
          });
        const focus = await evaluate(`(()=>{
          const button=document.activeElement,style=getComputedStyle(button);
          return {action:button.dataset.workspaceAction,inside:!!button.closest('.attendance-reminder-history'),
            visible:button.getClientRects().length>0,focusVisible:button.matches(':focus-visible'),
            outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
        })()`);
        check(
          "HISTORY_KEYBOARD_" + width,
          focus.action === expectedFocus &&
            focus.inside &&
            focus.visible &&
            focus.focusVisible &&
            focus.outline !== "none" &&
            focus.outlineWidth >= 2,
          { expectedFocus, ...focus },
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(directory, `history-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
      check("HISTORY_VIEW_NO_WRITES", before === (await signature()));
    },
    footerLayouts = async () => {
      const before = await signature();
      for (const scenario of [
        { name: "BOTH", actions: ["all", "not-held"] },
        { name: "STRESS", actions: ["all", "not-held"], count: 1000 },
        { name: "ALL_ONLY", actions: ["all"], count: 1000 },
        { name: "HISTORY_ONLY", actions: ["not-held"], count: 1000 },
      ]) {
        if (scenario.count)
          await evaluate(`(()=>{
            const source=${JSON.stringify(reminderViewSource)},
              render=new Function('workspace','esc','faDate','EduIcons','model',
                source+'\\nreturn renderAttendanceReminders(model);'),
              items=Array.from({length:1000},(_,index)=>({
                key:'footer-layout-'+index,date:${JSON.stringify(fixture.date)},period:0,kind:'missing',
                schoolName:'هنرستان آزمایشی',className:'کلاس آزمایشی',lessonName:'درس آزمایشی'}));
            document.getElementById('attendanceReminderRegion').innerHTML=
              render(null,esc,faDate,EduIcons,{start:${JSON.stringify(fixture.prior)},
                end:${JSON.stringify(fixture.date)},
                items:${scenario.actions.includes("all") ? "items" : "[]"},
                notHeld:${scenario.actions.includes("not-held") ? "Array.from({length:1000},(_,id)=>({id}))" : "[]"}});
          })()`);
        for (const width of [320, 360, 390, 768, 1024, 1280]) {
          await cdp("Emulation.setDeviceMetricsOverride", {
            width,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await delay(100);
          await evaluate(
            "document.querySelector('#attendanceReminderRegion .attendance-reminders-footer').scrollIntoView({block:'center'})",
          );
          const layout = await evaluate(`(()=>{
            const root=document.getElementById('attendanceReminderRegion'),
              footer=root.querySelector('.attendance-reminders-footer'),
              actions=footer.querySelector('.attendance-reminders-footer-actions'),
              buttons=[...footer.querySelectorAll('button')],hint=footer.querySelector('small'),
              rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},
              inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1,
              overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,
              box=rect(footer),buttonsLayout=buttons.map(button=>{
                const label=button.querySelector('.attendance-reminders-action-label'),
                  count=button.querySelector('.attendance-reminders-action-count'),
                  icon=button.querySelector('svg'),buttonBox=rect(button),
                  parts=[...(icon?.getClientRects().length?[icon]:[]),label,count].filter(Boolean).map(rect),
                  range=label&&document.createRange();
                if(range)range.selectNodeContents(label);
                return {action:button.dataset.workspaceAction,text:button.textContent.trim(),
                  label:label?.textContent.trim(),count:count?.textContent.trim(),rect:buttonBox,
                  enabled:!button.disabled,inside:inside(buttonBox,box),
                  clipped:button.scrollWidth>button.clientWidth+1,
                  completeLabel:!!label&&getComputedStyle(label).textOverflow!=='ellipsis'&&
                    label.scrollWidth<=label.clientWidth+1&&[...range.getClientRects()].every(r=>inside(r,buttonBox)),
                  structure:!!label&&!!count&&!!icon&&button.dataset.uiIcon==='none',
                  partsInside:parts.every(p=>inside(p,buttonBox)),
                  partsOverlap:parts.some((p,index)=>parts.slice(index+1).some(q=>overlap(p,q)))};
              });
            return {width:innerWidth,scenario:${JSON.stringify(scenario.name)},
              pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
              rootOverflow:root.scrollWidth>root.clientWidth+1,footerOverflow:footer.scrollWidth>footer.clientWidth+1,
              actionsInside:!!actions&&inside(rect(actions),box),buttons:buttonsLayout,
              sameRow:buttonsLayout.length===2&&Math.abs(buttonsLayout[0].rect.top-buttonsLayout[1].rect.top)<1,
              equalHeight:buttonsLayout.length===2&&Math.abs(buttonsLayout[0].rect.height-buttonsLayout[1].rect.height)<1,
              equalWidth:buttonsLayout.length===2&&Math.abs(buttonsLayout[0].rect.width-buttonsLayout[1].rect.width)<1,
              singleFillsActions:buttonsLayout.length===1&&!!actions&&Math.abs(buttonsLayout[0].rect.width-rect(actions).width)<1,
              noOverlap:buttonsLayout.length===2&&!overlap(buttonsLayout[0].rect,buttonsLayout[1].rect),
              hintOwnLine:!hint||buttonsLayout.every(button=>rect(hint).top>=button.rect.bottom-1),
              hint:hint&&{text:hint.textContent.trim(),rect:rect(hint),inside:inside(rect(hint),box)}};
          })()`);
          if (!baselineFooter)
            check(
              "FOOTER_" + scenario.name + "_" + width,
              !layout.pageOverflow &&
                !layout.rootOverflow &&
                !layout.footerOverflow &&
                layout.actionsInside &&
                (scenario.actions.length === 1
                  ? width > 600 || layout.singleFillsActions
                  : layout.sameRow &&
                    layout.equalHeight &&
                    layout.equalWidth &&
                    layout.noOverlap) &&
                (width > 600 || layout.hintOwnLine) &&
                (!layout.hint || layout.hint.inside) &&
                layout.buttons.length === scenario.actions.length &&
                layout.buttons.every(
                  (button) =>
                    button.enabled &&
                    button.inside &&
                    !button.clipped &&
                    button.completeLabel &&
                    button.structure &&
                    button.partsInside &&
                    !button.partsOverlap &&
                    button.rect.height >= 44 &&
                    (!scenario.count || button.count === "۱٬۰۰۰"),
                ) &&
                layout.buttons.every(
                  (button, index) =>
                    button.action ===
                      "attendance-reminders-" + scenario.actions[index] &&
                    button.label ===
                      (scenario.actions[index] === "all"
                        ? "همهٔ موارد"
                        : "برگزارنشده‌ها"),
                ),
              layout,
            );
          else console.log("Footer baseline: " + JSON.stringify(layout));
          await evaluate(
            "document.querySelector('#attendanceReminderRegion .attendance-reminders-footer button').focus({preventScroll:true})",
          );
          if (scenario.actions.length === 2)
            for (const type of ["keyDown", "keyUp"])
              await cdp("Input.dispatchKeyEvent", {
                type,
                key: "Tab",
                code: "Tab",
                windowsVirtualKeyCode: 9,
              });
          const focus = await evaluate(`(()=>{
            const button=document.activeElement,style=getComputedStyle(button);
            return {action:button.dataset.workspaceAction,visible:button.getClientRects().length>0,
              focusVisible:button.matches(':focus-visible'),outline:style.outlineStyle,
              outlineWidth:parseFloat(style.outlineWidth)};
          })()`);
          if (!baselineFooter)
            check(
              "FOOTER_KEYBOARD_" + scenario.name + "_" + width,
              focus.action ===
                "attendance-reminders-" + scenario.actions.at(-1) &&
                focus.visible &&
                focus.focusVisible &&
                focus.outline !== "none" &&
                focus.outlineWidth >= 2,
              focus,
            );
          const shot = await cdp("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(
            path.join(
              directory,
              `footer-${baselineFooter ? "baseline" : "updated"}-${scenario.name.toLowerCase()}-${width}.png`,
            ),
            Buffer.from(shot.data, "base64"),
          );
        }
      }
      await evaluate("goSchools()");
      await wait(
        "!!document.querySelector('#attendanceReminderRegion [data-workspace-action=attendance-reminders-not-held]')",
      );
      check("FOOTER_LAYOUT_NO_WRITES", before === (await signature()));
    },
    orderedHistoryProbe = async () => {
      const before = await signature(),
        expectedKeys = [
          "newest-bell-one-class-a",
          "newest-bell-one-class-b",
          "newest-bell-two",
          "newest-bell-three",
          "newest-bell-eleven",
          "middle-bell-one",
          "middle-bell-two",
          "oldest-bell-one",
        ];
      // Render the exact production view source with synthetic read-only input.
      // No test export, extra persisted marker, or live database edit is needed.
      await evaluate(`(()=>{
        const source=${JSON.stringify(reminderViewSource)},
          render=new Function('workspace','esc','faDate','EduIcons','markers','page',
            source+'\\nreturn renderNotHeldRemindersHtml(markers,page);'),
          active=EduV24.test.getState().workspace.id,
          marker=(id,date,period,className='کلاس آزمایشی الف')=>({id,date,period,className,
            schoolName:'هنرستان آزمایشی پیگیری تاریخ',lessonName:'درس آزمایشی رایانه و تصویرسازی',
            sourcePeriodId:id==='middle-bell-two'?'synthetic-peer':active});
        globalThis.__attendanceHistoryProbeRows=[
          marker('middle-bell-two','2026-11-04',1),
          marker('newest-bell-eleven','2026-11-05',10),
          marker('newest-bell-one-class-b','2026-11-05',0,'کلاس آزمایشی ب'),
          marker('oldest-bell-one','2026-11-03',0),
          marker('newest-bell-three','2026-11-05',2),
          marker('middle-bell-one','2026-11-04',0),
          marker('newest-bell-two','2026-11-05',1),
          marker('newest-bell-one-class-a','2026-11-05',0),
        ];
        globalThis.__attendanceHistoryProbeRender=(rows,page=0)=>render(
          EduV24.test.getState().workspace,esc,faDate,EduIcons,rows,page);
        showModal('جلسات برگزارنشده',__attendanceHistoryProbeRender(__attendanceHistoryProbeRows));
      })()`);
      try {
        const initial = await evaluate(`(()=>{
          const rows=__attendanceHistoryProbeRows,before=JSON.stringify(rows),
            first=__attendanceHistoryProbeRender(rows),
            second=__attendanceHistoryProbeRender([...rows].reverse()),
            third=__attendanceHistoryProbeRender([...rows.slice(3),...rows.slice(0,3)]);
          return {same:first===second&&first===third,unchanged:JSON.stringify(rows)===before};
        })()`);
        check(
          "HISTORY_SHUFFLED_INPUT_DETERMINISTIC",
          initial.same && initial.unchanged,
          initial,
        );
        for (const width of [320, 390, 768, 1024, 1440]) {
          await cdp("Emulation.setDeviceMetricsOverride", {
            width,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await delay(100);
          const layout = await evaluate(`(()=>{
            const root=document.querySelector('#modal:not(.hidden) .attendance-reminder-history'),
              shell=root.closest('.modal-dialog'),
              rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}},
              inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1,
              groups=[...root.querySelectorAll('.attendance-reminder-history-day')],
              keys=[...root.querySelectorAll('[data-workspace-action=attendance-reminder-restore]')].map(b=>b.dataset.key);
            return {width:innerWidth,
              overflow:document.documentElement.scrollWidth>innerWidth+1||shell.scrollWidth>shell.clientWidth+1,
              keys,groups:groups.map(group=>{
                const title=group.querySelector('.attendance-reminder-history-day-title'),
                  time=title?.querySelector('time'),rows=[...group.querySelectorAll('.attendance-reminder-history-item')],
                  groupBox=rect(group),headerBox=title&&rect(title);
                return {date:group.dataset.date,count:rows.length,
                  dateMatches:!!time&&time.dateTime===group.dataset.date&&time.textContent===faDate(group.dataset.date),
                  structure:!!group.querySelector(':scope > ul.attendance-reminder-items'),
                  inside:!!headerBox&&inside(headerBox,groupBox)&&rows.every(row=>inside(rect(row),groupBox)),
                  headerBeforeRows:!!headerBox&&rows.every(row=>rect(row).top>=headerBox.bottom-1),
                  clipped:[group,title,...rows].filter(Boolean).some(e=>e.scrollWidth>e.clientWidth+1),
                  bellOnly:rows.every(row=>/^زنگ [۰-۹]+$/.test(row.querySelector('.attendance-reminder-date').textContent.trim()))};
              }),
              targets:[...root.querySelectorAll('[data-workspace-action=attendance-reminder-restore]')].map(button=>({
                id:button.dataset.key,workspace:button.dataset.workspace,mutating:button.dataset.mutating,
                enabled:!button.disabled,actual:__attendanceHistoryProbeRows.find(row=>row.id===button.dataset.key)?.sourcePeriodId})),
              active:EduV24.test.getState().workspace.id};
          })()`);
          check(
            "HISTORY_DATE_GROUP_LAYOUT_" + width,
            !layout.overflow &&
              JSON.stringify(layout.keys) === JSON.stringify(expectedKeys) &&
              JSON.stringify(layout.groups.map((group) => group.date)) ===
                JSON.stringify(["2026-11-05", "2026-11-04", "2026-11-03"]) &&
              JSON.stringify(layout.groups.map((group) => group.count)) ===
                JSON.stringify([5, 2, 1]) &&
              layout.groups.every(
                (group) =>
                  group.dateMatches &&
                  group.structure &&
                  group.inside &&
                  group.headerBeforeRows &&
                  !group.clipped &&
                  group.bellOnly,
              ) &&
              layout.targets.every(
                (target) =>
                  target.enabled &&
                  target.workspace === target.actual &&
                  (target.workspace === layout.active
                    ? target.mutating === "1"
                    : target.mutating === undefined),
              ),
            layout,
          );
          const shot = await cdp("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(
            path.join(directory, `history-grouped-${width}.png`),
            Buffer.from(shot.data, "base64"),
          );
        }
        const pagination = await evaluate(`(()=>{
          const rows=Array.from({length:105},(_,index)=>({...__attendanceHistoryProbeRows[0],
            id:'boundary-'+String(index).padStart(3,'0'),period:0,
            className:'کلاس '+String(index).padStart(3,'0'),
            date:index<45?'2026-11-06':index<55?'2026-11-05':'2026-11-04'})).reverse(),
            before=JSON.stringify(rows),pages=[0,1,2].map(page=>{
              showModal('جلسات برگزارنشده',__attendanceHistoryProbeRender(rows,page));
              const root=document.querySelector('.attendance-reminder-history');
              return {dates:[...root.querySelectorAll('.attendance-reminder-history-day')].map(group=>group.dataset.date),
                keys:[...root.querySelectorAll('[data-workspace-action=attendance-reminder-restore]')].map(button=>button.dataset.key)};
            });
          return {pages,unchanged:JSON.stringify(rows)===before};
        })()`);
        check(
          "HISTORY_DATE_GROUP_PAGE_BOUNDARY",
          pagination.unchanged &&
            JSON.stringify(pagination.pages.map((page) => page.keys.length)) ===
              JSON.stringify([50, 50, 5]) &&
            JSON.stringify(pagination.pages.map((page) => page.dates)) ===
              JSON.stringify([
                ["2026-11-06", "2026-11-05"],
                ["2026-11-05", "2026-11-04"],
                ["2026-11-04"],
              ]) &&
            JSON.stringify(pagination.pages.flatMap((page) => page.keys)) ===
              JSON.stringify(
                Array.from(
                  { length: 105 },
                  (_, index) => "boundary-" + String(index).padStart(3, "0"),
                ),
              ),
          pagination,
        );
      } finally {
        await evaluate(`(()=>{
          closeModal();delete globalThis.__attendanceHistoryProbeRows;
          delete globalThis.__attendanceHistoryProbeRender;
        })()`);
      }
      check("HISTORY_GROUPING_NO_WRITES", before === (await signature()));
    };
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
        const region=document.getElementById('attendanceReminderRegion'),box=region.getBoundingClientRect(),welcome=document.querySelector('.schools-welcome').getBoundingClientRect(),agenda=document.querySelector('.today-agenda').getBoundingClientRect(),
          rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},
          inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1,
          overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,
          rows=[...region.querySelectorAll('.attendance-reminder-open')].map(button=>{
            const r=rect(button),identity=button.querySelector('.attendance-reminder-identity'),
              status=button.querySelector('.attendance-reminder-status'),meta=button.querySelector('.attendance-reminder-meta'),
              parts=[identity,status,meta].filter(Boolean).map(rect),
              content=[...button.querySelectorAll('.attendance-reminder-identity,.attendance-reminder-status,.attendance-reminder-meta,.attendance-reminder-date,.attendance-reminder-school')];
            return {height:r.height,hasCompactParts:!!identity&&!!status&&!!meta,
              inside:parts.every(p=>inside(p,r)),overlap:parts.some((p,i)=>parts.slice(i+1).some(q=>overlaps(p,q))),
              clipped:content.some(e=>e.scrollWidth>e.clientWidth+1),
              decorations:button.querySelectorAll('svg,.control-icon,.attendance-reminder-arrow').length,
              pseudo:['::before','::after'].map(p=>getComputedStyle(button,p).content)};
          });
        return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
          afterBanner:box.top>=welcome.bottom-1,beforeAgenda:box.bottom<=agenda.top+1,
          top:box.top,bottom:box.bottom,height:box.height,visibility:getComputedStyle(region).visibility,
          inside:[...region.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1&&r.height>=44}),
          grid:getComputedStyle(region.querySelector('.attendance-reminder-open')).display,
          headingDecoration:!!region.querySelector('.attendance-reminders-symbol'),rows};
      })()`);
      check(
        "LAYOUT_" + width,
        !layout.overflow &&
          layout.inside &&
          layout.grid === "grid" &&
          layout.height > 100 &&
          layout.visibility === "visible" &&
          layout.afterBanner &&
          layout.beforeAgenda &&
          !layout.headingDecoration &&
          layout.rows.length === 3 &&
          layout.rows.every(
            (row) =>
              row.hasCompactParts &&
              row.inside &&
              !row.overlap &&
              !row.clipped &&
              row.height >= 44 &&
              row.height <= (width < 700 ? 110 : 80) &&
              row.decorations === 0 &&
              row.pseudo.every((value) =>
                ["none", "normal", '""'].includes(value),
              ),
          ),
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
    await reviewLayouts("missing");
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
    await footerLayouts();
    if (baselineFooter) return;
    await orderedHistoryProbe();
    await click("attendance-reminders-not-held");
    await wait(
      "!!document.querySelector('[data-workspace-action=attendance-reminder-restore]')",
    );
    await historyLayouts();
    await click("attendance-reminder-restore");
    await wait(
      "db.notHeldSessions.length===0&&!EduV24.test.getState().busy&&!!document.querySelector('.attendance-reminder-history .attendance-reminders-empty')",
    );
    const emptyHistory = await evaluate(`(()=>{
      const root=document.querySelector('#modal:not(.hidden) .attendance-reminder-history'),
        empty=root.querySelector('.attendance-reminder-history-empty.attendance-reminders-empty'),
        count=root.querySelector('.attendance-reminder-history-count');
      return {visible:!!empty&&empty.getClientRects().length>0,
        count:count?.textContent.trim(),hasTitle:!!empty?.querySelector('strong,h4'),
        noRestore:!root.querySelector('[data-workspace-action=attendance-reminder-restore]'),
        sessions:db.sessions.length,markers:db.notHeldSessions.length};
    })()`);
    check(
      "HISTORY_EMPTY_AFTER_RESTORE",
      emptyHistory.visible &&
        emptyHistory.count?.includes("۰") &&
        emptyHistory.hasTitle &&
        emptyHistory.noRestore &&
        emptyHistory.sessions === 1 &&
        emptyHistory.markers === 0,
      emptyHistory,
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
    await reviewLayouts("incomplete");
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
    await evaluate(`(()=>{
      const session=db.sessions.find(s=>s.id!=='reminder-incomplete');
      globalThis.__emptyReminderAudit={id:session.id,
        key:[session.date,session.period,session.schoolId,session.classId,session.lessonId].join('|'),
        session:structuredClone(session),originalConfirm:window.confirm,confirmations:[]};
    })()`);
    await evaluate("closeModal();goSchools()");
    await wait(
      "!![...document.querySelectorAll('#attendanceReminderRegion .is-empty [data-key]')].find(b=>b.dataset.key===__emptyReminderAudit.key)",
    );
    const empty = await evaluate(`(()=>{
      const button=[...document.querySelectorAll('#attendanceReminderRegion .is-empty [data-key]')]
        .find(b=>b.dataset.key===__emptyReminderAudit.key);
      return {label:button.querySelector('.attendance-reminder-status').textContent,
        empty:db.sessions.find(s=>s.id===__emptyReminderAudit.id),markers:db.notHeldSessions.length};
    })()`);
    check(
      "OPENED_UNRECORDED_SESSION_IS_EMPTY_NOT_INCOMPLETE",
      empty.label.includes("ثبت شروع نشده") &&
        Object.keys(empty.empty.attendance).length === 0 &&
        empty.empty.scores.length === 0 &&
        empty.markers === 0,
      empty,
    );
    // A reminder owned by the other term must navigate to a fresh owner
    // dialog. The route itself may not silently remove a peer session.
    await evaluate(`(async()=>{
      __emptyReminderAudit.peerBefore=JSON.stringify((await EduV24.snapshotInstallation()).stores);
      await EduV24.switchPeriod('reminder-second');goSchools();
      window.confirm=message=>{__emptyReminderAudit.confirmations.push(String(message));return false};
    })()`);
    await wait(
      "!![...document.querySelectorAll('#attendanceReminderRegion .is-empty [data-key]')].find(b=>b.dataset.key===__emptyReminderAudit.key)",
    );
    await evaluate(
      "[...document.querySelectorAll('#attendanceReminderRegion .is-empty [data-key]')].find(b=>b.dataset.key===__emptyReminderAudit.key).click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog.is-empty [data-workspace-action=attendance-reminder-not-held]')",
    );
    await click("attendance-reminder-not-held");
    await wait(
      "EduV24.test.getState().workspace.id==='reminder-first'&&EduV24.getReportContext().ready&&!EduV24.test.getState().busy&&!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog.is-empty [data-workspace-action=attendance-reminder-not-held][data-mutating=\"1\"]')",
    );
    const routed = await evaluate(`(async()=>({
      unchanged:__emptyReminderAudit.peerBefore===JSON.stringify((await EduV24.snapshotInstallation()).stores),
      confirmations:__emptyReminderAudit.confirmations.length,
      existing:JSON.stringify(db.sessions.find(s=>s.id===__emptyReminderAudit.id))===JSON.stringify(__emptyReminderAudit.session),
      markers:db.notHeldSessions.length,owner:EduV24.test.getState().workspace.id
    }))()`);
    check(
      "EMPTY_PEER_NAVIGATES_OWNER_WITHOUT_WRITING_OR_CONFIRMING",
      routed.unchanged &&
        routed.confirmations === 0 &&
        routed.existing &&
        routed.markers === 0 &&
        routed.owner === "reminder-first",
      routed,
    );
    await reviewLayouts("empty");
    const beforeCancel = await signature();
    await click("attendance-reminder-not-held");
    await wait(
      "__emptyReminderAudit.confirmations.length===1&&!EduV24.test.getState().busy",
    );
    const canceled = await evaluate(`({
      confirmations:__emptyReminderAudit.confirmations,
      dialog:!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog.is-empty'),
      existing:!!db.sessions.find(s=>s.id===__emptyReminderAudit.id),markers:db.notHeldSessions.length
    })`);
    check(
      "EMPTY_CONVERSION_CANCEL_IS_EXACT_NO_OP",
      beforeCancel === (await signature()) &&
        canceled.dialog &&
        canceled.existing &&
        canceled.markers === 0 &&
        canceled.confirmations.length === 1 &&
        canceled.confirmations[0].length > 30,
      canceled,
    );
    await evaluate(`(()=>{
      __emptyReminderAudit.before=structuredClone(db);
      window.confirm=message=>{__emptyReminderAudit.confirmations.push(String(message));return true};
      EduV24.test.failNextWrite();
    })()`);
    await click("attendance-reminder-not-held");
    await wait(
      "!EduV24.test.getState().busy&&!!document.getElementById('operationError')?.textContent",
    );
    const failedEmpty = await evaluate(`(async()=>{
      const durable=EduV24.validateFullBackup(await EduV24.snapshotInstallation()).find(p=>p.period.id==='reminder-first').data;
      return {same:JSON.stringify(db)===JSON.stringify(__emptyReminderAudit.before),
        durableSame:JSON.stringify(durable)===JSON.stringify(__emptyReminderAudit.before),
        existing:!!db.sessions.find(s=>s.id===__emptyReminderAudit.id),markers:db.notHeldSessions.length};
    })()`);
    check(
      "EMPTY_FAILED_ATOMIC_WRITE_PRESERVES_SESSION_AND_NO_MARKER",
      failedEmpty.same &&
        failedEmpty.durableSame &&
        failedEmpty.existing &&
        failedEmpty.markers === 0,
      failedEmpty,
    );
    await evaluate("closeModal();goSchools()");
    await wait(
      "!![...document.querySelectorAll('#attendanceReminderRegion .is-empty [data-key]')].find(b=>b.dataset.key===__emptyReminderAudit.key)",
    );
    await evaluate(
      "[...document.querySelectorAll('#attendanceReminderRegion .is-empty [data-key]')].find(b=>b.dataset.key===__emptyReminderAudit.key).click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog.is-empty')",
    );
    await click("attendance-reminder-not-held");
    await wait(
      "!db.sessions.some(s=>s.id===__emptyReminderAudit.id)&&db.notHeldSessions.length===1&&!EduV24.test.getState().busy&&document.getElementById('modal').classList.contains('hidden')",
    );
    const converted = await evaluate(`(async()=>{
      const marker=db.notHeldSessions[0],prior=__emptyReminderAudit.before,
        expected={...prior,sessions:prior.sessions.filter(s=>s.id!==__emptyReminderAudit.id),notHeldSessions:[marker]},
        old=__emptyReminderAudit.session,
        options={mode:'daily',date:old.date,schoolId:old.schoolId,classId:old.classId,audience:'management',detailLevel:'full'},
        report=EduReportModel.build(db,options,{generatedAt:new Date().toISOString()}),
        before=EduReportModel.build(prior,options,{generatedAt:new Date().toISOString()}),
        backup=await EduV24.snapshotInstallation(),
        durable=EduV24.validateFullBackup(backup).find(p=>p.period.id==='reminder-first').data;
      __emptyReminderAudit.converted=structuredClone(db);__emptyReminderAudit.backup=backup;
      return {onlyExpected:JSON.stringify(db)===JSON.stringify(expected),
        durableSame:JSON.stringify(durable)===JSON.stringify(db),
        markerExact:['date','period','schoolId','classId','lessonId'].every(k=>marker[k]===old[k]),
        count:db.sessions.length,markers:db.notHeldSessions.length,
        reportCount:report.summary.sessions,beforeReportCount:before.summary.sessions,
        absence:report.summary.absent,beforeAbsence:before.summary.absent,
        noFake:db.sessions.every(s=>JSON.stringify(s)===JSON.stringify(prior.sessions.find(old=>old.id===s.id)))};
    })()`);
    check(
      "EMPTY_RETRY_CONVERTS_EXACTLY_ONE_SESSION_TO_MARKER",
      converted.onlyExpected &&
        converted.durableSame &&
        converted.markerExact &&
        converted.count === 1 &&
        converted.markers === 1 &&
        converted.noFake &&
        converted.reportCount === converted.beforeReportCount - 1 &&
        converted.absence === converted.beforeAbsence,
      converted,
    );
    const convertedBackup = await evaluate("__emptyReminderAudit.backup");
    const convertedDB = await evaluate(
      "JSON.stringify(__emptyReminderAudit.converted)",
    );
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    check(
      "EMPTY_CONVERSION_RELOAD_DURABLE",
      convertedDB === (await evaluate("JSON.stringify(db)")),
    );
    await evaluate(`(async()=>{
      EduV24.previewFullBackup(${JSON.stringify(convertedBackup)});
      document.getElementById('fullRestoreConfirmed').checked=true;
      await EduV24.restoreFullBackup();goSchools();
    })()`);
    check(
      "EMPTY_CONVERSION_BACKUP_RESTORE_ROUNDTRIP",
      convertedDB === (await evaluate("JSON.stringify(db)")),
    );
    await wait(
      "!!document.querySelector('[data-workspace-action=attendance-reminders-not-held]')",
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
      "!!document.querySelector('#attendanceReminderRegion .is-missing button')",
    );
    check(
      "EMPTY_MARKER_RESTORE_RETURNS_MISSING_NOT_OLD_SESSION",
      await evaluate(
        "db.sessions.length===1&&db.sessions[0].id==='reminder-incomplete'&&db.notHeldSessions.length===0&&!document.querySelector('#attendanceReminderRegion .is-empty')",
      ),
    );
    // A zero-valued activity is real recorded data, even when no attendance
    // has been entered. It must never be offered as an empty session.
    await evaluate(
      "document.querySelector('#attendanceReminderRegion .is-missing button').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog.is-missing')",
    );
    await click("attendance-reminder-record");
    await wait(
      "!!document.querySelector('.session-workspace[data-session-mode=edit]')&&db.sessions.length===2&&!EduV24.test.getState().busy",
    );
    await evaluate(`(()=>{
      const root=document.querySelector('.session-workspace');
      globalThis.__activityReminderId=root.dataset.sessionId;
      showSessionPanel('activity');const form=root.querySelector('.session-entry-form');
      form.elements.studentId.value='reminder-student-a';form.elements.type.value='positive';
      form.elements.value.value='0';form.elements.note.value='Synthetic zero is meaningful';form.requestSubmit();
    })()`);
    await wait(
      "db.sessions.find(s=>s.id===__activityReminderId)?.scores.length===1&&!EduV24.test.getState().busy",
    );
    await evaluate("closeModal();goSchools()");
    await wait(
      "!!document.querySelector('#attendanceReminderRegion .is-incomplete button')",
    );
    await evaluate(
      "document.querySelector('#attendanceReminderRegion .is-incomplete button').click()",
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .attendance-reminder-dialog.is-incomplete')",
    );
    check(
      "ZERO_ACTIVITY_IS_INCOMPLETE_AND_NOT_DESTRUCTIVELY_MARKABLE",
      await evaluate(`(()=>{
        const session=db.sessions.find(s=>s.id===__activityReminderId);
        return !document.querySelector('[data-workspace-action=attendance-reminder-not-held]')&&
          session.scores.length===1&&session.scores[0].value===0&&
          Object.keys(session.attendance).length===0&&db.notHeldSessions.length===0;
      })()`),
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
  } catch (error) {
    console.error(
      "Attendance reminder browser primary failure: " +
        (error.stack || String(error)),
    );
    throw error;
  } finally {
    if (!(await evaluate("!!globalThis.EduV24?.getReportContext?.().ready")))
      await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    await evaluate(`(async()=>{
      if(globalThis.__emptyReminderAudit?.originalConfirm)
        window.confirm=__emptyReminderAudit.originalConfirm;
      delete globalThis.__emptyReminderAudit;delete globalThis.__activityReminderId;
      closeModal();EduV24.previewFullBackup(${JSON.stringify(original)});
      document.getElementById('fullRestoreConfirmed').checked=true;
      await EduV24.restoreFullBackup();
    })()`);
  }
  check(
    "PREVIEWS",
    fs.readdirSync(directory).filter((name) => name.endsWith(".png")).length ===
      54,
    { directory, fixture },
  );
}

module.exports = { run, seedReminders };
if (require.main === module)
  main({
    stage: "attendance-reminders",
    runExtra: (context) =>
      run({
        ...context,
        baselineFooter: process.argv.includes("--baseline-footer"),
      }),
  }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
