"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
async function inspectMobileUx() {
  const cases = [],
    pause = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
  const add = (name, pass, observed = {}) =>
    cases.push({
      id: "UX-" + innerWidth + "-" + cases.length,
      name,
      pass: !!pass,
      observed,
    });
  const fits = () => document.documentElement.scrollWidth <= innerWidth + 1;
  const checkCreate = async (kind) => {
    const panel = document.querySelector(".create-panel");
    panel.open = false;
    panel.querySelector("summary").click();
    await pause();
    add(
      kind +
        " creation has one submit, a neutral heading and no injected duplicate add action",
      panel.open &&
        panel.querySelectorAll('[type="submit"]').length === 1 &&
        !/ثبت|افزودن/.test(panel.querySelector("summary").textContent) &&
        !document.querySelector(".mobile-add-action"),
    );
    add(kind + " expanded creation fits the viewport", fits());
    if (["class", "lesson", "student"].includes(kind)) {
      const frame = getComputedStyle(panel),
        heading = getComputedStyle(panel.querySelector("summary")),
        body = getComputedStyle(panel.querySelector("form"));
      add(
        kind +
          " creation has one continuous rounded border without clipping keyboard focus",
        panel.classList.contains(
          kind === "student" ? "student-add" : kind + "-create",
        ) &&
          frame.borderTopWidth === "1px" &&
          frame.borderTopStyle === "solid" &&
          frame.borderTopColor === "rgb(228, 228, 231)" &&
          frame.borderRadius === "16px" &&
          frame.boxShadow === "none" &&
          frame.overflowX === "visible" &&
          frame.overflowY === "visible" &&
          heading.borderStartStartRadius === "15px" &&
          heading.borderStartEndRadius === "15px" &&
          heading.borderEndStartRadius === "0px" &&
          heading.borderEndEndRadius === "0px" &&
          body.borderEndStartRadius === "15px" &&
          body.borderEndEndRadius === "15px",
      );
    }
    panel.open = false;
    if (["class", "lesson", "student"].includes(kind)) {
      const heading = getComputedStyle(panel.querySelector("summary"));
      add(
        "closed " +
          kind +
          " creation keeps all four header corners inside its rounded frame",
        heading.borderRadius === "15px" &&
          getComputedStyle(panel).borderRadius === "16px",
      );
    }
  };
  closeModal();
  goSchools();
  await pause();
  if (innerWidth <= 700) {
    const install = document.getElementById("mobileInstall"),
      update = document.getElementById("mobileUpdate"),
      status = document.getElementById("mobileStatus"),
      help = document.getElementById("mobileHelp");
    const original = [install.hidden, update.hidden, status.textContent];
    try {
      status.textContent =
        "فایل مستقل آفلاین؛ نصب استاندارد PWA از لینک امن انجام می‌شود.";
      for (const [showInstall, showUpdate] of [
        [false, false],
        [false, true],
        [true, true],
      ]) {
        install.hidden = !showInstall;
        update.hidden = !showUpdate;
        await pause();
        const elements = [
          status,
          help,
          ...[install, update].filter((el) => !el.hidden),
        ];
        const rects = elements.map((el) => el.getBoundingClientRect());
        add(
          "service bar fits with install=" +
            showInstall +
            " update=" +
            showUpdate,
          fits() &&
            elements.every(
              (el, i) =>
                rects[i].left >= 0 &&
                rects[i].right <= innerWidth + 1 &&
                (el === status || el.scrollWidth <= el.clientWidth + 1),
            ) &&
            rects
              .slice(1)
              .every(
                (rect) =>
                  Math.abs(
                    (rect.top + rect.bottom) / 2 -
                      (rects[0].top + rects[0].bottom) / 2,
                  ) <= 1,
              ),
        );
      }
    } finally {
      [install.hidden, update.hidden, status.textContent] = original;
    }
  }
  const field = document.querySelector(".entity-create-field input");
  add(
    "school creation is progressively disclosed with a persistent accessible label",
    !!field?.labels.length &&
      !document.querySelector(".entity-quick-create").open,
  );
  const badge = document.getElementById("singleFileBadge");
  add(
    "routine file status stays hidden without occupying navigation or the main workflow",
    !badge || badge.hidden,
  );
  add("home fits the viewport without horizontal page scrolling", fits(), {
    width: document.documentElement.scrollWidth,
  });
  document.querySelector(".entity-quick-create").open = true;
  const schoolSave = document.querySelector(
      '.entity-quick-create button[type="submit"]',
    ),
    brandEntry = document.querySelector(".dashboard-entity .entity-enter"),
    palette = {
      background: getComputedStyle(document.body).backgroundColor,
      navigation: getComputedStyle(brandEntry).color,
      saveRole: schoolSave.dataset.uiTone,
      saveVariant: schoolSave.dataset.uiVariant,
      saveFill: getComputedStyle(schoolSave).backgroundColor,
      saveText: getComputedStyle(schoolSave).color,
    };
  add(
    "Reactium palette uses accessible red for navigation and saving",
    palette.background === "rgb(247, 246, 244)" &&
      palette.navigation === "rgb(192, 20, 27)" &&
      palette.saveRole === "save" &&
      palette.saveVariant === "solid" &&
      palette.saveFill === "rgb(192, 20, 27)" &&
      palette.saveText === "rgb(255, 255, 255)",
    palette,
  );
  add(
    "icons decorate controls without hiding readable labels",
    document.querySelectorAll("#app .control-icon svg").length >= 3 &&
      document
        .querySelector('.entity-quick-create button[type="submit"]')
        .textContent.trim().length > 0,
  );
  await pause();
  add(
    "expanded creation form has touch-sized controls",
    [
      ...document.querySelectorAll(
        ".entity-quick-create button,.entity-quick-create input",
      ),
    ].every((control) => control.getBoundingClientRect().height >= 44),
  );
  const enter = document.querySelector(".dashboard-entity .entity-enter");
  add(
    "school entry has one arrow, a clear destination label and a touch target",
    getComputedStyle(enter).backgroundColor === "rgb(254, 240, 240)" &&
      getComputedStyle(enter).color === "rgb(192, 20, 27)" &&
      enter.textContent.trim() === "کلاس‌های مدرسه" &&
      enter.querySelectorAll("svg").length === 1 &&
      enter.getBoundingClientRect().height >= 44,
  );
  const menu = document.querySelector(".dashboard-entity-more");
  const label = enter.querySelector("span"),
    textRange = document.createRange();
  textRange.selectNodeContents(label);
  add(
    "school entry label stays on one line beside an equally tall more button",
    textRange.getClientRects().length === 1 &&
      label.scrollWidth <= label.clientWidth + 1 &&
      enter.getBoundingClientRect().height <= 52 &&
      Math.abs(
        enter.getBoundingClientRect().height -
          menu.querySelector("summary").getBoundingClientRect().height,
      ) <= 1,
    {
      height: enter.getBoundingClientRect().height,
      textLines: textRange.getClientRects().length,
    },
  );
  menu.querySelector("summary").click();
  await pause();
  const panel = menu.querySelector(".entity-menu-panel");
  menu.scrollIntoView({ block: "center" });
  await pause();
  const rect = panel.getBoundingClientRect();
  add(
    "school actions float without escaping the viewport",
    menu.open &&
      getComputedStyle(panel).position === "absolute" &&
      rect.left >= -1 &&
      rect.right <= innerWidth + 1 &&
      [...panel.querySelectorAll("button")].every(
        (button) => button.getBoundingClientRect().height >= 44,
      ),
  );
  const nextMenu = document.querySelectorAll(".dashboard-entity-more")[1];
  if (nextMenu) {
    nextMenu.querySelector("summary").click();
    await pause();
    add(
      "opening another school menu closes the previous menu",
      nextMenu.open && !menu.open,
    );
  }
  document.querySelector(".workflow-welcome h2").click();
  await pause();
  add(
    "outside click closes school action disclosures",
    !document.querySelector(".dashboard-entity-more[open]"),
  );
  document.querySelector(".entity-quick-create").open = false;
  await checkCreate("school");
  const school = db.schools[0],
    classroom = school.classes[0];
  goSchool(school.id);
  await pause();
  await checkCreate("class");
  goClass(classroom.id);
  await pause();
  add("class view fits the viewport", fits());
  add(
    "selecting a class lands on its own lessons",
    state.tab === "lessons" && !!document.querySelector(".class-lessons"),
  );
  const classTabs = document.querySelector(".classroom-tabs-compact"),
    tabButtons = [...classTabs.querySelectorAll(".classroom-tab")],
    tabMetrics = tabButtons.map((button) => {
      const rect = button.getBoundingClientRect(),
        style = getComputedStyle(button),
        icon = button.querySelector(".classroom-tab-icon"),
        iconRect = icon.getBoundingClientRect(),
        label = button.querySelector(".classroom-tab-label");
      return {
        height: rect.height,
        width: rect.width,
        top: rect.top,
        font: style.fontSize,
        weight: style.fontWeight,
        shadow: style.boxShadow,
        iconWidth: iconRect.width,
        iconHeight: iconRect.height,
        svgWidth: icon.querySelector("svg").getBoundingClientRect().width,
        clipped: label.scrollWidth > label.clientWidth + 1,
      };
    });
  add(
    "class directory tabs are slim, aligned and readable with 44px touch targets",
    fits() &&
      classTabs.getBoundingClientRect().height <= 52 &&
      tabMetrics.length === 2 &&
      Math.abs(tabMetrics[0].top - tabMetrics[1].top) <= 1 &&
      tabMetrics.every(
        (tab) =>
          tab.height >= 44 &&
          tab.height <= 46 &&
          tab.width >= 44 &&
          tab.font === "12px" &&
          tab.weight === "500" &&
          tab.shadow === "none" &&
          !tab.clipped &&
          tab.iconWidth === 20 &&
          tab.iconHeight === 20 &&
          tab.svgWidth === 18,
      ),
    tabMetrics,
  );
  tabButtons[1].click();
  await pause();
  add(
    "compact student tab opens the student directory and announces one active choice",
    state.tab === "students" &&
      !!document.querySelector(".student-directory") &&
      document.querySelectorAll('.classroom-tabs-compact [aria-pressed="true"]')
        .length === 1 &&
      document
        .querySelector(".classroom-tabs-compact .classroom-tab:last-child")
        .getAttribute("aria-pressed") === "true",
  );
  document
    .querySelector(".classroom-tabs-compact .classroom-tab:first-child")
    .click();
  await pause();
  add(
    "compact lesson tab returns to the lesson directory with its selected state intact",
    state.tab === "lessons" &&
      !!document.querySelector(".class-lessons") &&
      document
        .querySelector(".classroom-tabs-compact .classroom-tab:first-child")
        .getAttribute("aria-pressed") === "true",
  );
  setTab("students");
  await pause();
  const roster = document.querySelector(".student-roster"),
    studentRows = [...roster.querySelectorAll(".student-profile")];
  const studentMetrics = studentRows.map((row) => {
    const rect = row.getBoundingClientRect(),
      main = row.querySelector(".student-profile-main").getBoundingClientRect(),
      actions = row
        .querySelector(".student-profile-actions")
        .getBoundingClientRect(),
      controls = [
        ...row.querySelectorAll(
          ".student-profile-actions > button, .student-more > summary",
        ),
      ];
    return {
      height: rect.height,
      width: rect.width,
      mainTop: main.top,
      actionsTop: actions.top,
      readable: row.scrollWidth <= row.clientWidth + 1,
      controlsFit: controls.every(
        (control) =>
          control.getBoundingClientRect().height >= 44 &&
          control.scrollWidth <= control.clientWidth + 1,
      ),
    };
  });
  add(
    "student directory uses compact full-width rows with readable 44px actions",
    fits() &&
      studentRows.length > 0 &&
      studentMetrics.every(
        (row) =>
          row.width >= roster.clientWidth - 40 &&
          row.height <= (innerWidth <= 700 ? 140 : 100) &&
          row.readable &&
          row.controlsFit &&
          (innerWidth <= 700
            ? row.actionsTop > row.mainTop
            : Math.abs(row.actionsTop - row.mainTop) <= 6),
      ),
    studentMetrics,
  );
  const studentMenu = studentRows[0].querySelector(".student-more");
  studentMenu.querySelector("summary").click();
  await pause();
  const menuRect = studentMenu
    .querySelector(".student-more-menu")
    .getBoundingClientRect();
  add(
    "compact student more menu opens within the viewport",
    studentMenu.open && menuRect.left >= 0 && menuRect.right <= innerWidth + 1,
  );
  studentMenu.querySelector("summary").click();
  const rosterSearch = document.querySelector(".roster-search input");
  rosterSearch.value = "__no_matching_student__";
  rosterSearch.dispatchEvent(new Event("input", { bubbles: true }));
  await pause();
  add(
    "compact roster preserves filtering and no-results state",
    studentRows.every((row) => row.hidden) &&
      !document.querySelector(".roster-no-results").hidden,
  );
  rosterSearch.value = "";
  rosterSearch.dispatchEvent(new Event("input", { bubbles: true }));
  await pause();
  add(
    "clearing student search restores all compact rows",
    studentRows.every((row) => !row.hidden) &&
      document.querySelector(".roster-no-results").hidden,
  );
  await checkCreate("student");
  const importPanel = document.querySelector(".student-import.create-panel");
  importPanel.open = false;
  importPanel.querySelector("summary").click();
  await pause();
  const importFrame = getComputedStyle(importPanel),
    importHeading = getComputedStyle(importPanel.querySelector("summary")),
    importBody = getComputedStyle(
      importPanel.querySelector(".csv-import-body"),
    );
  add(
    "CSV import has a continuous rounded frame without clipping focus",
    importPanel.open &&
      fits() &&
      importFrame.borderRadius === "16px" &&
      importFrame.borderTopWidth === "1px" &&
      importFrame.boxShadow === "none" &&
      importFrame.overflowX === "visible" &&
      importFrame.overflowY === "visible" &&
      importHeading.borderStartStartRadius === "15px" &&
      importHeading.borderStartEndRadius === "15px" &&
      importHeading.borderEndStartRadius === "0px" &&
      importHeading.borderEndEndRadius === "0px" &&
      importBody.borderEndStartRadius === "15px" &&
      importBody.borderEndEndRadius === "15px",
  );
  importPanel.querySelector("summary").click();
  await pause();
  add(
    "closed CSV import keeps four rounded header corners",
    !importPanel.open &&
      getComputedStyle(importPanel.querySelector("summary")).borderRadius ===
        "15px",
  );
  setTab("lessons");
  await pause();
  await checkCreate("lesson");
  setTab("students");
  await pause();
  add(
    "active section is announced without relying on color alone",
    document
      .querySelector("#app .tabs > button.active")
      ?.getAttribute("aria-pressed") === "true",
  );
  if (innerWidth <= 1000)
    add(
      "text inputs use readable non-zooming 16px text",
      [
        ...document.querySelectorAll(
          '#app input:not([type="checkbox"]):not([type="radio"])',
        ),
      ]
        .filter((control) => control.getBoundingClientRect().height)
        .every(
          (control) => parseFloat(getComputedStyle(control).fontSize) >= 16,
        ),
    );
  goLesson(classroom.lessons[0].id);
  await pause();
  const lessonTabs = document.querySelector(".classroom-tabs-compact"),
    lessonButtons = [...lessonTabs.querySelectorAll(".classroom-tab")],
    lessonTabMetrics = lessonButtons.map((button) => {
      const rect = button.getBoundingClientRect(),
        label = button.querySelector(".classroom-tab-label");
      return {
        height: rect.height,
        top: rect.top,
        clipped: label.scrollWidth > label.clientWidth + 1,
      };
    });
  add(
    "lesson workspace tabs stay slim, aligned and unclipped",
    fits() &&
      lessonTabs.getBoundingClientRect().height <= 52 &&
      lessonTabMetrics.length === 2 &&
      Math.abs(lessonTabMetrics[0].top - lessonTabMetrics[1].top) <= 1 &&
      lessonTabMetrics.every(
        (tab) => tab.height >= 44 && tab.height <= 46 && !tab.clipped,
      ),
    lessonTabMetrics,
  );
  const attendanceDetail = lessonTabs.querySelector(".classroom-tab-detail");
  add(
    "attendance detail remains accessible with a compact mobile label",
    attendanceDetail.textContent.includes("و حضور و غیاب") &&
      (innerWidth <= 480
        ? getComputedStyle(attendanceDetail).position === "absolute"
        : getComputedStyle(attendanceDetail).display === "inline"),
  );
  lessonButtons[1].click();
  await pause();
  add(
    "compact grades tab opens grades with one selected choice",
    state.tab === "grades" &&
      !!document.querySelector("#lessonGradesArea") &&
      document.querySelectorAll('.classroom-tabs-compact [aria-pressed="true"]')
        .length === 1 &&
      document
        .querySelector(".classroom-tabs-compact .classroom-tab:last-child")
        .getAttribute("aria-pressed") === "true",
  );
  document
    .querySelector(".classroom-tabs-compact .classroom-tab:first-child")
    .click();
  await pause();
  add(
    "compact attendance tab returns to sessions",
    state.tab === "sessions" &&
      !!document.querySelector(".session-directory") &&
      document
        .querySelector(".classroom-tabs-compact .classroom-tab:first-child")
        .getAttribute("aria-pressed") === "true",
  );
  goMaster();
  await pause();
  const dayPicker = document.querySelector(".week-day-picker"),
    dayButtons = [...dayPicker.querySelectorAll("button")];
  add(
    "weekday tabs stay in one row without scrolling or clipped labels",
    getComputedStyle(dayPicker).backgroundColor === "rgb(255, 250, 237)" &&
      getComputedStyle(dayPicker).borderTopColor === "rgb(242, 211, 154)" &&
      dayPicker.scrollWidth <= dayPicker.clientWidth + 1 &&
      fits() &&
      dayButtons.every(
        (button) =>
          button.getBoundingClientRect().height >= 44 &&
          button.getBoundingClientRect().width >= 30 &&
          Math.abs(
            button.getBoundingClientRect().top -
              dayButtons[0].getBoundingClientRect().top,
          ) <= 1 &&
          button.scrollWidth <= button.clientWidth + 1 &&
          parseFloat(getComputedStyle(button).fontSize) >= 9.5,
      ),
  );
  const selectedDay = dayPicker.querySelector('[aria-pressed="true"]').dataset
      .legacyClickArg1,
    otherDay = dayButtons.find(
      (button) => button.dataset.legacyClickArg1 !== selectedDay,
    ).dataset.legacyClickArg1;
  dayPicker
    .querySelector('[data-legacy-click-arg1="' + otherDay + '"]')
    .click();
  await pause();
  add(
    "weekday tab selection preserves the original action and red active state",
    state.scheduleDay === Number(otherDay) &&
      document.querySelectorAll('.week-day-picker [aria-pressed="true"]')
        .length === 1 &&
      getComputedStyle(
        document.querySelector('.week-day-picker [aria-pressed="true"]'),
      ).backgroundColor === "rgb(192, 20, 27)",
  );
  document
    .querySelector(
      '.week-day-picker [data-legacy-click-arg1="' + selectedDay + '"]',
    )
    .click();
  await pause();
  const originalActiveDays = db.activeDays;
  try {
    db.activeDays = [0, 1, 2, 3, 4, 5, 6];
    goMaster();
    await pause();
    const allDays = [...document.querySelectorAll(".week-day-picker > button")];
    add(
      "all seven weekdays remain in one row on mobile and tablet",
      allDays.length === 7 &&
        fits() &&
        document.querySelector(".week-day-picker").scrollWidth <=
          document.querySelector(".week-day-picker").clientWidth + 1 &&
        allDays.every(
          (button) =>
            Math.abs(
              button.getBoundingClientRect().top -
                allDays[0].getBoundingClientRect().top,
            ) <= 1 &&
            button.scrollWidth <= button.clientWidth + 1 &&
            button.getBoundingClientRect().width >= 30,
        ),
    );
  } finally {
    db.activeDays = originalActiveDays;
    goMaster();
    await pause();
  }
  const dayHeading = document.querySelector(".week-day-heading"),
    dayHeadingStyle = getComputedStyle(dayHeading);
  add(
    "weekly day caption is small and unboxed with its original counts preserved",
    dayHeadingStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
      dayHeadingStyle.borderTopWidth === "0px" &&
      dayHeadingStyle.boxShadow === "none" &&
      dayHeading.getBoundingClientRect().height <= 32 &&
      dayHeading.querySelectorAll(".week-day-stat dd").length === 2 &&
      [...dayHeading.querySelectorAll(".week-day-stat")].every(
        (stat) => getComputedStyle(stat).backgroundColor === "rgba(0, 0, 0, 0)",
      ) &&
      fits(),
  );
  const weekSettings = document.querySelector(".week-settings"),
    settingsSummary = weekSettings.querySelector("summary");
  weekSettings.open = false;
  add(
    "closed weekly settings has rounded corners without an outer white backdrop",
    getComputedStyle(weekSettings).backgroundColor === "rgba(0, 0, 0, 0)" &&
      getComputedStyle(weekSettings).borderRadius === "16px" &&
      getComputedStyle(weekSettings).padding === "0px" &&
      getComputedStyle(settingsSummary).borderRadius === "15px",
  );
  settingsSummary.click();
  await pause();
  const weekSettingsStyle = getComputedStyle(weekSettings),
    settingsHeadingStyle = getComputedStyle(settingsSummary),
    settingsBodyStyle = getComputedStyle(
      weekSettings.querySelector(".week-settings-body"),
    );
  add(
    "expanded weekly settings keeps its frame and responsive controls intact",
    weekSettings.open &&
      fits() &&
      weekSettingsStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
      weekSettingsStyle.boxShadow === "none" &&
      weekSettingsStyle.overflowX === "visible" &&
      settingsHeadingStyle.borderStartStartRadius === "15px" &&
      settingsHeadingStyle.borderEndStartRadius === "0px" &&
      settingsBodyStyle.display === "grid" &&
      settingsBodyStyle.borderEndStartRadius === "15px" &&
      settingsSummary.getBoundingClientRect().height >= 44,
  );
  settingsSummary.click();
  await pause();
  add(
    "weekly settings closes through its original summary control",
    !weekSettings.open &&
      getComputedStyle(weekSettings.querySelector(".week-settings-body"))
        .display === "none",
  );
  add(
    "weekly agenda has no white backdrop behind its individual elements",
    getComputedStyle(document.querySelector(".week-agenda")).backgroundColor ===
      "rgba(0, 0, 0, 0)" && fits(),
  );
  goReports();
  const reportHeading = document.querySelector(".report-page-heading");
  add(
    "report page keeps only a compact title without redundant scope and statistics",
    reportHeading.children.length === 1 &&
      reportHeading.querySelector("h2").textContent ===
        "گزارش‌ها و کارنامه‌ها" &&
      getComputedStyle(reportHeading.querySelector("h2")).fontSize === "18px" &&
      !document.querySelector(".report-scope-summary") &&
      !reportHeading.textContent.includes("تصویر روشن"),
  );
  const reportNavigation = document.querySelector(".report-navigation"),
    reportTabMetrics = [...reportNavigation.querySelectorAll("button")].map(
      (button) => {
        const rect = button.getBoundingClientRect(),
          style = getComputedStyle(button),
          label = button.querySelector(".report-tab-label");
        return {
          top: rect.top,
          height: rect.height,
          width: rect.width,
          font: style.fontSize,
          weight: style.fontWeight,
          shadow: style.boxShadow,
          clipped: label.scrollWidth > label.clientWidth + 1,
          icon: button.querySelector(".ui-icon").getBoundingClientRect().width,
        };
      },
    );
  add(
    "report navigation has a warm light frame distinct from canvas and header",
    getComputedStyle(reportNavigation).backgroundColor ===
      "rgb(255, 250, 237)" &&
      getComputedStyle(reportNavigation).borderTopColor ===
        "rgb(242, 211, 154)" &&
      getComputedStyle(reportNavigation).borderTopWidth === "1px" &&
      [
        ...reportNavigation.querySelectorAll(
          'button:not([aria-current="page"])',
        ),
      ].every(
        (button) =>
          getComputedStyle(button).color === "rgb(45, 52, 64)" &&
          getComputedStyle(button.querySelector(".report-tab-icon")).color ===
            "rgb(124, 81, 5)",
      ),
  );
  add(
    "report tabs stay compact and readable in one row without horizontal scrolling",
    fits() &&
      reportNavigation.scrollWidth <= reportNavigation.clientWidth + 1 &&
      reportTabMetrics.length === 5 &&
      reportTabMetrics.every(
        (tab) =>
          tab.width >= 44 &&
          tab.height >= 44 &&
          tab.height <= (innerWidth < 640 ? 56 : 46) &&
          tab.font === "12px" &&
          tab.weight === "500" &&
          tab.shadow === "none" &&
          !tab.clipped &&
          tab.icon === 18 &&
          Math.abs(tab.top - reportTabMetrics[0].top) <= 1,
      ),
    reportTabMetrics,
  );
  for (const mode of ["karnameh", "daily", "weekly", "monthly", "annual"]) {
    document
      .querySelector(
        '.report-navigation [data-legacy-click-arg2="' + mode + '"]',
      )
      .click();
    await pause();
    add(
      "compact report tab selects " +
        mode +
        " through its existing click action",
      state.reportTab === mode &&
        document.querySelectorAll('.report-navigation [aria-current="page"]')
          .length === 1 &&
        document.querySelector('.report-navigation [aria-current="page"]')
          .dataset.legacyClickArg2 === mode,
    );
  }
  for (const mode of ["daily", "weekly", "monthly", "annual"]) {
    setReportTab(mode);
    await pause();
    const controls = document.querySelector(".periodic-controls");
    add(
      mode + " report has no duplicated nested field labels",
      !!controls && !controls.querySelector("label label"),
    );
    add(
      mode + " report exposes the appropriate date controls",
      controls.querySelectorAll('[data-gregorian-target="true"]').length ===
        (mode === "weekly" ? 2 : mode === "annual" ? 0 : 1),
    );
  }
  setReportTab("daily");
  await pause();
  document.querySelector(".periodic-controls [data-gregorian-target]").click();
  await pause();
  const calendar = document.getElementById("calPopup"),
    calendarRect = calendar.getBoundingClientRect(),
    prev = calendar.querySelector('[data-calendar-action="prev"]'),
    next = calendar.querySelector('[data-calendar-action="next"]');
  add(
    "calendar uses explicit RTL arrows and fits the viewport with readable touch rows",
    calendar.classList.contains("open") &&
      calendarRect.left >= 0 &&
      calendarRect.right <= innerWidth &&
      calendarRect.top >= 0 &&
      calendarRect.bottom <= innerHeight &&
      calendar.scrollWidth <= calendar.clientWidth + 1 &&
      prev.getBoundingClientRect().left > next.getBoundingClientRect().left &&
      prev.querySelector("path").getAttribute("d") === "m9 6 6 6-6 6" &&
      next.querySelector("path").getAttribute("d") === "m15 6-6 6 6 6" &&
      [
        ...calendar.querySelectorAll(
          ".cal-days button:not(.empty),.cal-header button",
        ),
      ].every((button) => button.getBoundingClientRect().height >= 44),
  );
  const originalCalendarYear = calViewYear,
    originalCalendarMonth = calViewMonth;
  calViewMonth = 12;
  renderShamsiCalendar();
  calendar.querySelector('[data-calendar-action="next"]').click();
  await pause();
  add(
    "calendar next and previous keep year boundaries correct",
    calViewYear === originalCalendarYear + 1 && calViewMonth === 1,
  );
  calendar.querySelector('[data-calendar-action="prev"]').click();
  await pause();
  add(
    "calendar previous reverses the year transition",
    calViewYear === originalCalendarYear && calViewMonth === 12,
  );
  calViewYear = originalCalendarYear;
  calViewMonth = originalCalendarMonth;
  renderShamsiCalendar();
  calendar.querySelector('[data-calendar-action="close"]').click();
  await pause();
  add(
    "restyled calendar closes through its original delegated action",
    !calendar.classList.contains("open"),
  );
  await openSettingsModal();
  await pause();
  const modal = document.querySelector(".modal-dialog"),
    close = document.getElementById("modalClose");
  add(
    "settings dialog and close target fit mobile and tablet widths",
    modal.getBoundingClientRect().left >= -1 &&
      modal.getBoundingClientRect().right <= innerWidth + 1 &&
      close.getBoundingClientRect().width >= 44 &&
      close.getBoundingClientRect().height >= 44,
  );
  const footer = document.querySelector(
    "#settingsEditor .record-editor-actions",
  );
  footer.scrollIntoView({ block: "end" });
  await pause();
  add(
    "settings save and cancel remain reachable",
    footer.getBoundingClientRect().bottom <= innerHeight + 1 &&
      [...footer.querySelectorAll("button")].every(
        (button) => button.getBoundingClientRect().height >= 44,
      ),
  );
  add(
    "bottom navigation cannot be activated behind the dialog",
    document.getElementById("uiBottomNav").inert,
  );
  closeModal();
  await EduV24.openBackups();
  await pause();
  // Button enhancement starts a 150ms color transition; inspect its settled palette.
  await new Promise((resolve) => setTimeout(resolve, 220));
  const backupColor = (action) =>
    getComputedStyle(
      document.querySelector(
        '.backup-hub [data-workspace-action="' + action + '"]',
      ),
    );
  add(
    "backup actions use the red and warm amber palette without changing status colors",
    backupColor("export-full").backgroundColor === "rgb(192, 20, 27)" &&
      backupColor("single-file-choose").backgroundColor ===
        "rgb(192, 20, 27)" &&
      backupColor("choose-import").color === "rgb(192, 20, 27)" &&
      backupColor("prepare-share-backup").backgroundColor ===
        "rgb(255, 250, 237)" &&
      backupColor("single-file-save").color === "rgb(124, 81, 5)",
  );
  const full = document.querySelector(
    '.backup-manual [data-workspace-action="export-full"]',
  );
  add(
    "backup controls have distinct local icons and preserved action labels",
    document.querySelector('[data-workspace-action="export-full"] .ui-icon') &&
      document.querySelector(
        '[data-workspace-action="choose-import"] .ui-icon',
      ) &&
      document.querySelector(
        '[data-workspace-action="single-file-choose"] .ui-icon',
      ),
  );
  add(
    "backup workflow prioritizes files without internal-history controls",
    full.getBoundingClientRect().height >= 44 &&
      !document.querySelector(".backup-history") &&
      !!document.querySelector(".backup-help"),
  );
  closeModal();
  goSchools();
  await pause();
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  await EduV24.course.open(db.schools[0].classes[0].lessons[0].id);
  await pause();
  const courseForm = document.getElementById("courseEditor");
  add(
    "course editor fields fit the viewport without horizontal scrolling",
    courseForm.scrollWidth <= courseForm.clientWidth + 1 &&
      [...courseForm.querySelectorAll("input,select")]
        .filter((control) => control.getClientRects().length)
        .every((control) => {
          const rect = control.getBoundingClientRect();
          return (
            rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44
          );
        }),
  );
  const periodsRect = courseForm
    .querySelector("#course_periods")
    .getBoundingClientRect();
  const teacherRect = courseForm
    .querySelector("#course_teacher")
    .getBoundingClientRect();
  add(
    "short weekly-period and grade fields stay compact instead of filling wide rows",
    periodsRect.width <= 141 &&
      [...courseForm.querySelectorAll("#courseDual input:not([type=hidden])")]
        .filter((input) => input.getClientRects().length)
        .every(
          (input) =>
            input.getBoundingClientRect().width <=
            courseForm.querySelector("#courseDual").clientWidth / 2 + 1,
        ),
  );
  add(
    "related basic fields align on the same row except on narrow phones",
    innerWidth < 360 || Math.abs(periodsRect.bottom - teacherRect.bottom) <= 2,
  );
  const courseFooter = courseForm.querySelector(".record-editor-actions");
  courseFooter.scrollIntoView({ block: "end" });
  await pause();
  add(
    "course save and cancel remain reachable with touch-sized targets",
    courseFooter.getBoundingClientRect().bottom <= innerHeight + 1 &&
      [...courseFooter.querySelectorAll("button")].every(
        (button) => button.getBoundingClientRect().height >= 44,
      ),
  );
  add(
    "course keyboard order follows the displayed primary and optional sections",
    !!(
      courseForm
        .querySelector(".course-basic-fields")
        .compareDocumentPosition(courseForm.querySelector("#coursePolicy")) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ),
  );
  closeModal();
  goSchools();
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  const beforeDeletion = JSON.stringify(db);
  const deletionLesson = db.schools[0].classes[0].lessons[0];
  deleteLesson(deletionLesson.id);
  await pause();
  const deletionForm = document.querySelector(".deletion-editor");
  add(
    "lesson deletion dialog explains the impact and defaults focus to cancellation",
    !!deletionForm &&
      document.activeElement ===
        deletionForm.querySelector('[data-workspace-action="close"]') &&
      deletionForm.textContent.includes("هنرجویان کلاس حفظ می‌شوند") &&
      deletionForm.textContent.includes("تمام نوبت‌های همین سال") &&
      deletionForm.textContent.includes("نمره یا جلسه") &&
      deletionForm.querySelector(".deletion-target bdi").textContent ===
        deletionLesson.name,
  );
  add(
    "lesson deletion fits the viewport and has touch-sized confirmation controls",
    deletionForm.scrollWidth <= deletionForm.clientWidth + 1 &&
      [...deletionForm.querySelectorAll("input,button")].every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44;
      }),
  );
  document.getElementById("deleteEntityName").value = "نام نادرست برای آزمون";
  deletionForm.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  for (
    let attempt = 0;
    attempt < 100 && !document.getElementById("deleteEntityError").textContent;
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  add(
    "incorrect deletion confirmation preserves every record and shows an inline error",
    !!document.getElementById("deleteEntityError").textContent &&
      JSON.stringify(db) === beforeDeletion &&
      deletionForm.isConnected,
  );
  deletionForm.querySelector('[data-workspace-action="close"]').click();
  add(
    "cancelling lesson deletion closes the dialog without modifying data",
    document.getElementById("modal").classList.contains("hidden") &&
      JSON.stringify(db) === beforeDeletion,
  );
  const modularForm = document.getElementById("courseEditor");
  modularForm.closest("details").open = true;
  document.getElementById("course_method").value = "modular";
  document
    .getElementById("course_method")
    .dispatchEvent(new Event("change", { bubbles: true }));
  await pause();
  add(
    "modular counts and thresholds stay readable and compact at each breakpoint",
    [
      ...modularForm.querySelectorAll(
        "#courseModular input:not([type=hidden]),#courseModular select",
      ),
    ].every((control) => {
      const rect = control.getBoundingClientRect();
      return (
        rect.width <=
          modularForm.querySelector("#courseModular > .course-grid")
            .clientWidth /
            2 +
            1 &&
        rect.height >= 44 &&
        rect.left >= 0 &&
        rect.right <= innerWidth
      );
    }) && fits(),
  );
  EduV24.course.cancelEditor();
  goSchools();
  return cases;
}
module.exports = async function mobileUx({ cdp, evaluate, cases, delay }) {
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-mobile-ux-"));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
    await delay(100);
    cases.push(...(await evaluate("(" + inspectMobileUx.toString() + ")()")));
    for (const [name, action] of [
      ["home", "goSchools()"],
      [
        "school-actions",
        "goSchools();document.querySelector('.dashboard-entity-more').open=true;document.querySelector('.dashboard-entity').scrollIntoView({block:'center'})",
      ],
      [
        "class-tabs",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);scrollTo(0,0)",
      ],
      [
        "class-student-tabs",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);setTab('students');scrollTo(0,0)",
      ],
      [
        "lesson-session-tabs",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);goLesson(db.schools[0].classes[0].lessons[0].id);scrollTo(0,0)",
      ],
      [
        "lesson-grade-tabs",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);goLesson(db.schools[0].classes[0].lessons[0].id);setTab('grades');scrollTo(0,0)",
      ],
      ["settings", "openSettingsModal()"],
      ["report-tabs", "goReports();setReportTab('daily');scrollTo(0,0)"],
      [
        "calendar",
        "goReports();setReportTab('daily');document.querySelector('.periodic-controls [data-gregorian-target]').click()",
      ],
      ["weekly-agenda", "goMaster();scrollTo(0,0)"],
      [
        "weekly-settings",
        "goMaster();document.querySelector('.week-settings').open=true;document.querySelector('.week-settings').scrollIntoView({block:'center'})",
      ],
      ["backups", "EduV24.openBackups()"],
      [
        "new-school",
        "goSchools();document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "new-class",
        "goSchool(db.schools[0].id);document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "new-student",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);setTab('students');document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "student-import",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);setTab('students');document.querySelector('.student-import').open=true;document.querySelector('.student-import').scrollIntoView({block:'center'})",
      ],
      [
        "new-lesson",
        "setTab('lessons');document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "edit-course",
        "EduV24.course.open(db.schools[0].classes[0].lessons[0].id)",
      ],
      [
        "delete-course",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);deleteLesson(db.schools[0].classes[0].lessons[0].id)",
      ],
      [
        "new-modular-course",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);document.querySelector('.lesson-create').open=true;document.getElementById('course_method').value='modular';document.getElementById('course_method').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.lesson-create').scrollIntoView({block:'start'})",
      ],
    ]) {
      await evaluate("closeModal()");
      await evaluate(action);
      await delay(100);
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(previews, width + "-" + name + ".png"),
        Buffer.from(shot.data, "base64"),
      );
    }
    await evaluate("closeModal();goSchools()");
  }
  console.log("Mobile UI previews: " + previews);
  await require("./course-responsive.cjs")({ cdp, evaluate, cases, delay });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
};
