(function (root) {
  "use strict";

  const clone = (value) =>
      typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value)),
    own = (value, key) =>
      Object.prototype.hasOwnProperty.call(value || {}, key),
    object = (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value),
    fields = ["m", "c"],
    policyFields = [
      "version",
      "mostamarMax",
      "competencyFactor",
      "competencyMin",
      "moduleMin",
      "continuousStep",
    ];

  function isFormalModular(lesson) {
    return lesson?.gradingPolicy?.method === "modular";
  }

  function identify(value) {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !value.id ||
      ["__proto__", "prototype", "constructor", "toString"].includes(value.id)
    )
      throw Error("شناسهٔ اطلاعات نمرات پودمانی نامعتبر است.");
    return value.id;
  }

  function index(values = []) {
    if (!Array.isArray(values))
      throw Error("ساختار اطلاعات نمرات پودمانی نامعتبر است.");
    const result = new Map();
    for (const value of values) {
      const id = identify(value);
      if (result.has(id))
        throw Error("شناسهٔ تکراری در اطلاعات نمرات پودمانی وجود دارد.");
      result.set(id, value);
    }
    return result;
  }

  function members(classroom) {
    return new Set(
      index([
        ...(classroom.students || []),
        ...(classroom.archivedStudents || []),
      ]).keys(),
    );
  }

  function sameClasses(classrooms) {
    if (!Array.isArray(classrooms) || !classrooms.length)
      throw Error("برای تجمیع نمرات پودمانی، کلاس مشخص نشده است.");
    const id = identify(classrooms[0]);
    if (classrooms.some((classroom) => identify(classroom) !== id))
      throw Error("نمرات پودمانی کلاس‌های متفاوت قابل ترکیب نیستند.");
  }

  function rawScore(scores, sid) {
    return own(scores, sid) ? scores[sid] : undefined;
  }

  function score(record) {
    if (record === undefined || record === null) return [null, null];
    if (!object(record)) throw Error("رکورد نمرهٔ پودمانی نامعتبر است.");
    return fields.map((field) => {
      const value = own(record, field) ? record[field] : null;
      if (value == null) return null;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 20 ||
        (field === "c" && ![1, 2, 3].includes(value))
      )
        throw Error("مقدار نمرهٔ پودمانی نامعتبر است.");
      return value;
    });
  }

  function equal(a, b) {
    const x = score(a),
      y = score(b);
    return x.every((value, position) => value === y[position]);
  }

  function empty(record) {
    return score(record).every((value) => value === null);
  }

  function applyScore(existing, incoming) {
    const result = {
      ...(object(incoming) ? clone(incoming) : {}),
      ...(object(existing) ? clone(existing) : {}),
    };
    const values = score(incoming);
    fields.forEach((field, position) => {
      if (values[position] === null) delete result[field];
      else result[field] = values[position];
    });
    return result;
  }

  function compatible(a, b) {
    if (
      !isFormalModular(a) ||
      !isFormalModular(b) ||
      policyFields.some(
        (field) => a.gradingPolicy[field] !== b.gradingPolicy[field],
      )
    )
      throw Error(
        "قواعد نمره‌دهی درس پودمانی «" +
          (a.name || b.name || a.id) +
          "» در نوبت‌های این سال یکسان نیست؛ ابتدا تعارض را اصلاح کنید.",
      );
    const first = index(a.poudmans),
      second = index(b.poudmans);
    if (
      first.size !== second.size ||
      [...first.keys()].some((id) => !second.has(id))
    )
      throw Error(
        "ساختار پودمان‌های درس «" +
          (a.name || b.name || a.id) +
          "» در نوبت‌های این سال یکسان نیست؛ ابتدا تعارض را اصلاح کنید.",
      );
  }

  function skeleton(lesson) {
    const result = clone(lesson);
    result.kardaneshScores = {};
    for (const pod of result.poudmans || []) {
      pod.podScores = {};
      for (const unit of pod.units || []) unit.unitScores = {};
    }
    return result;
  }

  // The caller scopes these classes to one school and one academic year.
  // A raw m/c record is indivisible: two different partial records are a conflict.
  function mergeClass(classrooms, { includeMissingLessons = true } = {}) {
    sameClasses(classrooms);
    const result = clone(classrooms[0]),
      students = members(result),
      lessons = index(result.lessons),
      sources = new Map();
    for (const classroom of classrooms)
      for (const [id, lesson] of index(classroom.lessons)) {
        if (!sources.has(id)) sources.set(id, []);
        sources.get(id).push(lesson);
      }
    for (const [id, copies] of sources) {
      const formal = copies.filter(isFormalModular);
      if (!formal.length) continue;
      if (!includeMissingLessons && !lessons.has(id)) continue;
      for (const lesson of copies) compatible(formal[0], lesson);
      let target = lessons.get(id);
      if (!target) {
        target = skeleton(formal[0]);
        (result.lessons ||= []).push(target);
        lessons.set(id, target);
      }
      const pods = index(target.poudmans);
      for (const [pid, pod] of pods) {
        const merged = {};
        for (const lesson of formal) {
          const source = index(lesson.poudmans).get(pid);
          for (const [sid, record] of Object.entries(source.podScores || {})) {
            if (!students.has(sid)) continue;
            score(record);
            if (!own(merged, sid)) merged[sid] = clone(record);
            else if (empty(merged[sid]))
              merged[sid] = applyScore(merged[sid], record);
            else if (!empty(record) && !equal(merged[sid], record))
              throw Error(
                "برای یک هنرجو در پودمان «" +
                  (pod.name || pid) +
                  "» دو نمرهٔ متفاوت در نوبت‌های سال ثبت شده است؛ ابتدا تعارض را اصلاح کنید.",
              );
          }
        }
        pod.podScores = merged;
      }
    }
    return result;
  }

  function changes(previous, current) {
    previous ||= { id: current?.id, lessons: [] };
    sameClasses([previous, current]);
    const before = index(previous.lessons),
      after = index(current.lessons),
      result = [];
    for (const lid of new Set([...before.keys(), ...after.keys()])) {
      const first = before.get(lid),
        second = after.get(lid);
      // Removing a term's course is not an explicit deletion of annual grades.
      if (!isFormalModular(second)) continue;
      const a = index(isFormalModular(first) ? first.poudmans : []),
        b = index(isFormalModular(second) ? second.poudmans : []),
        entries = [];
      for (const pid of new Set([...a.keys(), ...b.keys()])) {
        // Likewise, dropping a module's structure must not erase another term.
        if (!b.has(pid)) continue;
        const oldScores = a.get(pid)?.podScores || {},
          newScores = b.get(pid)?.podScores || {};
        for (const sid of new Set([
          ...Object.keys(oldScores),
          ...Object.keys(newScores),
        ])) {
          const oldScore = rawScore(oldScores, sid),
            newScore = rawScore(newScores, sid);
          if (!equal(oldScore, newScore))
            entries.push({ pid, sid, oldScore, newScore });
        }
      }
      if (entries.length) result.push({ lid, first, second, entries });
    }
    return result;
  }

  function hasChanges(previous, current) {
    return changes(previous, current).length > 0;
  }

  function mirrorClass(previous, current, companion) {
    previous ||= { id: current?.id, lessons: [] };
    sameClasses([previous, current, companion]);
    const result = clone(companion),
      students = members(result),
      lessons = index(result.lessons);
    for (const { lid, first, second, entries } of changes(previous, current)) {
      const reference = isFormalModular(second) ? second : first;
      if (first && second) compatible(first, second);
      const target = lessons.get(lid);
      // A grade-only save cannot create a missing yearly course definition.
      if (!target) continue;
      compatible(reference, target);
      const pods = index(target.poudmans);
      for (const { pid, sid, oldScore, newScore } of entries) {
        if (!students.has(sid)) continue;
        const pod = pods.get(pid);
        if (!pod) throw Error("پودمان مقصد برای ثبت نمرهٔ سالانه موجود نیست.");
        pod.podScores ||= {};
        const existing = rawScore(pod.podScores, sid);
        if (equal(existing, newScore)) continue;
        if (!equal(existing, oldScore))
          throw Error(
            "نمرهٔ سالانهٔ پودمان در نوبت دیگری تغییر کرده است؛ اطلاعات را دوباره بارگذاری کنید.",
          );
        const next = applyScore(existing, newScore);
        if (Object.keys(next).length) pod.podScores[sid] = next;
        else delete pod.podScores[sid];
      }
    }
    return result;
  }

  root.EduAnnualModules = {
    isFormalModular,
    hasChanges,
    mergeClass,
    mirrorClass,
  };
})(globalThis);
