(function (root) {
  "use strict";
  const copy = (value) => structuredClone(value),
    own = (value, key) =>
      Object.prototype.hasOwnProperty.call(value || {}, key),
    object = (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value),
    reserved = new Set([
      "__proto__",
      "prototype",
      "constructor",
      ...Object.getOwnPropertyNames(Object.prototype),
    ]),
    policyMetadata = new Set([
      "revision",
      "confirmed",
      "circularNumber",
      "circularDate",
      "reference",
      "grade",
      "field",
      "code",
      "authority",
    ]),
    optionDefaults = {
      pos: false,
      neg: false,
      hw: false,
      present: false,
      late: false,
    };
  function fail(message) {
    const error = Error(message);
    error.code = "ACADEMIC_COURSE_CONFLICT";
    throw error;
  }
  function identify(value) {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(value.id) ||
      reserved.has(value.id)
    )
      fail("شناسهٔ درس، پودمان یا واحد سال تحصیلی معتبر نیست.");
    return value.id;
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!object(value)) return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        fail("ویژگی نامعتبر در شناسنامهٔ مشترک درس وجود دارد.");
      if (value[key] !== undefined) result[key] = canonical(value[key]);
    }
    return result;
  }
  const same = (a, b) =>
    JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function index(values = []) {
    if (!Array.isArray(values)) fail("ساختار فهرست درس‌های سال معتبر نیست.");
    const result = new Map();
    for (const value of values) {
      const id = identify(value);
      if (result.has(id))
        fail("شناسهٔ تکراری در ساختار درس‌های سال وجود دارد.");
      result.set(id, value);
    }
    return result;
  }
  function checkStructure(lesson, occupied = new Set()) {
    const add = (item) => {
      const id = identify(item);
      if (occupied.has(id))
        fail("شناسهٔ تکراری میان درس‌ها، پودمان‌ها یا واحدها وجود دارد.");
      occupied.add(id);
    };
    add(lesson);
    for (const pod of index(lesson.poudmans || []).values()) {
      add(pod);
      for (const unit of index(pod.units || []).values()) add(unit);
    }
    return occupied;
  }
  function definition(lesson) {
    checkStructure(lesson);
    const result = copy(lesson);
    delete result.kardaneshScores;
    result.gradeMode ||= "standard";
    result.weightMostamar ??= 40;
    result.weightPayani ??= 60;
    result.poudmans ||= [];
    for (const pod of result.poudmans) {
      delete pod.podScores;
      pod.units ||= [];
      for (const unit of pod.units) {
        delete unit.unitScores;
        unit.applyOptions = { ...optionDefaults, ...(unit.applyOptions || {}) };
      }
    }
    return canonical(result);
  }
  function projection(classroom) {
    identify(classroom);
    const occupied = new Set();
    return {
      id: classroom.id,
      lessons: [...index(classroom.lessons || []).values()].map((lesson) => {
        checkStructure(lesson, occupied);
        return definition(lesson);
      }),
    };
  }
  function hasChanges(previous, current) {
    if (!previous || !current) return previous !== current;
    if (identify(previous) !== identify(current))
      fail("شناسهٔ کلاس درس‌های سال تغییر کرده است.");
    return !same(projection(previous), projection(current));
  }
  function policyProjection(lesson) {
    const result = definition(lesson),
      policy = result.gradingPolicy;
    return canonical({
      gradeMode: result.gradeMode,
      weightMostamar: result.weightMostamar,
      weightPayani: result.weightPayani,
      gradingPolicy: policy
        ? Object.fromEntries(
            Object.entries(policy).filter(([key]) => !policyMetadata.has(key)),
          )
        : null,
      poudmans: result.poudmans.map((pod) => {
        const value = copy(pod);
        delete value.name;
        value.units = value.units.map((unit) => {
          const next = copy(unit);
          delete next.name;
          return next;
        });
        return value;
      }),
    });
  }
  function assertCompatible(reference, candidate) {
    if (!reference || !candidate) return true;
    if (
      identify(reference) !== identify(candidate) ||
      !same(policyProjection(reference), policyProjection(candidate))
    )
      fail(
        "قواعد یا ساختار درس «" +
          (candidate?.name || reference?.name || "") +
          "» در نوبت‌های سال یکسان نیست؛ ابتدا اختلاف را بررسی کنید.",
      );
    return true;
  }
  function lessonSessions(lesson, sessions) {
    if (!Array.isArray(sessions))
      fail("فهرست جلسات برای بررسی سوابق درس معتبر نیست.");
    return sessions.filter((session) => session.lessonId === lesson.id);
  }
  function hasGrades(lesson, sessions) {
    if (
      Object.values(lesson.kardaneshScores || {}).some((grade) =>
        ["practical", "theory", "midtermPractical", "midtermTheory"].some(
          (field) => grade?.[field] != null,
        ),
      ) ||
      lessonSessions(lesson, sessions).some(
        (session) => (session.scores || []).length,
      )
    )
      return true;
    return (lesson.poudmans || []).some(
      (pod) =>
        Object.keys(pod.podScores || {}).length ||
        (pod.units || []).some(
          (unit) => Object.keys(unit.unitScores || {}).length,
        ),
    );
  }
  function method(lesson) {
    return [
      lesson.gradeMode || "standard",
      lesson.gradingPolicy?.method || null,
      lesson.gradingPolicy?.subjectType || "vocational",
    ];
  }
  function assertEdit(target, current, sessions) {
    const history = lessonSessions(target, sessions),
      pods = index(current.poudmans || []);
    if (
      !same(policyProjection(target), policyProjection(current)) &&
      hasGrades(target, sessions)
    )
      fail(
        "درس «" +
          target.name +
          "» در یکی از نوبت‌ها نمره یا فعالیت ثبت‌شده دارد؛ تغییر قواعد یا ساختار مشترک آن مجاز نیست.",
      );
    if (history.length && !same(method(target), method(current)))
      fail(
        "درس «" +
          target.name +
          "» جلسهٔ ثبت‌شده دارد؛ روش ارزشیابی مشترک آن قابل تغییر نیست.",
      );
    for (const session of history) {
      const pod = session.poudmanId ? pods.get(session.poudmanId) : null;
      if (
        (session.poudmanId && !pod) ||
        (session.unitId &&
          (!pod || !index(pod.units || []).has(session.unitId)))
      )
        fail(
          "تغییر ساختار درس «" +
            target.name +
            "» ارتباط پودمان یا واحدِ جلسهٔ قبلی را حذف می‌کند.",
        );
    }
  }
  function replaceScores(current, target) {
    const result = copy(current),
      pods = index(target?.poudmans || []),
      existingUnits = new Map(
        [...pods.values()].flatMap((pod) => [...index(pod.units || [])]),
      );
    const scoreMap = (result, existing, key) => {
      if (!existing) result[key] = {};
      else if (own(existing, key)) result[key] = copy(existing[key]);
      else delete result[key];
    };
    scoreMap(result, target, "kardaneshScores");
    for (const pod of result.poudmans || []) {
      const old = pods.get(pod.id);
      scoreMap(pod, old, "podScores");
      for (const unit of pod.units || [])
        scoreMap(unit, existingUnits.get(unit.id), "unitScores");
    }
    return result;
  }
  function distinctNames(lessons) {
    const names = new Map();
    for (const lesson of lessons) {
      const name = String(lesson.name || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (name && names.has(name) && names.get(name) !== lesson.id)
        fail(
          "درس هم‌نام با دو شناسهٔ متفاوت در نوبت‌های سال وجود دارد؛ هویت درس‌ها خودکار ادغام نمی‌شود.",
        );
      if (name) names.set(name, lesson.id);
    }
  }
  function mirrorClass(
    previous,
    current,
    target,
    { sessions = [], allowLessonRemoval = true } = {},
  ) {
    projection(current);
    if (previous) projection(previous);
    if (target) projection(target);
    if (previous && identify(previous) !== current.id)
      fail("کلاس مبدأ درس‌های سال سازگار نیست.");
    if (target && identify(target) !== current.id)
      fail("کلاس مقصد درس‌های سال سازگار نیست.");
    const result = copy(target || { ...current, lessons: [] }),
      before = index(previous?.lessons || []),
      after = index(current.lessons || []),
      existing = index(target?.lessons || []),
      next = new Map([...existing].map(([id, lesson]) => [id, copy(lesson)]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const old = before.get(id),
        incoming = after.get(id),
        found = existing.get(id);
      if (!incoming) {
        if (!found) continue;
        if (
          !allowLessonRemoval ||
          hasGrades(found, sessions) ||
          lessonSessions(found, sessions).length
        )
          fail(
            "درس «" +
              found.name +
              "» در یکی از نوبت‌ها سابقه دارد یا حذف مشترک آن مجاز نیست؛ حذف انجام نشد.",
          );
        if (old && !same(definition(found), definition(old)))
          fail(
            "تعریف درسِ در حال حذف در نوبت دیگر متفاوت است؛ ابتدا اختلاف را بررسی کنید.",
          );
        next.delete(id);
        continue;
      }
      if (old && found && same(definition(old), definition(incoming))) continue;
      if (
        found &&
        !same(definition(found), definition(incoming)) &&
        (!old || !same(definition(found), definition(old)))
      )
        fail(
          "تعریف درس «" +
            incoming.name +
            "» در نوبت دیگر متفاوت است؛ ابتدا اختلاف را بررسی کنید.",
        );
      if (found) assertEdit(found, incoming, sessions);
      next.set(id, replaceScores(incoming, found));
    }
    const oldOrder = [...before.keys()],
      newOrder = [...after.keys()],
      targetOrder = [...existing.keys()];
    let order = targetOrder.filter((id) => next.has(id));
    if (!same(oldOrder, newOrder)) {
      const shared = new Set(
          oldOrder.filter(
            (id) => newOrder.includes(id) && targetOrder.includes(id),
          ),
        ),
        targetShared = targetOrder.filter((id) => shared.has(id));
      if (
        !same(
          targetShared,
          oldOrder.filter((id) => shared.has(id)),
        ) &&
        !same(
          targetShared,
          newOrder.filter((id) => shared.has(id)),
        )
      )
        fail(
          "ترتیب درس‌ها در نوبت دیگر متفاوت است؛ ابتدا اختلاف را بررسی کنید.",
        );
      order = [
        ...newOrder.filter((id) => next.has(id)),
        ...order.filter((id) => !newOrder.includes(id)),
      ];
    }
    for (const id of next.keys()) if (!order.includes(id)) order.push(id);
    result.lessons = order.map((id) => next.get(id));
    projection(result);
    distinctNames(result.lessons);
    return result;
  }
  function unionOrder(sequences, available) {
    const rank = new Map([...available].map((id, i) => [id, i])),
      edges = new Map([...available].map((id) => [id, new Set()])),
      indegree = new Map([...available].map((id) => [id, 0]));
    for (const ids of sequences)
      for (let i = 1; i < ids.length; i++)
        if (!edges.get(ids[i - 1]).has(ids[i])) {
          edges.get(ids[i - 1]).add(ids[i]);
          indegree.set(ids[i], indegree.get(ids[i]) + 1);
        }
    const queue = [...available].filter((id) => !indegree.get(id)),
      result = [];
    while (queue.length) {
      queue.sort((a, b) => rank.get(a) - rank.get(b));
      const id = queue.shift();
      result.push(id);
      for (const next of edges.get(id)) {
        indegree.set(next, indegree.get(next) - 1);
        if (!indegree.get(next)) queue.push(next);
      }
    }
    if (result.length !== available.size)
      fail(
        "ترتیب درس‌های سال بین نوبت‌ها متناقض است؛ ترتیب ثبت خودکار بازنویسی نشد.",
      );
    return result;
  }
  function reconcileClass(copies) {
    if (!Array.isArray(copies) || !copies.length)
      fail("کلاسی برای یکپارچه‌سازی درس‌های سال مشخص نشده است.");
    const result = copy(copies[0]),
      id = identify(result),
      lessons = new Map();
    for (const classroom of copies) {
      if (identify(classroom) !== id)
        fail("درس‌های کلاس‌های متفاوت قابل یکپارچه‌سازی نیستند.");
      projection(classroom);
      for (const lesson of classroom.lessons || []) {
        const existing = lessons.get(lesson.id);
        if (existing && !same(definition(existing), definition(lesson)))
          fail(
            "تعریف درس «" +
              lesson.name +
              "» بین نوبت‌های سال متفاوت است؛ هیچ نسخه‌ای خودکار جایگزین نشد.",
          );
        if (!existing)
          lessons.set(
            lesson.id,
            result.lessons?.some((item) => item.id === lesson.id)
              ? copy(lesson)
              : replaceScores(lesson, null),
          );
      }
    }
    const order = unionOrder(
      copies.map((classroom) =>
        (classroom.lessons || []).map((lesson) => lesson.id),
      ),
      new Set(lessons.keys()),
    );
    result.lessons = order.map((lid) => lessons.get(lid));
    projection(result);
    distinctNames(result.lessons);
    return result;
  }
  root.EduAcademicYearCourses = Object.freeze({
    projection,
    hasChanges,
    mirrorClass,
    reconcileClass,
    policyProjection,
    assertCompatible,
  });
})(globalThis);
