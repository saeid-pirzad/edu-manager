"use strict";

// Real MutationObserver/rAF integration. Uses only the audit runner's isolated
// browser and synthetic DOM; it never reads school files or changes stored data.
const { main } = require("./data-integrity.cjs");

async function shellChecks(baseline) {
  const cases = [],
    saved = JSON.stringify(db),
    initialState = structuredClone(state),
    root = document.getElementById("app"),
    modal = document.getElementById("modal"),
    body = document.getElementById("modalBody"),
    calendar = document.getElementById("calPopup"),
    calendarHTML = calendar.innerHTML,
    welcome = document.getElementById("pwaWelcome"),
    welcomeParent = welcome?.parentElement,
    welcomeNext = welcome?.nextSibling,
    nativeDocumentQuery = Document.prototype.querySelectorAll,
    nativeElementQuery = Element.prototype.querySelectorAll;
  let collecting = false,
    readings = [];
  const add = (id, pass, observed) =>
    cases.push({ id: "SHELL_" + id, name: id, pass: !!pass, observed });
  const record = (target, selector, found) => {
    if (!collecting) return;
    readings.push({
      target: target.id || target.nodeName,
      selector,
      app: [...found].filter((node) => root.contains(node)).length,
      modal: [...found].filter((node) => body.contains(node)).length,
    });
  };
  Document.prototype.querySelectorAll = function (selector) {
    const found = nativeDocumentQuery.call(this, selector);
    record(this, selector, found);
    return found;
  };
  Element.prototype.querySelectorAll = function (selector) {
    const found = nativeElementQuery.call(this, selector);
    record(this, selector, found);
    return found;
  };
  const settle = async () => {
    for (let frame = 0; frame < 4; frame++)
      await new Promise(requestAnimationFrame);
  };
  const measure = async (action) => {
    readings = [];
    collecting = true;
    action();
    await settle();
    collecting = false;
    return {
      queries: readings.length,
      appNodes: readings.reduce((sum, row) => sum + row.app, 0),
      modalNodes: readings.reduce((sum, row) => sum + row.modal, 0),
      tableCollections: readings.filter((row) =>
        /^#app table(?:,#modalBody table)?$/.test(row.selector),
      ).length,
    };
  };
  const table = (rows, id) =>
    `<table id="${id}"><thead><tr><th>هنرجو</th><th>نمره</th><th>عملیات</th></tr></thead><tbody>` +
    Array.from(
      { length: rows },
      (_, index) =>
        `<tr><td>هنرجو ${index}</td><td><input value="${index}" placeholder="نمره"></td><td><button class="danger">×</button></td></tr>`,
    ).join("") +
    "</tbody></table>";
  globalThis.__shellAuditCleanup = async () => {
    document.getElementById("shellUnknownSurface")?.remove();
    const syntheticWelcome = document.getElementById("pwaWelcome");
    if (syntheticWelcome !== welcome) syntheticWelcome?.remove();
    if (welcome && !welcome.isConnected) {
      const parent = welcomeParent?.isConnected ? welcomeParent : document.body;
      parent.insertBefore(
        welcome,
        welcomeNext?.parentElement === parent ? welcomeNext : null,
      );
    }
    calendar.innerHTML = calendarHTML;
    if (!calendar.isConnected) document.body.append(calendar);
    body.replaceChildren();
    for (const key of Object.keys(state))
      if (!Object.hasOwn(initialState, key)) delete state[key];
    Object.assign(state, initialState);
    closeModal();
    render();
    await settle();
    const result = {
      dataUnchanged: JSON.stringify(db) === saved,
      stateRestored: JSON.stringify(state) === JSON.stringify(initialState),
      noSyntheticDOM: !document.querySelector(
        "#shellLargeTable,#shellModalTable,#shellUnknownSurface,#shellModalSave,#shellCalendarPrev",
      ),
      calendarConnected: calendar.isConnected,
      welcomeRestored: document.getElementById("pwaWelcome") === welcome,
      appRendered: !!root.querySelector(".topbar"),
    };
    delete globalThis.__shellAuditCleanup;
    return result;
  };
  try {
    closeModal();
    state.view = "schools";
    const appCreation = await measure(() => {
      root.innerHTML =
        '<div class="topbar"><h1>کلاس‌یار</h1><div class="header-brand"></div><div class="actions header-actions"><button class="header-home">خانه</button><button>گزارش‌ها</button></div></div>' +
        '<div class="tabs"><button class="active">دروس</button><button>هنرجویان</button></div>' +
        '<div class="card"><h3>فهرست آزمایشی</h3>' +
        Array.from(
          { length: 4 },
          (_, index) =>
            `<div class="list-item" data-legacy-click="unused-audit">هنرجوی آزمایشی ${index}</div>`,
        ).join("") +
        "</div>" +
        '<div id="lessonGradesArea"><div class="card"><p>راهنمای قدیمی</p><input placeholder="نمره آزمون"></div></div>' +
        table(250, "shellLargeTable");
    });
    add(
      "APP_ENHANCEMENTS",
      root.querySelector(".brand-mark img") &&
        root.querySelector(".navigation-menu") &&
        root.querySelector(".list-search input") &&
        root.querySelector(".list-item").getAttribute("role") === "link" &&
        root.querySelector(".tabs .active").getAttribute("aria-pressed") ===
          "true" &&
        root.querySelector(".mobile-grade-panel") &&
        !root.querySelector("#lessonGradesArea p") &&
        root
          .querySelector("#lessonGradesArea input")
          .getAttribute("aria-label") === "نمره آزمون" &&
        root.querySelector("#shellLargeTable").dataset.uiLayout === "cards" &&
        root
          .querySelector("#shellLargeTable tbody input")
          .getAttribute("aria-label") === "نمره",
      appCreation,
    );
    add(
      "APP_TABLE_QUERY_COUNT",
      baseline || appCreation.tableCollections === 1,
      appCreation,
    );

    const modalCreation = await measure(() => {
      modal.classList.remove("hidden");
      body.innerHTML =
        '<button id="shellModalSave">ثبت اطلاعات</button><textarea placeholder="توضیحات آزمون"></textarea>' +
        table(3, "shellModalTable");
    });
    add(
      "DYNAMIC_MODAL",
      body.querySelector("#shellModalSave .control-icon") &&
        body.querySelector("#shellModalSave").dataset.uiTone === "save" &&
        body.querySelector("textarea").getAttribute("aria-label") ===
          "توضیحات آزمون" &&
        body.querySelector("#shellModalTable").closest(".responsive-scroll") &&
        body.querySelector("tbody td").dataset.label === "هنرجو" &&
        document.getElementById("uiBottomNav").inert,
      modalCreation,
    );
    add(
      "MODAL_DOES_NOT_RESCAN_APP",
      baseline || modalCreation.appNodes === 0,
      modalCreation,
    );

    const textUpdates = [];
    for (let index = 0; index < 10; index++)
      textUpdates.push(
        await measure(() => {
          body.querySelector("#shellModalSave").textContent =
            index % 2 ? "ثبت اطلاعات" : "دریافت فایل";
        }),
      );
    const textMetrics = {
      updates: textUpdates.length,
      queries: textUpdates.reduce((sum, row) => sum + row.queries, 0),
      appNodes: textUpdates.reduce((sum, row) => sum + row.appNodes, 0),
      modalNodes: textUpdates.reduce((sum, row) => sum + row.modalNodes, 0),
    };
    add(
      "BUTTON_TEXT_MUTATIONS_STILL_DECORATE",
      body.querySelector("#shellModalSave .control-icon") &&
        body.querySelector("#shellModalSave").dataset.uiTone === "save",
      textMetrics,
    );
    add(
      "TEN_MODAL_UPDATES_DO_NOT_RESCAN_APP",
      baseline || textMetrics.appNodes === 0,
      textMetrics,
    );

    const tableReplacement = await measure(() => {
      body.querySelector("tbody").innerHTML =
        '<tr><td>هنرجوی جایگزین</td><td><input placeholder="نمره جدید"></td><td><button class="danger">×</button></td></tr>';
    });
    add(
      "MODAL_TABLE_REPLACEMENT",
      body.querySelector("tbody input").getAttribute("aria-label") ===
        "نمره جدید" &&
        body.querySelector("tbody button").getAttribute("aria-label") ===
          "حذف" &&
        body.querySelector("tbody button svg") &&
        body
          .querySelector("tbody td:last-child")
          .hasAttribute("data-actions") &&
        (baseline || tableReplacement.appNodes === 0),
      tableReplacement,
    );

    const calendarMutation = await measure(() => {
      calendar.innerHTML = '<button id="shellCalendarPrev">‹</button>';
    });
    add(
      "CALENDAR_CONTROLS",
      calendar.querySelector("button svg") &&
        calendar.querySelector("button").getAttribute("aria-label") ===
          "ماه قبل" &&
        (baseline || calendarMutation.appNodes === 0),
      calendarMutation,
    );

    const pwaCreation = await measure(() => {
      document.getElementById("pwaWelcome")?.remove();
      const welcome = document.createElement("section");
      welcome.id = "pwaWelcome";
      welcome.innerHTML =
        '<button id="pwaWelcomeInstall">نصب برنامه</button><button id="pwaWelcomeLater">بعداً</button>';
      document.body.append(welcome);
    });
    add(
      "LATE_PWA_SURFACE",
      document.querySelector("#pwaWelcomeInstall svg") &&
        document.getElementById("pwaWelcomeInstall").dataset.uiTone ===
          "download" &&
        (baseline || pwaCreation.appNodes === 0),
      pwaCreation,
    );
    const pwaUpdate = await measure(() => {
      document.getElementById("pwaWelcomeLater").textContent = "بستن";
    });
    add(
      "LATE_PWA_SURFACE_REMAINS_OBSERVED",
      document.querySelector("#pwaWelcomeLater svg") &&
        (baseline || pwaUpdate.appNodes === 0),
      pwaUpdate,
    );

    const fallback = await measure(() => {
      const extra = document.createElement("section");
      extra.id = "shellUnknownSurface";
      extra.innerHTML = "<button>دریافت فایل</button>";
      document.body.append(extra);
    });
    add(
      "UNKNOWN_BODY_CONTENT_USES_SAFE_FULL_PASS",
      document.querySelector("#shellUnknownSurface svg") &&
        fallback.appNodes > 0,
      fallback,
    );

    const reportCreation = await measure(() => {
      state.view = "reports";
      root.innerHTML =
        '<div class="topbar"><h1>کلاس‌یار</h1><div class="header-brand"></div><div class="actions header-actions"><button class="header-home">خانه</button><button>گزارش‌ها</button></div></div>' +
        '<div class="report-navigation"><button class="active">روزانه</button></div><div class="card"><div><select onchange="setGlobalFilter(\'schoolId\',this.value)"><option>هنرستان آزمایشی</option></select></div><div class="filter-box"><p>انتخاب‌های گزارش</p></div></div>';
    });
    add(
      "APP_REPLACEMENT_REPORT_CONTROLS",
      root.querySelector("label.report-filter-field span").textContent ===
        "مدرسه" &&
        root.querySelector("details.report-options summary") &&
        root.querySelector(".report-filter-grid"),
      reportCreation,
    );
    add("NO_STORED_DATA_MUTATION", JSON.stringify(db) === saved, {
      unchanged: JSON.stringify(db) === saved,
    });
    return cases;
  } finally {
    collecting = false;
    Document.prototype.querySelectorAll = nativeDocumentQuery;
    Element.prototype.querySelectorAll = nativeElementQuery;
  }
}

