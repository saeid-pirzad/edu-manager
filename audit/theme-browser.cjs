"use strict";

// Real application CSS in an isolated Edge profile; synthetic data only.
// --baseline records the old release for comparison, not theme acceptance.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { main } = require("./data-integrity.cjs");

async function prepareThemeFixture() {
  closeModal();
  await EduV24.test.settle();
  await EduV24.test.prepareLegacyPeriodFixture();
  const snapshot = await EduV24.snapshotInstallation();
  let first = 1431;
  while (
    snapshot.stores.catalog.some(
      (item) => item.year === `${first}-${first + 1}`,
    )
  )
    first++;
  const year = `${first}-${first + 1}`;
  document.getElementById("periodYear").value = year;
  document.getElementById("periodTerm").value = "اول";
  await EduV24.test.createLegacyPeriod();
  const date = jalaliToGregorian(first, 7, 12)
    .map((part, index) => (index ? String(part).padStart(2, "0") : part))
    .join("-");
  const students = [
    "آرمان آزمایشی",
    "بهار آزمایشی",
    "پارسا آزمایشی",
    "ترانه آزمایشی",
    "دانیال آزمایشی",
  ].map((name, index) => ({
    id: `theme_student_${index}`,
    name,
    code: `00${index + 1}`,
  }));
  const lesson = {
    id: "theme_lesson",
    name: "کارگاه طراحی و تصویرسازی",
    teacher: "دبیر آزمایشی",
    gradeMode: "kardanesh",
    gradingPolicy: {
      ...EduPolicy.defaults("dual", year),
      code: "THEME-SYNTHETIC-01",
      confirmed: true,
    },
    poudmans: [],
    kardaneshScores: {
      theme_student_0: { practical: 18, theory: 16 },
      theme_student_1: { practical: 0, theory: 12 },
    },
  };
  const modular = {
    id: "theme_modular",
    name: "راه‌اندازی شبکه‌های رایانه‌ای",
    teacher: "دبیر آزمایشی",
    gradeMode: "standard",
    gradingPolicy: {
      ...EduPolicy.defaults("modular", year),
      code: "THEME-MODULAR-01",
      confirmed: true,
    },
    kardaneshScores: {},
    poudmans: [0, 1, 2].map((index) => ({
      id: `theme_module_${index}`,
      name: `پودمان آزمایشی ${index + 1}`,
      podScores:
        index === 1
          ? {}
          : {
              theme_student_0: { m: 3, c: 3 },
              theme_student_1: { m: 0, c: 1 },
            },
      units: [
        { id: `theme_unit_${index}`, name: "واحد آموزشی", unitScores: {} },
      ],
    })),
  };
  const base = defaultDB();
  base.settings = {
    ...db.settings,
    academicYear: year,
    academicTerm: "اول",
    password: "",
    weekStartDate: date,
  };
  base.schools = [
    {
      id: "theme_school",
      name: "هنرستان آزمایشی رنگ و طراحی",
      classes: [
        {
          id: "theme_class",
          name: "یازدهم تصویرسازی",
          students,
          archivedStudents: [],
          lessons: [lesson, modular],
        },
      ],
    },
  ];
  base.sessions = [
    {
      id: "theme_session",
      schoolId: "theme_school",
      classId: "theme_class",
      lessonId: lesson.id,
      date,
      period: 0,
      poudmanId: null,
      unitId: null,
      roster: structuredClone(students),
      attendance: {
        theme_student_0: "present",
        theme_student_1: "absent",
        theme_student_2: "late:10",
        theme_student_3: "leave",
      },
      scores: [
        {
          studentId: "theme_student_0",
          type: "activity",
          value: 1,
          note: "تمرین آزمایشی کلاس",
        },
      ],
    },
  ];
  const day = (new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7;
  base.activeDays = [day];
  base.masterSchedule = {
    [`${day}-0-all`]: {
      schoolId: "theme_school",
      classId: "theme_class",
      lessonId: lesson.id,
    },
  };
  db = EduV24.normalizeDB(base);
  await saveDB({ action: "Synthetic theme acceptance fixture" });
  await EduV24.test.settle();
  globalThis.__themeFixture = { date, year };
  goSchools();
  document.getElementById("pwaWelcomeLater")?.click();
  return { date, year };
}

// Composite translucent solid backgrounds rather than assuming every control
// sits on white. Unsupported background images are reported, never accepted as
// contrast evidence. Actual text nodes avoid counting hidden decorative icons.
function inspectTheme() {
  const parse = (value) => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return null;
    const parts = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return parts.length >= 3 ? [...parts.slice(0, 3), parts[3] ?? 1] : null;
  };
  const blend = (front, back) =>
    front
      .slice(0, 3)
      .map(
        (channel, index) => channel * front[3] + back[index] * (1 - front[3]),
      );
  const luminance = (color) =>
    color
      .slice(0, 3)
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const contrast = (a, b) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const background = (element) => {
    const chain = [];
    for (let current = element; current; current = current.parentElement)
      chain.unshift(current);
    let color = [255, 255, 255],
      unknown = false;
    for (const item of chain) {
      const style = getComputedStyle(item);
      const next = parse(style.backgroundColor);
      if (!next) return null;
      color = blend(next, color);
      if (next[3] === 1) unknown = false;
      if (style.backgroundImage !== "none") unknown = true;
    }
    return unknown ? null : color;
  };
  const visible = (element) =>
    element.getClientRects().length > 0 &&
    !element.closest('[hidden],[aria-hidden="true"],svg,script,style') &&
    getComputedStyle(element).visibility !== "hidden" &&
    !element.closest(":disabled");
  const describe = (element) =>
    element.tagName.toLowerCase() +
    (element.id ? `#${element.id}` : "") +
    (element.classList.length
      ? "." + [...element.classList].slice(0, 3).join(".")
      : "");
  const modal = document.querySelector("#modal:not(.hidden)");
  const scope = modal || document.body;
  const failed = [],
    unsupported = [],
    sampled = [];
  const inspectText = (element, text, style = getComputedStyle(element)) => {
    const bg = background(element),
      fg = parse(style.color);
    if (!bg || !fg) {
      unsupported.push({ element: describe(element), text: text.slice(0, 55) });
      return;
    }
    const size = parseFloat(style.fontSize),
      weight = parseInt(style.fontWeight, 10) || 400;
    const minimum = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    const ratio = contrast(blend(fg, bg), bg);
    const item = {
      element: describe(element),
      text: text.slice(0, 70),
      ratio: Number(ratio.toFixed(3)),
      minimum,
      foreground: style.color,
      background: bg.map((value) => Math.round(value)),
    };
    sampled.push(item);
    if (ratio + 0.005 < minimum) failed.push(item);
  };
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement,
      text = node.textContent.trim();
    if (text && element && visible(element)) inspectText(element, text);
  }
  const fields = [
    ...scope.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),select,textarea',
    ),
  ]
    .filter(visible)
    .map((element) => {
      if (element.value) inspectText(element, element.value);
      else if (element.placeholder)
        inspectText(
          element,
          element.placeholder,
          getComputedStyle(element, "::placeholder"),
        );
      const style = getComputedStyle(element),
        outer = background(element.parentElement),
        border = parse(style.borderTopColor);
      const ratio =
        outer && border ? contrast(blend(border, outer), outer) : null;
      return {
        element: describe(element),
        ratio: ratio === null ? null : Number(ratio.toFixed(3)),
        color: style.borderTopColor,
        width: style.borderTopWidth,
      };
    });
  const tokens = Object.fromEntries(
    [
      "brand",
      "primary",
      "primary-hover",
      "primary-soft",
      "highlight",
      "canvas",
      "surface",
      "surface-subtle",
      "surface-muted",
      "ink",
      "muted",
      "line",
      "field",
      "focus",
    ].map((name) => [
      name,
      getComputedStyle(document.documentElement)
        .getPropertyValue(`--theme-${name}`)
        .trim(),
    ]),
  );
  return {
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
    sampled: sampled.length,
    failed,
    unsupported,
    fields,
    tokens,
  };
}

