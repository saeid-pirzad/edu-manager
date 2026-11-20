"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

async function prepareReviewFixture() {
  closeModal();
  goReports();
  const ids = globalThis.__reportSurfaceIds;
  state.reportTab = "daily";
  EduPeriodicReports.selectScope(ids.school);
  Object.assign(EduPeriodicReports.filters, {
    mode: "daily",
    date: "2026-11-02",
    detailLevel: "summary",
  });
  render();
  const actual = await EduPeriodicReports.generate();
  if (!actual) throw Error("The actual daily report did not prepare.");
  const snapshot = await EduV24.prepareReportSnapshot({ annual: false }),
    projectedSource = structuredClone(snapshot.data),
    a = projectedSource.schools[0].classes.find((c) => c.id === ids.a),
    b = projectedSource.schools[0].classes.find((c) => c.id === ids.b);
  delete projectedSource.sessions.find((s) => s.classId === ids.a).attendance[
    a.students[2].id
  ];
  const model = EduPeriodicReports.build(projectedSource, {
    mode: "daily",
    date: "2026-11-02",
    schoolId: ids.school,
    audience: "management",
    detailLevel: "summary",
  });
  // These are presentation-only DTOs over the real synthetic fixture IDs.
  // No grade or attendance mutation is persisted to the application's stores.
  model.annualGrades = a.students.map((student, index) => ({
    classId: a.id,
    className: a.name,
    lessonId: a.lessons[0].id,
    lessonName: a.lessons[0].name,
    studentId: student.id,
    studentName: student.name,
    studentCode: student.code,
    final: index === 1 ? null : index === 0 ? 0 : 18,
    complete: index !== 1,
    passed: index === 1 ? null : index !== 0,
    components: ["اول", "دوم"].flatMap((term) =>
      ["midterm", "final"].map((stage) => ({
        term,
        stage,
        practical: index === 1 ? null : index === 0 ? 0 : 18,
        theory: index === 1 ? null : index === 0 ? 0 : 18,
        final: index === 1 ? null : index === 0 ? 0 : 18,
        complete: index !== 1,
      })),
    ),
  }));
  model.technicalGrades = b.students.map((student, studentIndex) => ({
    classId: b.id,
    className: b.name,
    lessonId: b.lessons[0].id,
    lessonName: b.lessons[0].name,
    studentId: student.id,
    studentName: student.name,
    studentCode: student.code,
    method: "modular",
    unitBased: true,
    final: null,
    complete: studentIndex !== 1,
    modules: Array.from({ length: 5 }, (_, moduleIndex) => ({
      id: b.lessons[0].id + "_module_" + moduleIndex,
      name: "پودمان آزمایشی " + (moduleIndex + 1),
      final: null,
      units: Array.from({ length: 2 }, (_, unitIndex) => {
        const first = moduleIndex === 0 && unitIndex === 0,
          missing = first && studentIndex === 1,
          failed = first && studentIndex === 0;
        return {
          id: b.lessons[0].id + "_unit_" + moduleIndex + "_" + unitIndex,
          name: "واحد کار " + (unitIndex + 1),
          final: missing ? null : failed ? 6 : 18,
          complete: !missing,
          passed: missing ? null : !failed,
          inputs: { m: missing ? null : 3, c: missing ? null : failed ? 1 : 3 },
        };
      }),
    })),
  }));
  globalThis.__reportReviewFixture = {
    actual,
    model,
    snapshot,
    projectedSource,
  };
  return {
    actualQuality: EduReportCompleteness.build(actual),
    actualAttendanceRate: actual.summary.attendanceRate,
    quality: EduReportCompleteness.build(model),
    academic: EduReportAcademicSummary.build(model),
  };
}

function showReviewFixture() {
  const model = globalThis.__reportReviewFixture.model;
  document.getElementById("periodicReportOutput").innerHTML =
    EduPeriodicReports.documentHtml(model);
  document.querySelector(".report-review").scrollIntoView({ block: "start" });
}

