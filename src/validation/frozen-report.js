"use strict";

// Immutable historical-report validation; caller supplies domain helpers.
globalThis.EduFrozenReportValidator = Object.freeze({
  validate(
    report,
    {
      assertSafeDataTree,
      isDataObject,
      isSafeRecordId,
      weightedKardanesh,
      gradePolicy,
    },
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
              if (l.policy?.dualConfigurable === true) {
                if (!gradePolicy || l.policy.method !== "dual") fail();
                gradePolicy.validate(l.policy);
              }
              const expected =
                l.policy?.dualConfigurable === true
                  ? gradePolicy.dual(l.policy, r.practical, r.theory)
                  : l.policy?.subjectType === "general"
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
          if (l.policy?.version === 1 && l.policy.method === "modular") {
            if (
              !gradePolicy ||
              l.mode !== "standard" ||
              !Array.isArray(l.modules) ||
              !l.modules.length
            )
              fail();
            gradePolicy.validate(l.policy);
            for (const module of l.modules) {
              if (
                typeof module.complete !== "boolean" ||
                (module.complete
                  ? module.final == null || typeof module.passed !== "boolean"
                  : module.final != null || module.passed != null) ||
                (module.passed === true && module.final < l.policy.moduleMin)
              )
                fail();
              if (module.inputs !== undefined) {
                const inputs = module.inputs;
                if (
                  !isDataObject(inputs) ||
                  Object.keys(inputs).length !== 2 ||
                  !Object.hasOwn(inputs, "m") ||
                  !Object.hasOwn(inputs, "c")
                )
                  fail();
                for (const field of ["m", "c"])
                  if (
                    inputs[field] !== null &&
                    (typeof inputs[field] !== "number" ||
                      !Number.isFinite(inputs[field]) ||
                      !gradePolicy.parse(inputs[field], l.policy, field, "pod")
                        .ok)
                  )
                    fail();
                const expected = gradePolicy.moduleResult(l.policy, inputs);
                if (
                  module.final !== expected.final ||
                  module.complete !== expected.complete ||
                  module.passed !== expected.passed
                )
                  fail();
              }
            }
            // Older snapshots have results only. Validate their aggregate
            // without inventing raw inputs; new inputs are checked above.
            const expected = gradePolicy.moduleAggregate(l.modules);
            if (l.final !== expected.final || l.passed !== expected.passed)
              fail();
          }
        }
        // Old reports can contain historical averages calculated by a previous
        // method. Only enforce the current contract for fully policy-based data.
        if (
          st.lessons.length &&
          st.lessons.every(
            (lesson) =>
              lesson.policy?.version === 1 &&
              ["dual", "modular"].includes(lesson.policy.method),
          )
        ) {
          const average = st.lessons.every((lesson) => lesson.final != null)
            ? st.lessons.reduce((sum, lesson) => sum + lesson.final, 0) /
              st.lessons.length
            : null;
          if (st.average !== average) fail();
        }
      }
    }
    return true;
  },
});
