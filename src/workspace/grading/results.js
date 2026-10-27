function calcV24(c, l, sid, source = db) {
  const r = old.calcStudentLesson(c, l, sid, source);
  if (l.gradingPolicy) {
    const p = l.gradingPolicy;
    if (p.method === "dual")
      Object.assign(r, EduPolicy.dual(p, r.practical, r.theory));
    else
      Object.assign(r, EduPolicy.lesson(p, l.poudmans, sid), {
        avgM: null,
        avgP: null,
      });
    r.policyConfirmed = p.confirmed;
  } else if (l.gradeMode === "kardanesh")
    Object.assign(r, weightedKardanesh(r.practical, r.theory));
  return r;
}

function assessmentResult(lesson, sid, stage = "final") {
  if (!["midterm", "final"].includes(stage))
    throw Error("مرحله ارزشیابی نامعتبر است.");
  const grade = ownScoreRecord(lesson?.kardaneshScores, sid);
  const practical =
    grade[stage === "midterm" ? "midtermPractical" : "practical"] ?? null;
  const theory =
    grade[stage === "midterm" ? "midtermTheory" : "theory"] ?? null;
  if (lesson.gradingPolicy?.subjectType === "general")
    return {
      practical: null,
      theory,
      ...EduPolicy.dual(lesson.gradingPolicy, null, theory),
    };
  if (lesson.gradingPolicy?.method === "dual")
    return {
      practical,
      theory,
      ...EduPolicy.dual(lesson.gradingPolicy, practical, theory),
    };
  return {
    practical,
    theory,
    ...weightedKardanesh(practical, theory),
    complete: practical !== null && theory !== null,
    threshold: 14,
  };
}
function annualGradeRows(parts, schoolId, classId, studentId = "") {
  const rows = [],
    identities = new Map();
  for (const part of parts)
    for (const c of part.data.schools.find((s) => s.id === schoolId)?.classes ||
      []) {
      if (classId && c.id !== classId) continue;
      for (const st of knownStudents(c)) {
        if (studentId && st.id !== studentId) continue;
        for (const lesson of c.lessons.filter(
          (l) => l.gradeMode === "kardanesh",
        ))
          identities.set(c.id + "|" + st.id + "|" + lesson.id, {
            classId: c.id,
            className: c.name,
            studentId: st.id,
            studentName: st.name,
            lessonId: lesson.id,
            lessonName: lesson.name,
            general: lesson.gradingPolicy?.subjectType === "general",
          });
      }
    }
  for (const identity of identities.values()) {
    const components = [];
    let annualThreshold = 14;
    for (const term of ["اول", "دوم"]) {
      const part = parts.find((item) => item.period.term === term);
      const lesson = part?.data.schools
        .find((s) => s.id === schoolId)
        ?.classes.find((c) => c.id === identity.classId)
        ?.lessons.find(
          (l) => l.id === identity.lessonId && l.gradeMode === "kardanesh",
        );
      if (
        lesson &&
        (lesson.gradingPolicy?.subjectType === "general") !== identity.general
      )
        throw Error(
          "نوع درس در دو نوبت یکسان نیست؛ گزارش سالانه این درس قابل محاسبه نیست.",
        );
      const settings =
        lesson?.gradingPolicy?.method === "dual"
          ? EduPolicy.dualSettings(lesson.gradingPolicy)
          : { practicalWeight: 70, passMin: 14 };
      if (lesson) annualThreshold = settings.passMin;
      for (const stage of ["midterm", "final"]) {
        const r = lesson
          ? assessmentResult(lesson, identity.studentId, stage)
          : {
              practical: null,
              theory: null,
              final: null,
              complete: false,
            };
        components.push({
          term,
          stage,
          ...r,
          practicalWeight: settings.practicalWeight,
        });
      }
    }
    const complete = components.every((item) => item.complete);
    let final = null,
      passed = null;
    if (complete) {
      let total = { n: 0n, d: 1n };
      for (const item of components) {
        const p = fraction(identity.general ? 0 : item.practical),
          t = fraction(item.theory);
        const weight = fraction(item.practicalWeight);
        const n = identity.general
            ? t.n
            : weight.n * p.n * t.d + (100n * weight.d - weight.n) * t.n * p.d,
          d = identity.general ? t.d : 100n * weight.d * p.d * t.d;
        total = reduceGradeFraction(total.n * d + n * total.d, total.d * d);
      }
      final = finiteRatio(total.n, total.d * 4n);
      const minimum = fraction(annualThreshold);
      passed = identity.general
        ? null
        : total.n * minimum.d >= minimum.n * total.d * 4n;
    }
    rows.push({
      ...identity,
      components,
      complete,
      final,
      passed,
      threshold: identity.general ? null : annualThreshold,
    });
  }
  return rows;
}
function annualTechnicalRows(parts, schoolId, classId, studentId = "") {
  const rows = [];
  for (const part of parts)
    for (const c of part.data.schools.find((s) => s.id === schoolId)?.classes ||
      []) {
      if (classId && c.id !== classId) continue;
      for (const st of knownStudents(c)) {
        if (studentId && st.id !== studentId) continue;
        for (const lesson of c.lessons.filter(
          (l) => l.gradeMode !== "kardanesh",
        )) {
          const r = calcV24(c, lesson, st.id, part.data);
          const legacy = !lesson.gradingPolicy;
          const legacyUnits = legacy
            ? lesson.poudmans.flatMap((pod) =>
                pod.units.map((unit) => ({
                  moduleName: pod.name,
                  unitName: unit.name,
                  mostamar: r.details?.[pod.id]?.[unit.id]?.m ?? null,
                  payani: r.details?.[pod.id]?.[unit.id]?.p ?? null,
                  final: r.details?.[pod.id]?.[unit.id]?.final ?? null,
                })),
              )
            : [];
          const complete = legacy
            ? legacyUnits.length > 0 &&
              legacyUnits.every((unit) => Number.isFinite(unit.final))
            : (r.complete ?? false);
          rows.push({
            classId: c.id,
            className: c.name,
            studentId: st.id,
            studentName: st.name,
            lessonId: lesson.id,
            lessonName: lesson.name,
            term: part.period.term,
            method: legacy ? "legacy-unit" : "modular",
            legacyUnits,
            provisionalAverage: legacy ? (r.final ?? null) : null,
            final: legacy && !complete ? null : (r.final ?? null),
            complete,
            passed: legacy ? null : (r.passed ?? null),
            modules: (r.modules || []).map((m) => ({
              name: m.name,
              final: m.final ?? null,
              complete: m.complete,
              passed: m.passed,
              reason: m.reason || "",
            })),
          });
        }
      }
    }
  return rows;
}
