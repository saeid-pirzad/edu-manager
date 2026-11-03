function calcV24(c, l, sid, source = db) {
  const r = old.calcStudentLesson(c, l, sid, source);
  if (l.gradingPolicy) {
    const p = l.gradingPolicy;
    // General lessons ignore legacy practical fields and use one direct grade.
    if (p.subjectType === "general") r.practical = null;
    if (p.method === "dual")
      Object.assign(r, EduPolicy.dual(p, r.practical, r.theory));
    else
      Object.assign(r, EduReportGrades.modular(l, sid), {
        avgM: null,
        avgP: null,
      });
    r.policyConfirmed = p.confirmed;
  } else if (l.gradeMode === "kardanesh")
    Object.assign(r, weightedKardanesh(r.practical, r.theory));
  return r;
}

function assessmentWeights(lesson) {
  return EduReportGrades.weights(lesson);
}

function assessmentResult(lesson, sid, stage = "final") {
  return EduReportGrades.assessment(lesson, sid, stage);
}
function assertCompatibleTermLessons(reference, candidate) {
  if (!reference || !candidate) return;
  const dual = reference.gradeMode === "kardanesh";
  if (dual !== (candidate.gradeMode === "kardanesh"))
    throw Error(
      "شیوهٔ نمره‌دهی درس «" +
        reference.name +
        "» در دو نوبت متفاوت است؛ برای حفظ سوابق، درس با شیوهٔ متفاوت باید شناسهٔ مستقل داشته باشد.",
    );
  if (
    (reference.gradingPolicy?.method === "modular") !==
    (candidate.gradingPolicy?.method === "modular")
  )
    throw Error(
      "شیوهٔ پودمانی و واحدی درس «" +
        reference.name +
        "» یکسان نیست؛ سوابق متفاوت قابل ترکیب نیستند.",
    );
  if (
    dual &&
    (reference.gradingPolicy?.subjectType === "general") !==
      (candidate.gradingPolicy?.subjectType === "general")
  )
    throw Error(
      "نوع درس «" +
        reference.name +
        "» در دو نوبت یکسان نیست؛ گزارش این درس قابل محاسبه نیست.",
    );
  if (dual && reference.gradingPolicy?.subjectType !== "general") {
    const first = EduReportGrades.settings(reference),
      second = EduReportGrades.settings(candidate);
    if (
      ["practicalWeight", "theoryMin", "practicalMin", "passMin"].some(
        (field) => first[field] !== second[field],
      )
    )
      throw Error(
        "قواعد نمره‌دهی درس «" +
          reference.name +
          "» در نوبت‌های این سال یکسان نیست؛ پیش از گزارش سالانه تعارض ضرایب و حدنصاب‌ها را اصلاح کنید.",
      );
  }
  if (reference.gradingPolicy?.method === "modular") {
    if (
      [
        "version",
        "mostamarMax",
        "competencyFactor",
        "competencyMin",
        "moduleMin",
        "continuousStep",
      ].some(
        (field) =>
          reference.gradingPolicy[field] !== candidate.gradingPolicy[field],
      )
    )
      throw Error(
        "قواعد نمره‌دهی درس پودمانی «" +
          reference.name +
          "» در نوبت‌های این سال یکسان نیست؛ پیش از گزارش سالانه تعارض را اصلاح کنید.",
      );
    const structure = (lesson) => {
      const pods = new Map();
      for (const pod of lesson.poudmans || []) {
        const units = new Set((pod.units || []).map((unit) => unit.id));
        if (pods.has(pod.id) || units.size !== (pod.units || []).length)
          throw Error(
            "ساختار پودمان‌ها یا واحدهای درس دارای شناسهٔ تکراری است.",
          );
        pods.set(pod.id, units);
      }
      return pods;
    };
    const first = structure(reference),
      second = structure(candidate);
    if (
      first.size !== second.size ||
      [...first].some(([id, units]) => {
        const other = second.get(id);
        return (
          !other ||
          units.size !== other.size ||
          [...units].some((unitId) => !other.has(unitId))
        );
      })
    )
      throw Error(
        "ساختار پودمان‌ها و واحدهای درس «" +
          reference.name +
          "» در نوبت‌های این سال یکسان نیست؛ پیش از گزارش سالانه تعارض را اصلاح کنید.",
      );
  }
}
function assertAnnualLessonCompatibility(parts, schoolId, classId = "") {
  const lessons = new Map();
  for (const part of parts)
    for (const classroom of part.data.schools.find(
      (school) => school.id === schoolId,
    )?.classes || []) {
      if (classId && classroom.id !== classId) continue;
      for (const lesson of classroom.lessons) {
        const key = classroom.id + "|" + lesson.id;
        assertCompatibleTermLessons(lessons.get(key), lesson);
        lessons.set(key, lesson);
      }
    }
}
function annualGradeRows(parts, schoolId, classId, studentId = "") {
  assertAnnualLessonCompatibility(parts, schoolId, classId);
  parts = [...parts].sort(
    (a, b) =>
      (a.period.term === "اول" ? 0 : 1) - (b.period.term === "اول" ? 0 : 1),
  );
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
            studentCode: String(st.code ?? ""),
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
      const settings = EduReportGrades.settings(lesson || {});
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
    rows.push({
      ...identity,
      components,
      ...EduReportGrades.annual(components, {
        general: identity.general,
        threshold: annualThreshold,
      }),
    });
  }
  return rows;
}
function annualModularLesson(parts, schoolId, classId, lesson, sid) {
  const selected = (classroom) => ({
    ...classroom,
    students: [{ id: sid }],
    archivedStudents: [],
    lessons: classroom.lessons
      .filter((item) => item.id === lesson.id)
      .map((item) => ({
        ...clone(item),
        poudmans: item.poudmans.map((pod) => ({
          ...clone(pod),
          podScores: Object.hasOwn(pod.podScores || {}, sid)
            ? { [sid]: clone(pod.podScores[sid]) }
            : {},
        })),
      })),
  });
  const versions = parts.flatMap((part) => {
    const classroom = part.data.schools
      .find((school) => school.id === schoolId)
      ?.classes.find((item) => item.id === classId);
    return classroom ? [selected(classroom)] : [];
  });
  const base = selected({ id: classId, lessons: [lesson] });
  return EduAnnualModules.mergeClass([base, ...versions]).lessons.find(
    (item) => item.id === lesson.id,
  );
}

