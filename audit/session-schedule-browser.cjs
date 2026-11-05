"use strict";

// Synthetic browser coverage for schedule-bound session creation and editing.
// The complete original installation is restored by report-surface cleanup.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

async function run(env) {
  const { cdp, evaluate, cases, delay } = env,
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "edu-session-schedule-")),
    page = (fn, value = null) =>
      evaluate("(" + fn.toString() + ")(" + JSON.stringify(value) + ")"),
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (fn, message) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await fn()) return;
        await delay(50);
      }
      throw Error(message);
    };
  const signature = () =>
    page(async () => {
      await EduV24.test.settle();
      const snapshot = await EduV24.snapshotInstallation();
      return JSON.stringify(
        ["records", "catalog", "events", "undo", "reports"].map(
          (name) => snapshot.stores[name],
        ),
      );
    });
  const navigate = async (classKey = "a") => {
    await page((key) => {
      closeModal();
      const ids = window.__reportSurfaceIds;
      Object.assign(state, {
        view: "lesson",
        schoolId: ids.school,
        classId: ids[key],
        lessonId: ids[key] + "_lesson",
        tab: "sessions",
      });
      render();
    }, classKey);
    await wait(
      () => page(() => !!document.querySelector(".session-create-form")),
      "The actual lesson session form did not appear",
    );
  };
  const chooseCreateDate = (date, forcedPeriod = null) =>
    page(
      ({ date, forcedPeriod }) => {
        const form = document.querySelector(".session-create-form");
        form.elements.date.value = date;
        form.elements.date.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
        const offered = [...form.elements.period.options].map(
          (option) => option.value,
        );
        if (forcedPeriod !== null) {
          if (
            ![...form.elements.period.options].some(
              (option) => option.value === String(forcedPeriod),
            )
          )
            form.elements.period.add(
              new Option("زنگ تزریق‌شده برای آزمون", String(forcedPeriod)),
            );
          form.elements.period.value = String(forcedPeriod);
        }
        return {
          tag: form.elements.period.tagName,
          offered,
          hint: form
            .closest(".session-create")
            .querySelector("[data-session-schedule-status]").textContent,
        };
      },
      { date, forcedPeriod },
    );
  const submitCreate = () =>
    page(() => {
      const form = document.querySelector(".session-create-form"),
        audit = window.__sessionScheduleAudit;
      audit.previousNotice = document.querySelector(
        ".session-validation-alert",
      );
      audit.previousWorkspace = document.querySelector(
        "#modalBody .session-workspace",
      );
      form.requestSubmit(form.querySelector('button[type="submit"]'));
    });
  const waitError = () =>
    wait(
      () =>
        page(() => {
          const notice = document.querySelector(".session-validation-alert");
          return (
            !!notice &&
            notice !== window.__sessionScheduleAudit.previousNotice &&
            notice.getBoundingClientRect().width > 0 &&
            notice.getAttribute("role") === "alert"
          );
        }),
      "The invalid session action did not display its inline alert",
    );
  const waitSession = () =>
    wait(
      () =>
        page(() => {
          const modal = document.getElementById("modal"),
            workspace = document.querySelector("#modalBody .session-workspace");
          return (
            !!workspace &&
            workspace !== window.__sessionScheduleAudit.previousWorkspace &&
            !modal.classList.contains("hidden") &&
            workspace.getBoundingClientRect().width > 0
          );
        }),
      "The session action did not open a new visible editor",
    );
  const errorObservation = () =>
    page(() => ({
      message:
        document.querySelector(".session-validation-alert p")?.textContent ||
        "",
      nativeAlerts: window.__sessionScheduleAudit.alerts.length,
      confirmations: window.__sessionScheduleAudit.confirmations.length,
    }));
  const denyCreate = async (id, name, date, period, classKey = "a") => {
    await navigate(classKey);
    const options = await chooseCreateDate(date, period),
      before = await signature();
    await submitCreate();
    await waitError();
    const observed = await errorObservation(),
      unchanged = (await signature()) === before;
    check(
      id,
      name,
      unchanged &&
        observed.nativeAlerts === 0 &&
        observed.confirmations === 0 &&
        observed.message.includes("برنامه"),
      {
        unchanged,
        ...observed,
        offered: options.offered,
        hint: options.hint,
      },
    );
    return options;
  };
  const openEditor = async (id) => {
    await page((sessionId) => {
      const audit = window.__sessionScheduleAudit;
      audit.previousWorkspace = document.querySelector(
        "#modalBody .session-workspace",
      );
      closeModal();
      openSessionModal(getSessionById(sessionId));
      document.querySelector(".session-date-tools").open = true;
    }, id);
    await waitSession();
  };
  const chooseEditorDate = (date, forcedPeriod = null) =>
    page(
      ({ date, forcedPeriod }) => {
        const field = document.getElementById("sessDate"),
          select = document.getElementById("sessPeriod");
        field.value = date;
        field.dispatchEvent(new Event("change", { bubbles: true }));
        const offered = [...select.options].map((option) => option.value);
        if (forcedPeriod !== null) {
          if (
            ![...select.options].some(
              (option) => option.value === String(forcedPeriod),
            )
          )
            select.add(
              new Option("زنگ تزریق‌شده برای آزمون", String(forcedPeriod)),
            );
          select.value = String(forcedPeriod);
        }
        return {
          tag: select.tagName,
          offered,
          hint: document.getElementById("sessScheduleStatus").textContent,
        };
      },
      { date, forcedPeriod },
    );
  const saveEditor = () =>
    page(() => {
      const audit = window.__sessionScheduleAudit;
      audit.previousNotice = document.querySelector(
        ".session-validation-alert",
      );
      audit.previousWorkspace = document.querySelector(
        "#modalBody .session-workspace",
      );
      document.querySelector('[data-legacy-click="sessions-dialog:1"]').click();
    });
  const denyEditor = async (id, name, sessionId, date, period) => {
    await openEditor(sessionId);
    const options = await chooseEditorDate(date, period),
      before = await signature();
    await saveEditor();
    await waitError();
    const observed = await errorObservation(),
      unchanged = (await signature()) === before;
    check(
      id,
      name,
      unchanged &&
        observed.nativeAlerts === 0 &&
        observed.confirmations === 0 &&
        observed.message.includes("برنامه"),
      { unchanged, offered: options.offered, ...observed },
    );
  };

  let configured = false;
  const inspectSessionCalendar = (selector) =>
    page((selector) => {
      const field = document.querySelector(selector);
      field.nextElementSibling.click();
      calViewYear = 1405;
      calViewMonth = 8;
      renderShamsiCalendar();
      const popup = document.getElementById("calPopup");
      const days = [
        ...popup.querySelectorAll('[data-calendar-action="select"]'),
      ].map((button) => ({
        button,
        date: calendarISODate(
          ...jalaliToGregorian(
            calViewYear,
            calViewMonth,
            Number(button.dataset.calendarDay),
          ),
        ),
      }));
      const disabled = (date) =>
        days.find((item) => item.date === date).button.disabled;
      const result = {
        availableColored: days
          .filter(
            (item) =>
              !item.button.disabled &&
              !item.button.classList.contains("selected"),
          )
          .every(
            (item) =>
              getComputedStyle(item.button).backgroundColor ===
                "rgb(234, 246, 240)" &&
              getComputedStyle(item.button).color === "rgb(22, 102, 78)",
          ),
        scheduled: !disabled("2026-11-03"),
        wrongDay: disabled("2026-11-04"),
        wrongParity: disabled("2026-11-10"),
        nextOdd: !disabled("2026-11-17"),
      };
      const forbidden = days.find((item) => item.date === "2026-11-04").button,
        before = field.value;
      forbidden.click();
      result.blocked =
        window.calSelectDay(Number(forbidden.dataset.calendarDay)) === false &&
        field.value === before;
      days.find((item) => item.date === "2026-11-03").button.click();
      result.selected =
        field.value === "2026-11-03" && !popup.classList.contains("open");
      return result;
    }, selector);
  try {
    await require("./browser-ready.cjs")(env);
    await evaluate(
      "(" + require("./report-surface-layout.cjs").setup.toString() + ")()",
    );
    configured = true;
    await page(() => {
      const audit = {
        originalAlert: window.alert,
        originalConfirm: window.confirm,
        capture: true,
        alerts: [],
        confirmations: [],
        previousNotice: null,
        previousWorkspace: null,
      };
      window.__sessionScheduleAudit = audit;
      window.alert = (message) => {
        if (!audit.capture) return audit.originalAlert.call(window, message);
        audit.alerts.push(String(message));
      };
      window.confirm = (message) => {
        if (!audit.capture) return audit.originalConfirm.call(window, message);
        audit.confirmations.push(String(message));
        return false;
      };
    });

    const emptyOptions = await denyCreate(
      "SCHEDULE_EMPTY_REJECT",
      "An empty weekly program rejects real form submission without writes or override confirmation",
      "2026-11-03",
      1,
    );
    check(
      "SCHEDULE_EMPTY_OPTIONS",
      "An unscheduled date offers no native bell choices",
      emptyOptions.tag === "SELECT" &&
        emptyOptions.offered.filter(Boolean).length === 0 &&
        emptyOptions.hint.includes("برنامه ندارد"),
      { offered: emptyOptions.offered },
    );

    await page(async () => {
      const audit = window.__sessionScheduleAudit;
      audit.capture = false;
      try {
        const fixture = await EduV24.snapshotInstallation(),
          ids = window.__reportSurfaceIds,
          scheduled = {
            schoolId: ids.school,
            classId: ids.a,
            lessonId: ids.a + "_lesson",
          },
          override = {
            schoolId: ids.school,
            classId: ids.b,
            lessonId: ids.b + "_lesson",
          };
        for (const record of fixture.stores.records)
          if (record.logical === "meta") {
            record.value.masterSchedule = {
              "3-0-all": { ...scheduled },
              "3-0-even": { ...override },
            };
            record.value.activeDays = [0, 1, 2, 3, 4, 5];
            record.value.periods = 3;
            record.value.settings.weekStartDate = "2026-10-31";
          }
        closeModal();
        EduV24.previewFullBackup(fixture);
        document.getElementById("fullRestoreConfirmed").checked = true;
        await EduV24.restoreFullBackup();
        await EduV24.test.settle();
        audit.historicalId = ids.second + "_session_0";
        audit.historical = structuredClone(getSessionById(audit.historicalId));
      } finally {
        audit.capture = true;
        audit.alerts.length = 0;
        audit.confirmations.length = 0;
      }
    });
    await navigate("a");
    const calendarCreation = await inspectSessionCalendar(
      '.session-create-form input[type="date"]',
    );
    check(
      "SCHEDULE_CALENDAR_CREATE",
      "Session creation calendar disables wrong weekdays and parity and blocks injected selections",
      Object.values(calendarCreation).every(Boolean),
      calendarCreation,
    );
    await page(() =>
      document
        .querySelector(".session-create-form [data-gregorian-target]")
        .click(),
    );
    await delay(100);
    const calendarImage = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(directory, "calendar-create.png"),
      Buffer.from(calendarImage.data, "base64"),
    );
    await page(() => closeShamsiCalendar());
    await openEditor(
      await page(() => window.__sessionScheduleAudit.historicalId),
    );
    const calendarEdit = await inspectSessionCalendar("#sessDate");
    check(
      "SCHEDULE_CALENDAR_EDIT",
      "Session editor calendar uses the same schedule policy",
      Object.values(calendarEdit).every(Boolean),
      calendarEdit,
    );
    await page(() => {
      closeModal();
      goReports();
      setReportTab("daily");
      document
        .querySelector(".periodic-controls [data-gregorian-target]")
        .click();
      calViewYear = 1405;
      calViewMonth = 8;
      renderShamsiCalendar();
    });
    const reportCalendarFree = await page(
      () =>
        !document.querySelector(
          "#calPopup .cal-days button:disabled:not(.empty)",
        ),
    );
    check(
      "SCHEDULE_CALENDAR_REPORT_FREE",
      "Report calendar remains unrestricted by the weekly teaching plan",
      reportCalendarFree,
    );
    await page(() => closeShamsiCalendar());
    await denyCreate(
      "SCHEDULE_WRONG_WEEKDAY",
      "A Wednesday cannot create Tuesday's lesson even with an injected bell",
      "2026-11-04",
      1,
    );
    const tuesdayOptions = await denyCreate(
      "SCHEDULE_WRONG_BELL",
      "Tuesday's assigned first bell cannot be changed to an injected second bell",
      "2026-11-03",
      2,
    );
    check(
      "SCHEDULE_ALLOWED_OPTIONS",
      "The native Tuesday picker lists only its scheduled first bell",
      tuesdayOptions.tag === "SELECT" &&
        JSON.stringify(tuesdayOptions.offered) === '["1"]',
      { offered: tuesdayOptions.offered, hint: tuesdayOptions.hint },
    );

    await navigate("a");
    await chooseCreateDate("2026-11-03");
    const beforeCreate = await page(() => db.sessions.length);
    await submitCreate();
    await waitSession();
    const created = await page(async () => {
      await EduV24.test.settle();
      const ids = window.__reportSurfaceIds,
        session = db.sessions.find(
          (item) =>
            item.classId === ids.a &&
            item.date === "2026-11-03" &&
            item.period === 0,
        );
      window.__sessionScheduleAudit.createdId = session?.id;
      return {
        id: session?.id,
        count: db.sessions.length,
        roster: session?.roster.length,
        scores: session?.scores.length,
      };
    });
    check(
      "SCHEDULE_MATCH_ACCEPT",
      "The matching odd-week Tuesday creates exactly one session",
      !!created.id &&
        created.count === beforeCreate + 1 &&
        created.roster === 3 &&
        created.scores === 0,
      { countAdded: created.count - beforeCreate, roster: created.roster },
    );
    if (!created.id) throw Error("The matching session was not created");

    await denyEditor(
      "SCHEDULE_EDIT_WRONG_DATE",
      "Moving an existing session to Wednesday preserves every stored value",
      created.id,
      "2026-11-04",
      1,
    );
    await denyEditor(
      "SCHEDULE_EDIT_WRONG_BELL",
      "Moving an existing session to an unscheduled bell preserves every stored value",
      created.id,
      "2026-11-03",
      2,
    );
    await openEditor(created.id);
    const moveOptions = await chooseEditorDate("2026-11-17");
    await saveEditor();
    await waitSession();
    const moved = await page(async (id) => {
      await EduV24.test.settle();
      const session = getSessionById(id);
      return { date: session.date, period: session.period, id: session.id };
    }, created.id);
    check(
      "SCHEDULE_EDIT_MATCH_MOVE",
      "A matching odd-week Tuesday move preserves session identity and scheduled bell",
      moved.id === created.id &&
        moved.date === "2026-11-17" &&
        moved.period === 0 &&
        moveOptions.tag === "SELECT" &&
        JSON.stringify(moveOptions.offered) === '["1"]',
      moved,
    );

    await denyCreate(
      "SCHEDULE_EVEN_OVERRIDE_REJECT",
      "The even-week replacement prevents class A from using class B's bell",
      "2026-11-10",
      1,
      "a",
    );
    await navigate("b");
    const evenOptions = await chooseCreateDate("2026-11-10"),
      beforeEven = await page(() => db.sessions.length);
    await submitCreate();
    await waitSession();
    const evenCreated = await page(async () => {
      await EduV24.test.settle();
      return {
        count: db.sessions.length,
        matches: db.sessions.some(
          (item) =>
            item.classId === window.__reportSurfaceIds.b &&
            item.lessonId === window.__reportSurfaceIds.b + "_lesson" &&
            item.date === "2026-11-10" &&
            item.period === 0,
        ),
      };
    });
    check(
      "SCHEDULE_EVEN_OVERRIDE_ACCEPT",
      "The even-week replacement creates only class B's scheduled session",
      JSON.stringify(evenOptions.offered) === '["1"]' &&
        evenCreated.matches &&
        evenCreated.count === beforeEven + 1,
      {
        offered: evenOptions.offered,
        countAdded: evenCreated.count - beforeEven,
      },
    );

    for (const reason of ["class", "lesson"]) {
      await page(() => {
        closeModal();
        goMaster();
        const audit = window.__sessionScheduleAudit;
        audit.previousStart = document.querySelector(".session-start-panel");
        clickMasterCell(3, 0);
      });
      await wait(
        () =>
          page(() => {
            const panel = document.querySelector(".session-start-panel");
            return (
              !!panel &&
              panel !== window.__sessionScheduleAudit.previousStart &&
              !document.getElementById("modal").classList.contains("hidden")
            );
          }),
        "The real timetable start modal did not appear",
      );
      const calendarMaster = await inspectSessionCalendar("#sessNewDate");
      check(
        "SCHEDULE_CALENDAR_MASTER_" + reason,
        "Timetable date calendar honors the selected class, lesson, weekday and bell",
        Object.values(calendarMaster).every(Boolean),
        calendarMaster,
      );
      await page((changed) => {
        const ids = window.__reportSurfaceIds,
          classes = document.getElementById("sessNewClass"),
          lessons = document.getElementById("sessNewLesson");
        classes.value = changed === "class" ? ids.b : ids.a;
        classes.dispatchEvent(new Event("change", { bubbles: true }));
        if (changed === "lesson") {
          lessons.add(
            new Option("درس کلاس دیگر برای آزمون", ids.b + "_lesson"),
          );
          lessons.value = ids.b + "_lesson";
        }
        const date = document.getElementById("sessNewDate");
        date.value = "2026-11-03";
        date.dispatchEvent(new Event("change", { bubbles: true }));
      }, reason);
      const before = await signature();
      await page(() => {
        window.__sessionScheduleAudit.previousNotice = document.querySelector(
          ".session-validation-alert",
        );
        document
          .querySelector('[data-legacy-click="schedule-timetable:15"]')
          .click();
      });
      await waitError();
      const observed = await errorObservation(),
        unchanged = (await signature()) === before;
      check(
        "SCHEDULE_MASTER_RETARGET_" + reason.toUpperCase(),
        "Retargeting the timetable " +
          reason +
          " cannot bypass the weekly assignment",
        unchanged &&
          observed.nativeAlerts === 0 &&
          observed.confirmations === 0 &&
          observed.message.length > 0,
        { unchanged, ...observed },
      );
    }

    await navigate("a");
    const historicalOptions = await chooseCreateDate("2026-11-02"),
      beforeContinue = await signature();
    await submitCreate();
    await waitSession();
    const historical = await page(() => ({
      id: currentSessionId,
      expected: window.__sessionScheduleAudit.historicalId,
      unchanged:
        JSON.stringify(getSessionById(currentSessionId)) ===
        JSON.stringify(window.__sessionScheduleAudit.historical),
    }));
    check(
      "SCHEDULE_HISTORICAL_CONTINUE",
      "Existing historical sessions remain reopenable without a new schedule or altered attendance",
      historical.id === historical.expected &&
        historical.unchanged &&
        historicalOptions.offered.includes("1") &&
        (await signature()) === beforeContinue,
      {
        historicalUnchanged: historical.unchanged,
        offered: historicalOptions.offered,
      },
    );
    await page(() => {
      const sid = window.__reportSurfaceIds.a + "_student_2";
      document
        .querySelector('.att-btns[data-sid="' + sid + '"] button.present')
        .click();
    });
    await wait(
      () =>
        page(() => {
          const audit = window.__sessionScheduleAudit,
            sid = window.__reportSurfaceIds.a + "_student_2";
          return (
            getSessionById(audit.historicalId).attendance[sid] === "present"
          );
        }),
      "The historical attendance correction did not save",
    );
    const corrected = await page(async () => {
      await EduV24.test.settle();
      const audit = window.__sessionScheduleAudit,
        live = getSessionById(audit.historicalId),
        expected = structuredClone(audit.historical);
      expected.attendance[window.__reportSurfaceIds.a + "_student_2"] =
        "present";
      return JSON.stringify(live) === JSON.stringify(expected);
    });
    check(
      "SCHEDULE_HISTORICAL_ATTENDANCE",
      "An off-schedule historical attendance correction preserves its date, roster and activities",
      corrected,
    );

    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await navigate("a");
      await chooseCreateDate("2026-11-17");
      await page(() =>
        document
          .querySelector(".session-create")
          .scrollIntoView({ block: "start" }),
      );
      const formMetrics = await page(() => {
        const form = document.querySelector(".session-create-form"),
          picker = form.elements.period;
        return {
          documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
          formFits: form.scrollWidth <= form.clientWidth + 1,
          controlsFit: [...form.querySelectorAll("input,select,button")]
            .filter((control) => control.getClientRects().length > 0)
            .every(
              (control) =>
                control.scrollWidth <= control.clientWidth + 1 &&
                control.getBoundingClientRect().height >= 44,
            ),
          select: picker.tagName === "SELECT",
          offered: [...picker.options].map((option) => option.value),
        };
      });
      const formScreenshot = path.join(directory, "create-" + width + ".png"),
        formImage = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
      fs.writeFileSync(formScreenshot, Buffer.from(formImage.data, "base64"));
      await openEditor(created.id);
      await page(() =>
        document
          .querySelector(".session-date-tools")
          .scrollIntoView({ block: "start" }),
      );
      const editorMetrics = await page(() => {
        const panel = document.querySelector(".session-date-tools"),
          dialog = panel.closest(".modal-dialog"),
          rect = dialog.getBoundingClientRect();
        return {
          dialogFits: rect.left >= -1 && rect.right <= innerWidth + 1,
          editorFits: panel.scrollWidth <= panel.clientWidth + 1,
          controlsFit: [...panel.querySelectorAll("input,select,button")]
            .filter((control) => control.getClientRects().length > 0)
            .every(
              (control) =>
                control.scrollWidth <= control.clientWidth + 1 &&
                control.getBoundingClientRect().height >= 44,
            ),
          select: document.getElementById("sessPeriod").tagName === "SELECT",
        };
      });
      const editorScreenshot = path.join(directory, "edit-" + width + ".png"),
        editorImage = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
      fs.writeFileSync(
        editorScreenshot,
        Buffer.from(editorImage.data, "base64"),
      );
      check(
        "SCHEDULE_RESPONSIVE_" + width,
        "The schedule-bound session form and date editor fit " +
          width +
          " pixels",
        formMetrics.documentFits &&
          formMetrics.formFits &&
          formMetrics.controlsFit &&
          formMetrics.select &&
          JSON.stringify(formMetrics.offered) === '["1"]' &&
          editorMetrics.dialogFits &&
          editorMetrics.editorFits &&
          editorMetrics.controlsFit &&
          editorMetrics.select,
        {
          form: formMetrics,
          editor: editorMetrics,
          formScreenshot,
          editorScreenshot,
        },
      );
    }
  } catch (error) {
    check(
      "SCHEDULE_BROWSER_ERROR",
      "Session schedule browser flow completed",
      false,
      {
        error: error.stack || error.message,
        directory,
      },
    );
  } finally {
    await page(() => {
      const audit = window.__sessionScheduleAudit;
      if (audit) {
        window.alert = audit.originalAlert;
        window.confirm = audit.originalConfirm;
        delete window.__sessionScheduleAudit;
      }
      closeModal();
    }).catch(() => {});
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    if (configured) await evaluate("globalThis.__reportSurfaceCleanup?.()");
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "session-weekly-schedule", runExtra: run })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 2;
    });