async function run({ cdp, evaluate, cases, delay }) {
  const baseline = process.argv.includes("--baseline");
  try {
    await delay(300);
    cases.push(...(await evaluate(`(${shellChecks})(${baseline})`)));
    for (const width of [360, 700, 701, 768, 1000, 1001, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      await delay(80);
      const observed = await evaluate(`(() => {
      const home=document.querySelector('#app .header-home'),
        wide=innerWidth>700&&!matchMedia('(max-width:1000px) and (pointer:coarse)').matches,
        menu=document.querySelector('#app .navigation-menu');
      return { width:innerWidth, wide,
        parent:home?.parentElement.className,
        correctParent:!!home?.parentElement.matches(wide?'.header-actions':'.header-brand'),
        open:menu?.open,
        viewport:document.documentElement.style.getPropertyValue('--app-viewport') };
    })()`);
      cases.push({
        id: "SHELL_RESIZE_" + width,
        name: "Home placement and navigation retain responsive behavior",
        pass:
          observed.correctParent &&
          observed.open === observed.wide &&
          !!observed.viewport,
        observed,
      });
    }
  } finally {
    const observed = await evaluate("globalThis.__shellAuditCleanup?.()");
    if (observed)
      cases.push({
        id: "SHELL_CLEANUP",
        name: "The synthetic suite restores normal rendering, state and PWA roots",
        pass: Object.values(observed).every(Boolean),
        observed,
      });
  }
}

if (require.main === module)
  main({
    runExtra: run,
    stage: "scoped-app-shell-enhancement-dom-scans",
  }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
module.exports = { run };