function annualTechnicalRows(parts, schoolId, classId, studentId = "") {
  assertAnnualLessonCompatibility(parts, schoolId, classId);
  const rows = [],
    annual = new Set();
  for (const part of parts)
    for (const c of part.data.schools.find((s) => s.id === schoolId)?.classes ||
      []) {
      if (classId && c.id !== classId) continue;
      for (const st of knownStudents(c)) {
        if (studentId && st.id !== studentId) continue;
        for (const lesson of c.lessons.filter(
          (l) => l.gradeMode !== "kardanesh",
        )) {
          const formal = lesson.gradingPolicy?.method === "modular";
          const key = JSON.stringify([c.id, st.id, lesson.id]);
          if (formal && annual.has(key)) continue;
          if (formal) annual.add(key);
          const merged = formal
            ? annualModularLesson(parts, schoolId, c.id, lesson, st.id)
            : lesson;
          const r = calcV24(c, merged, st.id, part.data);
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
            studentCode: String(st.code ?? ""),
            lessonId: lesson.id,
            lessonName: lesson.name,
            term: formal ? "سالانه" : part.period.term,
            method: legacy ? "legacy-unit" : "modular",
            legacyUnits,
            units: formal
              ? merged.poudmans.flatMap((pod) =>
                  pod.units.map((unit) => ({
                    moduleName: pod.name,
                    unitName: unit.name,
                    mostamar: ownScoreRecord(unit.unitScores, st.id).m ?? null,
                    payani: ownScoreRecord(unit.unitScores, st.id).p ?? null,
                  })),
                )
              : [],
            provisionalAverage: legacy ? (r.final ?? null) : null,
            final: legacy && !complete ? null : (r.final ?? null),
            complete,
            passed: legacy ? null : (r.passed ?? null),
            modules: (r.modules || []).map((m) => ({
              name: m.name,
              continuous:
                ownScoreRecord(
                  merged.poudmans.find((p) => p.id === m.id)?.podScores,
                  st.id,
                ).m ?? null,
              competency:
                ownScoreRecord(
                  merged.poudmans.find((p) => p.id === m.id)?.podScores,
                  st.id,
                ).c ?? null,
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