async function run({ cdp, evaluate, cases, delay }) {
  const baseline = process.argv.includes("--baseline");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), baseline ? "edu-theme-before-" : "edu-theme-after-"),
  );
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  await evaluate("(" + prepareThemeFixture.toString() + ")()");
  const measurements = [];
  const add = (id, name, pass, observed) =>
    cases.push({ id, name, pass: !!pass, observed });
  const views = [
    [
      "home",
      "closeModal();goSchools();document.querySelector('.entity-quick-create').open=true",
    ],
    [
      "navigation",
      "closeModal();goSchools();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const navigation=document.querySelector('.navigation-menu');if(navigation)navigation.open=true;document.querySelector('.workspace-tools').open=true",
    ],
    [
      "school",
      "closeModal();goSchool('theme_school');document.querySelector('.create-panel').open=true",
    ],
    [
      "class",
      "closeModal();goSchool('theme_school');goClass('theme_class');document.querySelector('.create-panel').open=true",
    ],
    [
      "students",
      "closeModal();goSchool('theme_school');goClass('theme_class');setTab('students');document.querySelector('.create-panel').open=true",
    ],
    [
      "lesson",
      "closeModal();goSchool('theme_school');goClass('theme_class');goLesson('theme_lesson')",
    ],
    [
      "attendance",
      "closeModal();openSessionModal(getSessionById('theme_session'))",
    ],
    [
      "activity",
      "closeModal();openSessionModal(getSessionById('theme_session'));showSessionPanel('activity')",
    ],
    [
      "grades",
      "closeModal();goSchool('theme_school');goClass('theme_class');goLesson('theme_lesson');setTab('grades')",
    ],
    [
      "grades-final",
      "closeModal();goSchool('theme_school');goClass('theme_class');goLesson('theme_lesson');setTab('grades');document.querySelector('[data-workspace-action=\"assessment-stage\"][data-term=\"اول\"][data-stage=\"final\"]').click();await new Promise(resolve=>setTimeout(resolve,200))",
    ],
    [
      "modular-grades",
      "closeModal();goSchool('theme_school');goClass('theme_class');goLesson('theme_modular');setTab('grades')",
    ],
    ["course-modal", "closeModal();openLessonConfig('theme_lesson')"],
    [
      "reports",
      "closeModal();goReports();setReportTab('daily');EduPeriodicReports.selectScope('theme_school','theme_class');EduPeriodicReports.set('date',__themeFixture.date);await EduPeriodicReports.generate()",
    ],
    [
      "calendar",
      "closeModal();goReports();setReportTab('daily');EduPeriodicReports.set('date',__themeFixture.date);await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('.periodic-controls [data-gregorian-target]').click()",
    ],
    [
      "karnameh",
      "closeModal();goReports();state.reportTab='karnameh';karnamehFilter={schoolId:'theme_school',classId:'theme_class',studentId:'theme_student_0'};render();await renderKarnamehTabReports()",
    ],
    ["backups", "closeModal();await EduV24.openBackups()"],
    [
      "settings",
      "closeModal();document.querySelector('[data-header-action=\"settings\"]').click()",
    ],
  ];
  for (const width of [390, 768, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    for (const [name, open] of views) {
      await evaluate("closeShamsiCalendar()");
      try {
        await evaluate("(async()=>{" + open + ";window.scrollTo(0,0);})()");
      } catch (error) {
        throw Error(`Theme view ${name} at ${width}px failed`, {
          cause: error,
        });
      }
      await delay(120);
      const observed = await evaluate("(" + inspectTheme.toString() + ")()");
      measurements.push({ width, view: name, ...observed });
      add(
        `THEME_FIT_${width}_${name}`,
        `Theme preserves ${name} viewport at ${width}px`,
        observed.content <= width + 1,
        { width, content: observed.content },
      );
      if (!baseline) {
        add(
          `THEME_TEXT_${width}_${name}`,
          `Actual ${name} text meets WCAG contrast at ${width}px`,
          observed.sampled >= 5 && observed.failed.length === 0,
          {
            sampled: observed.sampled,
            failed: observed.failed,
            unsupported: observed.unsupported,
          },
        );
        add(
          `THEME_FIELDS_${width}_${name}`,
          `Actual ${name} field outlines remain distinguishable at ${width}px`,
          observed.fields.every(
            (field) =>
              field.ratio !== null &&
              field.ratio >= 3 &&
              parseFloat(field.width) >= 1,
          ),
          observed.fields,
        );
      }
      const shot = await cdp("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(
        path.join(directory, `${name}-${width}.png`),
        Buffer.from(shot.data, "base64"),
      );
      if (name === "karnameh" && width === 1280 && !baseline) {
        const prepared = await evaluate(`(async () => {
          globalThis.__EDU_PRINT_TEST__ = true;
          document.querySelector('.karnameh-student-sheet [data-workspace-action="print"]').click();
          for(let attempt=0;attempt<150&&!document.querySelector('#printRoot .karnameh-student-sheet');attempt++) await new Promise(resolve=>setTimeout(resolve,15));
          const root=document.getElementById('printRoot');
          if(!root?.querySelector('.karnameh-student-sheet')) throw Error('Actual print action did not authorize the student report');
          return { student:root.textContent.includes('آرمان آزمایشی'), otherStudent:root.textContent.includes('بهار آزمایشی'), sheets:root.querySelectorAll('.karnameh-student-sheet').length, rows:root.querySelectorAll('tbody tr').length };
        })()`);
        await cdp("Emulation.setEmulatedMedia", { media: "print" });
        const printed = await evaluate("(" + inspectTheme.toString() + ")()");
        add(
          "THEME_PRINT_CONTENT",
          "The actual authorized print action preserves one student's report and readable colors",
          prepared.student &&
            !prepared.otherStudent &&
            prepared.sheets === 1 &&
            prepared.rows >= 2 &&
            printed.sampled >= 20 &&
            printed.failed.length === 0,
          { prepared, sampled: printed.sampled, failed: printed.failed },
        );
        const printShot = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        fs.writeFileSync(
          path.join(directory, "karnameh-print-1280.png"),
          Buffer.from(printShot.data, "base64"),
        );
        const pdf = await cdp("Page.printToPDF", {
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
        });
        const content = Buffer.from(pdf.data, "base64");
        fs.writeFileSync(path.join(directory, "karnameh-1280.pdf"), content);
        add(
          "THEME_PRINT_PDF",
          "The real authorized student grade sheet produces a color PDF",
          content.subarray(0, 5).toString() === "%PDF-" &&
            content.length > 5000,
          {
            bytes: content.length,
            file: path.join(directory, "karnameh-1280.pdf"),
          },
        );
        await cdp("Emulation.setEmulatedMedia", { media: "screen" });
        await evaluate(
          "document.getElementById('printRoot')?.remove();document.getElementById('printPageStyle')?.remove();delete globalThis.__EDU_PRINT_TEST__",
        );
      }
    }
  }
  await evaluate("closeModal();goSchools()");
  for (const width of [320, 1024]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    for (const [name, open] of views.filter(([name]) =>
      ["home", "students", "grades", "reports", "backups"].includes(name),
    )) {
      await evaluate("(async()=>{" + open + ";window.scrollTo(0,0);})()");
      await delay(75);
      const size = await evaluate(
        "({width:innerWidth,content:document.documentElement.scrollWidth})",
      );
      add(
        `THEME_EDGE_${width}_${name}`,
        `Theme preserves ${name} at edge viewport ${width}px`,
        size.content <= width + 1,
        size,
      );
    }
  }
  if (!baseline) {
    const expected = {
      brand: "#ed1c24",
      primary: "#c0141b",
      "primary-hover": "#921019",
      "primary-soft": "#fef0f0",
      highlight: "#fcaf17",
      canvas: "#f7f6f4",
      surface: "#fff",
      "surface-subtle": "#fafafa",
      "surface-muted": "#f4f4f5",
      ink: "#2d3440",
      muted: "#5a6179",
      line: "#e4e4e7",
      field: "#f4f4f5",
      focus: "#c0141b",
    };
    const actual = measurements[0].tokens;
    add(
      "THEME_REACTIUM_CONTRACT",
      "The live cascade resolves the approved Reactium color roles",
      Object.entries(expected).every(([key, value]) => actual[key] === value),
      { actual, expected },
    );
    await evaluate(
      "closeModal();goSchools();document.querySelector('.entity-quick-create').open=true",
    );
    await delay(175);
    await evaluate(
      "document.querySelector('.entity-create-field input').focus()",
    );
    await delay(175);
    const focus = await evaluate(`(() => {
      const input = document.querySelector('.entity-create-field input');
      const style = getComputedStyle(input);
      return { active: document.activeElement === input, color: style.borderTopColor, width: style.borderTopWidth, shadow: style.boxShadow };
    })()`);
    add(
      "THEME_FOCUS_VISIBLE",
      "A real focused field uses the accessible red focus indicator",
      focus.active &&
        focus.color === "rgb(192, 20, 27)" &&
        parseFloat(focus.width) >= 1 &&
        focus.shadow !== "none",
      focus,
    );
    await cdp("DOM.enable");
    await cdp("CSS.enable");
    for (const [name, prepare, selector] of [
      [
        "text-input",
        "document.querySelector('.entity-create-field input').blur()",
        ".entity-create-field input",
      ],
      [
        "select",
        "goSchool('theme_school');goClass('theme_class');document.querySelector('.create-panel').open=true",
        "#app select",
      ],
    ]) {
      await evaluate(prepare);
      const document = await cdp("DOM.getDocument");
      const { nodeId } = await cdp("DOM.querySelector", {
        nodeId: document.root.nodeId,
        selector,
      });
      if (!nodeId) throw Error("Theme hover target missing: " + selector);
      await cdp("CSS.forcePseudoState", {
        nodeId,
        forcedPseudoClasses: ["hover"],
      });
      await delay(200);
      const hover = await evaluate("(" + inspectTheme.toString() + ")()");
      const fields =
        name === "select"
          ? hover.fields.filter((field) => field.element.startsWith("select"))
          : hover.fields;
      add(
        `THEME_HOVER_${name}`,
        `Real hovered ${name} keeps its accessible outline`,
        fields.length > 0 &&
          fields.every(
            (field) =>
              field.ratio !== null &&
              field.ratio >= 3 &&
              parseFloat(field.width) >= 1,
          ),
        fields,
      );
      await cdp("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    }
  }
  fs.writeFileSync(
    path.join(directory, "measurements.json"),
    JSON.stringify({ baseline, measurements }, null, 2) + "\n",
  );
  add(
    "THEME_ARTIFACTS",
    baseline
      ? "Old release comparison screenshots recorded"
      : "Reactium theme screenshots recorded",
    fs.readdirSync(directory).filter((name) => name.endsWith(".png")).length ===
      views.length * 3 + (baseline ? 0 : 1),
    { directory, screenshots: views.length * 3 + (baseline ? 0 : 1), baseline },
  );
  console.log("Theme screenshots: " + directory);
}

module.exports = run;
if (require.main === module)
  main({
    stage: process.argv.includes("--baseline")
      ? "theme-before-comparison"
      : "theme-reactium-acceptance",
    runExtra: run,
  }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