function inspectReview() {
  const review = document.querySelector(".report-review"),
    body = review.querySelector(".report-review-body"),
    wrap = review.querySelector(".report-review-table-wrap"),
    learners = review.querySelector(".report-review-learners"),
    latin = (value) =>
      String(value)
        .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
        .replace(/٫/g, "."),
    fit = (node) => node.scrollWidth <= node.clientWidth + 1,
    initialClosed = !review.open && !body.getClientRects().length,
    headerText = latin(review.querySelector(":scope > summary").textContent);
  review.querySelector(":scope > summary").click();
  const visible = review.open && !!body.getClientRects().length;
  learners.querySelector("summary").click();
  const learnerItems = [...learners.querySelectorAll("li")],
    scrollContainers = [wrap, ...wrap.querySelectorAll("*")].filter(
      (node) =>
        node.scrollWidth > node.clientWidth + 1 &&
        ["auto", "scroll"].includes(getComputedStyle(node).overflowX),
    );
  const scrollsInternally = scrollContainers.some((node) => {
    const before = node.scrollLeft;
    node.scrollLeft = -10000;
    if (node.scrollLeft === before) node.scrollLeft = 10000;
    const moved = node.scrollLeft !== before;
    node.scrollLeft = before;
    return moved;
  });
  const linear = (value) => {
    value /= 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => {
    const values = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map(linear);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrast = (node) => {
    let surface = node;
    while (
      surface.parentElement &&
      ["transparent", "rgba(0, 0, 0, 0)"].includes(
        getComputedStyle(surface).backgroundColor,
      )
    )
      surface = surface.parentElement;
    const a = luminance(getComputedStyle(node).color),
      b = luminance(getComputedStyle(surface).backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const metrics = [...review.querySelectorAll(".report-review-metrics dd")],
    result = {
      initialClosed,
      visible,
      correctHeader:
        headerText.includes("83.33٪") &&
        headerText.includes("نیازمند جبران: 2"),
      correctMetrics:
        metrics.map((node) => latin(node.textContent)).join("|") ===
        "5 / 6|1|1",
      readableRatios:
        getComputedStyle(metrics[0]).direction === "ltr" &&
        getComputedStyle(review.querySelector(".report-review-table tbody td"))
          .direction === "ltr",
      rows: review.querySelectorAll(".report-review-table tbody tr").length,
      learnerItems: learnerItems.length,
      learnersVisible: learnerItems.every(
        (node) => node.getClientRects().length,
      ),
      noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      noSurfaceOverflow: fit(document.querySelector(".periodic-document")),
      noReviewOverflow: fit(review),
      headerFits: fit(review.querySelector(":scope > summary")),
      metricsFit: [
        ...review.querySelectorAll(".report-review-metrics > div"),
      ].every(fit),
      wrapFits: wrap.getBoundingClientRect().width <= body.clientWidth + 1,
      singleTableContainer:
        review.querySelector(".report-review-table").parentElement === wrap &&
        !wrap.querySelector(".responsive-scroll,.table-scroll"),
      tableScrollsOnMobile:
        innerWidth > 600 ||
        (scrollContainers.includes(wrap) && scrollsInternally),
      tableHeadersReadable: [
        ...review.querySelectorAll(".report-review-table th"),
      ].every((node) => contrast(node) >= 4.5),
      compactMobile:
        innerWidth > 600 ||
        (parseFloat(
          getComputedStyle(review.querySelector("summary")).fontSize,
        ) <= 13 &&
          parseFloat(
            getComputedStyle(review.querySelector(".report-review-table"))
              .fontSize,
          ) <= 12),
      tableHeightBounded:
        parseFloat(getComputedStyle(wrap).maxHeight) <= 500 &&
        ["auto", "scroll"].includes(getComputedStyle(wrap).overflowY),
      modelUnchanged:
        JSON.stringify(globalThis.__reportReviewFixture.model) ===
        globalThis.__reportReviewModelJSON,
    };
  return result;
}

async function inspectReviewPrint() {
  const fixture = globalThis.__reportReviewFixture,
    originalFlag = window.__EDU_PRINT_TEST__,
    sourceReview = document.querySelector(".report-review"),
    sourceLearners = sourceReview.querySelector(".report-review-learners");
  sourceReview.open = false;
  sourceLearners.open = false;
  try {
    window.__EDU_PRINT_TEST__ = true;
    const printed = await EduV24.printReport(
      document.querySelector("[data-periodic-print]"),
      { context: fixture.snapshot.context, validate: () => true },
    );
    return {
      printed,
      sourceStillClosed: !sourceReview.open && !sourceLearners.open,
      reviewExpanded: !!document.querySelector(
        '#printRoot .report-review[data-print-expanded="true"]',
      ),
      learnersExpanded: !!document.querySelector(
        '#printRoot .report-review-learners[data-print-expanded="true"]',
      ),
    };
  } finally {
    window.__EDU_PRINT_TEST__ = originalFlag;
  }
}

function inspectPrintedVisibility() {
  const print = document.getElementById("printRoot"),
    body = print.querySelector(".report-review-body"),
    learners = [...print.querySelectorAll(".report-review-learners li")],
    wrap = print.querySelector(".report-review-table-wrap");
  return {
    bodyVisible: !!body.getClientRects().length,
    learnerCount: learners.length,
    learnersVisible: learners.every((node) => node.getClientRects().length > 0),
    rows: print.querySelectorAll(".report-review-table tbody tr").length,
    allRowsVisible: [
      ...print.querySelectorAll(".report-review-table tbody tr"),
    ].every((node) => node.getClientRects().length > 0),
    tableUnclipped:
      getComputedStyle(wrap).maxHeight === "none" &&
      getComputedStyle(wrap).overflow === "visible",
    noClosedDisclosures: !print.querySelector(
      "details.report-review,details.report-review-learners",
    ),
  };
}

function inspectParentPrivacy() {
  const fixture = globalThis.__reportReviewFixture,
    ids = globalThis.__reportSurfaceIds,
    source = structuredClone(fixture.projectedSource),
    selected = ids.a + "_student_1";
  for (const school of source.schools)
    for (const classroom of school.classes)
      for (const student of classroom.students)
        if (student.id !== selected) student.name = "PRIVATE_OTHER_PERSON";
  for (const session of source.sessions) {
    for (const student of session.roster)
      if (student.id !== selected) student.name = "PRIVATE_HISTORICAL_PERSON";
    for (const score of session.scores)
      if (score.studentId !== selected) score.note = "PRIVATE_OTHER_NOTE";
  }
  const parent = EduPeriodicReports.build(source, {
    mode: "daily",
    date: "2026-11-02",
    schoolId: ids.school,
    classId: ids.a,
    studentId: selected,
    audience: "parent",
  });
  parent.annualGrades = fixture.model.annualGrades.filter(
    (grade) => grade.studentId === selected && grade.classId === ids.a,
  );
  parent.technicalGrades = [];
  const html = EduPeriodicReports.documentHtml(parent),
    text = EduPeriodicReports.textReport(parent),
    quality = EduReportCompleteness.build(parent),
    academic = EduReportAcademicSummary.build(parent);
  document.getElementById("periodicReportOutput").innerHTML = html;
  return {
    noPrivateOutput: !/PRIVATE_/.test(html + text + JSON.stringify(parent)),
    onlySelectedStudent:
      parent.students.length === 1 && parent.students[0].studentId === selected,
    exactQuality:
      quality.expected === 1 &&
      quality.recorded === 1 &&
      quality.completionRate === 100,
    exactAcademic:
      academic.totals.assessments === 1 &&
      academic.totals.needsCompensation === 1,
    reviewPresent: !!document.querySelector(".report-review"),
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
  };
}

async function run(env) {
  const { evaluate, cdp, cases } = env,
    previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-report-review-"));
  await require("./browser-ready.cjs")(env);
  try {
    await evaluate(
      "(" + require("./report-surface-layout.cjs").setup.toString() + ")()",
    );
    const data = await evaluate("(" + prepareReviewFixture.toString() + ")()");
    cases.push({
      id: "report-review-real-recording-quality",
      name: "Actual daily report separates recording completeness from attendance rate",
      pass:
        data.actualQuality.expected === 6 &&
        data.actualQuality.recorded === 6 &&
        data.actualQuality.completionRate === 100 &&
        data.actualAttendanceRate === 50 &&
        data.quality.expected === 6 &&
        data.quality.recorded === 5 &&
        data.quality.unknown === 1 &&
        data.quality.partialSessions === 1 &&
        data.academic.totals.assessments === 33 &&
        data.academic.totals.incomplete === 2 &&
        data.academic.totals.needsCompensation === 2 &&
        data.academic.followup.length === 4,
      observed: data,
    });
    await evaluate(
      "globalThis.__reportReviewModelJSON = JSON.stringify(globalThis.__reportReviewFixture.model)",
    );
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await evaluate("(" + showReviewFixture.toString() + ")()");
      if (width <= 390) {
        await evaluate(
          "document.querySelector('.report-review').scrollIntoView({block:'start'}); window.scrollBy(0,-80)",
        );
        const closed = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(previews, "review-closed-" + width + ".png"),
          Buffer.from(closed.data, "base64"),
        );
      }
      const observed = await evaluate("(" + inspectReview.toString() + ")()");
      await evaluate(
        "document.querySelector('.report-review').scrollIntoView({block:'start'}); window.scrollBy(0,-80)",
      );
      const shot = await cdp("Page.captureScreenshot", { format: "png" }),
        screenshot = path.join(previews, "review-" + width + ".png");
      fs.writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
      cases.push({
        id: "report-review-layout-" + width,
        name: "Compact independent recording/grade review at " + width,
        pass: Object.entries(observed).every(([key, value]) =>
          key === "rows"
            ? value === 11
            : key === "learnerItems"
              ? value === 4
              : value === true,
        ),
        observed: { ...observed, screenshot },
      });
    }
    const print = await evaluate("(" + inspectReviewPrint.toString() + ")()");
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const visibility = await evaluate(
      "(" + inspectPrintedVisibility.toString() + ")()",
    );
    cases.push({
      id: "report-review-closed-print",
      name: "Real guarded printing expands closed review and learner follow-up without changing the screen",
      pass:
        Object.values(print).every((value) => value === true) &&
        Object.entries(visibility).every(([key, value]) =>
          key === "rows"
            ? value === 11
            : key === "learnerCount"
              ? value === 4
              : value === true,
        ),
      observed: { ...print, ...visibility },
    });
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await evaluate(
      "document.getElementById('printRoot')?.remove(); document.getElementById('printPageStyle')?.remove()",
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const parent = await evaluate(
      "(" + inspectParentPrivacy.toString() + ")()",
    );
    cases.push({
      id: "report-review-parent-privacy",
      name: "Parent recording and grade review exposes only the selected learner",
      pass: Object.values(parent).every((value) => value === true),
      observed: parent,
    });
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await cdp("Emulation.clearDeviceMetricsOverride");
    await evaluate(
      "document.getElementById('printRoot')?.remove(); document.getElementById('printPageStyle')?.remove(); delete globalThis.__reportReviewFixture; delete globalThis.__reportReviewModelJSON; globalThis.__reportSurfaceCleanup?.()",
    );
  }
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "report-review-browser", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
