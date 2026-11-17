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
  function unitBased(lesson) {
    return (
      isFormalModular(lesson) && lesson.gradingPolicy.modularScope === "unit"
    );
  }

  function assessments(lesson) {
    const result = new Map();
    for (const [pid, pod] of index(lesson.poudmans)) {
      const add = (node, uid, field) => {
        result.set(JSON.stringify([pid, uid ?? null]), {
          pid,
          uid,
          node,
          field,
          name: uid ? pod.name + " / " + (node.name || uid) : pod.name || pid,
        });
      };
      if (unitBased(lesson)) {
        for (const [uid, unit] of index(pod.units))
          add(unit, uid, "competencyScores");
      } else add(pod, undefined, "podScores");
    }
    return result;
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
      unitBased(a) !== unitBased(b) ||
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
      [...first.keys()].some((id) => {
        if (!second.has(id)) return true;
        if (!unitBased(a)) return false;
        const units = index(first.get(id).units),
          other = index(second.get(id).units);
        return (
          units.size !== other.size ||
          [...units.keys()].some((uid) => !other.has(uid))
        );
      })
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
      for (const unit of pod.units || []) {
        unit.unitScores = {};
        if (unit.competencyScores !== undefined) unit.competencyScores = {};
      }
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
      const targets = assessments(target),
        sourceAssessments = formal.map(assessments);
      for (const [key, targetScore] of targets) {
        const merged = {};
        for (const sourceMap of sourceAssessments) {
          const source = sourceMap.get(key);
          for (const [sid, record] of Object.entries(
            source.node[source.field] || {},
          )) {
            if (!students.has(sid)) continue;
            score(record);
            if (!own(merged, sid)) merged[sid] = clone(record);
            else if (empty(merged[sid]))
              merged[sid] = applyScore(merged[sid], record);
            else if (!empty(record) && !equal(merged[sid], record))
              throw Error(
                "برای یک هنرجو در پودمان «" +
                  targetScore.name +
                  "» دو نمرهٔ متفاوت در نوبت‌های سال ثبت شده است؛ ابتدا تعارض را اصلاح کنید.",
              );
          }
        }
        targetScore.node[targetScore.field] = merged;
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
      const a = isFormalModular(first) ? assessments(first) : new Map(),
        b = assessments(second),
        entries = [];
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        // Likewise, dropping a module's structure must not erase another term.
        if (!b.has(key)) continue;
        const oldTarget = a.get(key),
          newTarget = b.get(key),
          oldScores = oldTarget?.node[oldTarget.field] || {},
          newScores = newTarget.node[newTarget.field] || {};
        for (const sid of new Set([
          ...Object.keys(oldScores),
          ...Object.keys(newScores),
        ])) {
          const oldScore = rawScore(oldScores, sid),
            newScore = rawScore(newScores, sid);
          if (!equal(oldScore, newScore))
            entries.push({
              pid: newTarget.pid,
              uid: newTarget.uid,
              sid,
              oldScore,
              newScore,
            });
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
      const targets = assessments(target);
      for (const { pid, uid, sid, oldScore, newScore } of entries) {
        if (!students.has(sid)) continue;
        const assessment = targets.get(JSON.stringify([pid, uid ?? null]));
        if (!assessment)
          throw Error("پودمان یا واحد مقصد برای ثبت نمرهٔ سالانه موجود نیست.");
        const scores = (assessment.node[assessment.field] ||= {});
        const existing = rawScore(scores, sid);
        if (equal(existing, newScore)) continue;
        if (!equal(existing, oldScore))
          throw Error(
            "نمرهٔ سالانهٔ پودمان در نوبت دیگری تغییر کرده است؛ اطلاعات را دوباره بارگذاری کنید.",
          );
        const next = applyScore(existing, newScore);
        if (Object.keys(next).length) scores[sid] = next;
        else delete scores[sid];
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
