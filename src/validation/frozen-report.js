"use strict";

// Immutable historical-report validation; caller supplies domain helpers.
globalThis.EduFrozenReportValidator = Object.freeze({
  validate(
    report,
    { assertSafeDataTree, isDataObject, isSafeRecordId, weightedKardanesh },
  ) {
    const fail = () => {
      throw Error(
        "ساختار کارنامه ثابت معتبر نیست؛ فایل اصلی را برای بررسی نگه دارید.",
      );
    };
    const text = (value) => typeof value === "string" && value.length <= 10000;
    const score = (value) =>
      value == null ||
      (typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 20);
    const optionalBoolean = (value) =>
      value == null || typeof value === "boolean";
    assertSafeDataTree(report);
    if (
      !isDataObject(report) ||
      !isSafeRecordId(report.id) ||
      !isSafeRecordId(report.workspace) ||
      !text(report.year) ||
      !text(report.term) ||
      typeof report.at !== "string" ||
      !Number.isFinite(Date.parse(report.at)) ||
      !Array.isArray(report.classes)
    )
      fail();
    for (const c of report.classes) {
      if (
        !isDataObject(c) ||
        !text(c.school) ||
        !text(c.name) ||
        !Array.isArray(c.students)
      )
        fail();
      const students = new Set();
      for (const st of c.students) {
        if (
          !isDataObject(st) ||
          !isSafeRecordId(st.id) ||
          students.has(st.id) ||
          !text(st.name) ||
          (st.code !== undefined && !text(st.code)) ||
          !score(st.average) ||
          !Array.isArray(st.lessons)
        )
          fail();
        students.add(st.id);
        const lessons = new Set();
        for (const l of st.lessons) {
          if (
            !isDataObject(l) ||
            !isSafeRecordId(l.id) ||
            lessons.has(l.id) ||
            !text(l.name) ||
            (l.mode !== undefined &&
              !["standard", "kardanesh"].includes(l.mode)) ||
            !optionalBoolean(l.passed) ||
            (l.reason !== undefined && !text(l.reason)) ||
            (l.teacher !== undefined && !text(l.teacher)) ||
            (l.policy != null && !isDataObject(l.policy)) ||
            (l.courseInfo != null && !isDataObject(l.courseInfo)) ||
            [
              "practical",
              "theory",
              "mostamar",
              "payani",
              "final",
              "threshold",
            ].some((key) => !score(l[key]))
          )
            fail();
          lessons.add(l.id);
          if (l.assessments !== undefined) {
            if (
              l.mode !== "kardanesh" ||
              !isDataObject(l.assessments) ||
              l.assessments.version !== 1
            )
              fail();
            for (const stage of ["midterm", "final"]) {
              const r = l.assessments[stage];
              if (
                !isDataObject(r) ||
                !score(r.practical) ||
                !score(r.theory) ||
                (l.policy?.subjectType !== "general" && r.practical == null) ||
                r.theory == null ||
                !score(r.final) ||
                r.complete !== true
              )
                fail();
              const expected = l.policy?.subjectType === "general"
                ? { final: r.theory, passed: null }
                : weightedKardanesh(r.practical, r.theory);
              if (r.final !== expected.final || r.passed !== expected.passed)
                fail();
            }
            if (
              l.practical !== l.assessments.final.practical ||
              l.theory !== l.assessments.final.theory ||
              l.final !== l.assessments.final.final ||
              l.passed !== l.assessments.final.passed
            )
              fail();
          }
          if (l.modules != null) {
            if (!Array.isArray(l.modules)) fail();
            const modules = new Set();
            for (const m of l.modules) {
              if (
                !isDataObject(m) ||
                !isSafeRecordId(m.id) ||
                modules.has(m.id) ||
                !text(m.name) ||
                !score(m.final) ||
                !optionalBoolean(m.passed) ||
                !optionalBoolean(m.complete) ||
                (m.reason !== undefined && !text(m.reason))
              )
                fail();
              modules.add(m.id);
            }
          }
        }
      }
    }
    return true;
  },
});
