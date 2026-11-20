(function (root) {
  "use strict";

  // Summarize existing official results. A row is one assessment per learner:
  // an annual course result, a module, or an independent work unit. These
  // different assessment types never supply an invented course grade/average.
  function counts() {
    return {
      assessments: 0,
      complete: 0,
      incomplete: 0,
      passed: 0,
      needsCompensation: 0,
      unclassified: 0,
    };
  }
  function rates(row) {
    const eligible = row.passed + row.needsCompensation;
    return {
      ...row,
      eligible,
      completionRate: row.assessments
        ? (row.complete / row.assessments) * 100
        : null,
      passRate: eligible ? (row.passed / eligible) * 100 : null,
    };
  }
  function assertIdentity(grade, ...parts) {
    if (
      [
        grade?.classId,
        grade?.lessonId,
        grade?.studentId,
        ...parts.map((part) => part?.id),
      ].some((id) => typeof id !== "string" || !id.trim())
    )
      throw Error(
        "شناسهٔ کلاس، درس، هنرجو یا بخش ارزشیابی کامل نیست؛ گزارش را دوباره تهیه کنید.",
      );
  }
  function build(model) {
    const groups = new Map(),
      learners = new Set(),
      courses = new Set(),
      seen = new Map(),
      excludedLegacyRecords = new Set(),
      unconfiguredRecords = new Set(),
      followupRecords = [],
      total = counts();
    const inScope = (grade) =>
      (!model.class?.id || grade?.classId === model.class.id) &&
      (model.audience !== "parent" ||
        (model.class?.id &&
          model.student?.id &&
          grade?.classId === model.class.id &&
          grade?.studentId === model.student.id));
    const add = (grade, result, kind, module = null, unit = null) => {
      assertIdentity(
        grade,
        ...(kind === "annual" ? [] : [module]),
        ...(kind === "unit" ? [unit] : []),
      );
      const key = JSON.stringify([
          grade.classId,
          grade.lessonId,
          kind,
          module?.id || "",
          unit?.id || "",
        ]),
        record = JSON.stringify([key, grade.studentId]),
        status =
          result.complete !== true
            ? "incomplete"
            : result.passed === true && !grade.general
              ? "passed"
              : result.passed === false && !grade.general
                ? "needsCompensation"
                : "unclassified";
      if (seen.has(record)) {
        if (seen.get(record) !== status)
          throw Error(
            "وضعیت ارزشیابی تکراری و متعارض است؛ گزارش را دوباره تهیه کنید.",
          );
        return;
      }
      seen.set(record, status);
      if (status === "incomplete" || status === "needsCompensation")
        followupRecords.push({
          key: record,
          entry: {
            studentId: grade.studentId,
            studentName: String(grade.studentName ?? ""),
            studentCode: String(grade.studentCode ?? ""),
            classId: grade.classId,
            className: String(grade.className ?? ""),
            lessonId: grade.lessonId,
            lessonName: String(grade.lessonName ?? ""),
            moduleName: String(module?.name ?? ""),
            unitName: String(unit?.name ?? ""),
            kind,
            status,
          },
        });
      if (!groups.has(key))
        groups.set(key, {
          key,
          kind,
          classId: grade.classId,
          className: grade.className,
          lessonId: grade.lessonId,
          lessonName: grade.lessonName,
          moduleId: module?.id || "",
          moduleName: module?.name || "",
          unitId: unit?.id || "",
          unitName: unit?.name || "",
          ...counts(),
        });
      for (const row of [groups.get(key), total]) {
        row.assessments++;
        row[status]++;
        if (status !== "incomplete") row.complete++;
      }
      learners.add(JSON.stringify([grade.classId, grade.studentId]));
      courses.add(JSON.stringify([grade.classId, grade.lessonId]));
    };
    for (const grade of model.annualGrades || []) {
      if (!inScope(grade)) continue;
      add(grade, grade, "annual");
    }
    for (const grade of model.technicalGrades || []) {
      if (!inScope(grade)) continue;
      assertIdentity(grade);
      if (grade.method !== "modular") {
        excludedLegacyRecords.add(
          JSON.stringify([
            grade.classId,
            grade.lessonId,
            grade.studentId,
            grade.sourcePeriodId || grade.term || "",
          ]),
        );
        continue;
      }
      const structureKey = (moduleId = "") =>
        JSON.stringify([
          grade.classId,
          grade.lessonId,
          grade.studentId,
          moduleId,
        ]);
      if (!grade.modules?.length) unconfiguredRecords.add(structureKey());
      for (const module of grade.modules || []) {
        assertIdentity(grade, module);
        if (grade.unitBased) {
          if (!module.units?.length)
            unconfiguredRecords.add(structureKey(module.id));
          for (const unit of module.units || [])
            add(grade, unit, "unit", module, unit);
        } else add(grade, module, "module", module);
      }
    }
    const rows = [...groups.values()].map(rates);
    rows.sort((a, b) => {
      for (const field of [
        "className",
        "lessonName",
        "moduleName",
        "unitName",
        "key",
      ]) {
        const difference = String(a[field] || "").localeCompare(
          String(b[field] || ""),
          "fa",
          { numeric: true },
        );
        if (difference) return difference;
      }
      return 0;
    });
    followupRecords.sort((a, b) => {
      for (const field of [
        "className",
        "studentName",
        "lessonName",
        "moduleName",
        "unitName",
      ]) {
        const difference = a.entry[field].localeCompare(b.entry[field], "fa", {
          numeric: true,
        });
        if (difference) return difference;
      }
      return a.key.localeCompare(b.key);
    });
    return {
      rows,
      followup: followupRecords.map((record) => record.entry),
      totals: {
        ...rates(total),
        students: learners.size,
        courses: courses.size,
        excludedLegacyRecords: excludedLegacyRecords.size,
        unconfiguredRecords: unconfiguredRecords.size,
      },
    };
  }

  root.EduReportAcademicSummary = Object.freeze({ build });
})(globalThis);
