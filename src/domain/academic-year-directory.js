(function (root) {
  "use strict";

  const copy = (value) => structuredClone(value),
    own = (value, key) =>
      Object.prototype.hasOwnProperty.call(value || {}, key),
    same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    object = (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value);

  function conflict(message) {
    const error = Error(message);
    error.code = "ACADEMIC_DIRECTORY_CONFLICT";
    throw error;
  }
  function identify(value) {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(value.id) ||
      ["__proto__", "prototype", "constructor", "toString"].includes(value.id)
    )
      conflict("شناسهٔ فهرست سال تحصیلی معتبر نیست.");
    return value.id;
  }
  function index(values) {
    if (!Array.isArray(values)) conflict("ساختار فهرست سال تحصیلی معتبر نیست.");
    const result = new Map();
    for (const value of values) {
      const id = identify(value);
      if (result.has(id))
        conflict("شناسهٔ تکراری در فهرست سال تحصیلی وجود دارد.");
      result.set(id, value);
    }
    return result;
  }
  function roster(classroom) {
    const active = index(classroom.students || []),
      archived = index(classroom.archivedStudents || []),
      result = new Map();
    for (const [status, entries] of [
      ["active", active],
      ["archived", archived],
    ])
      for (const [id, student] of entries) {
        if (result.has(id)) conflict("هنرجو هم‌زمان فعال و بایگانی است.");
        result.set(id, { status, student });
      }
    return result;
  }
  function comparableStudent(student) {
    const result = {};
    for (const key of [...new Set([...Object.keys(student), "code"])].sort()) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        conflict("ویژگی هنرجو معتبر نیست.");
      result[key] = key === "code" ? student.code || "" : student[key];
    }
    // An omitted optional code and the editor's empty code mean the same thing.
    return result;
  }
  function projection(classroom) {
    identify(classroom);
    roster(classroom);
    return {
      id: classroom.id,
      name: classroom.name,
      students: (classroom.students || []).map(comparableStudent),
      archivedStudents: (classroom.archivedStudents || []).map(
        comparableStudent,
      ),
    };
  }
  function hasChanges(previous, current) {
    if (!previous || !current) return previous !== current;
    if (identify(previous) !== identify(current))
      conflict("شناسهٔ کلاس هنگام ویرایش تغییر کرده است.");
    return !same(projection(previous), projection(current));
  }
  function applyField(target, previous, current, field, label) {
    const before = previous?.[field],
      after = current?.[field],
      value = target[field];
    if (same(before, after)) return;
    if (!same(value, before) && !same(value, after))
      conflict(
        "اطلاعات «" +
          label +
          "» در نوبت دیگر متفاوت است؛ ابتدا تعارض را بررسی کنید.",
      );
    if (own(current, field)) target[field] = copy(after);
    else delete target[field];
  }
  function ordered(previous, current, target, available) {
    const previousIds = previous.map((value) =>
        typeof value === "string" ? value : value.id,
      ),
      currentIds = current.map((value) =>
        typeof value === "string" ? value : value.id,
      ),
      targetIds = target.map((value) =>
        typeof value === "string" ? value : value.id,
      );
    const incoming = currentIds.filter((id) => available.has(id)),
      existing = targetIds.filter((id) => available.has(id));
    if (same(previousIds, currentIds))
      return [
        ...existing,
        ...incoming.filter((id) => !existing.includes(id)),
        ...[...available].filter(
          (id) => !existing.includes(id) && !incoming.includes(id),
        ),
      ];
    const common = new Set(
        previousIds.filter(
          (id) => currentIds.includes(id) && existing.includes(id),
        ),
      ),
      oldOrder = previousIds.filter((id) => common.has(id)),
      newOrder = currentIds.filter((id) => common.has(id)),
      targetOrder = existing.filter((id) => common.has(id));
    if (!same(targetOrder, oldOrder) && !same(targetOrder, newOrder))
      conflict(
        "ترتیب فهرست در نوبت دیگر متفاوت است؛ ابتدا تعارض را بررسی کنید.",
      );
    return [
      ...incoming,
      ...existing.filter((id) => !incoming.includes(id)),
      ...[...available].filter(
        (id) => !incoming.includes(id) && !existing.includes(id),
      ),
    ];
  }
  function checkCodes(entries) {
    const codes = new Map();
    for (const { student } of entries.values()) {
      const code = student.code || "";
      if (code && codes.has(code) && codes.get(code) !== student.id)
        conflict(
          "کد هنرجویان متفاوت در فهرست مشترک تکراری است؛ هویت‌ها خودکار ادغام نشدند.",
        );
      if (code) codes.set(code, student.id);
    }
  }

  // New classes inherit definitions but never another term's recorded grades.
  function skeleton(current) {
    projection(current);
    const result = copy(current);
    for (const lesson of result.lessons || []) {
      lesson.kardaneshScores = {};
      for (const pod of lesson.poudmans || []) {
        pod.podScores = {};
        for (const unit of pod.units || []) unit.unitScores = {};
      }
    }
    return result;
  }

  // Three-way delta: only explicitly edited directory fields are shared. Target
  // courses, policies and scores remain byte-for-byte as they were supplied.
  function mirrorClass(
    previous,
    current,
    target,
    { allowRemoval = false } = {},
  ) {
    if (!current) conflict("کلاس حذف‌شده باید همراه بررسی سوابق مدیریت شود.");
    projection(current);
    if (!target) return skeleton(current);
    if (
      identify(target) !== identify(current) ||
      (previous && identify(previous) !== current.id)
    )
      conflict("کلاس‌های متفاوت قابل همگام‌سازی نیستند.");
    const result = copy(target),
      source = roster(current),
      before = previous ? roster(previous) : new Map(),
      members = roster(result);
    if (!previous) {
      if (!same(projection(target), projection(current)))
        conflict("شناسهٔ کلاس تازه در نوبت دیگر با اطلاعات متفاوت وجود دارد.");
      return result;
    }
    applyField(result, previous, current, "name", "نام کلاس");
    for (const id of new Set([...before.keys(), ...source.keys()])) {
      const old = before.get(id),
        next = source.get(id),
        existing = members.get(id);
      if (!next) {
        // The transaction must verify every term has no attendance/score
        // history before opting into physical identity removal (e.g. undo).
        if (old && !allowRemoval)
          conflict(
            "برای حفظ پروندهٔ مشترک سال، هنرجو را بایگانی کنید؛ حذف کامل هویت از یک نوبت مجاز نیست.",
          );
        if (old) members.delete(id);
        continue;
      }
      if (!old) {
        if (
          existing &&
          (!same(
            comparableStudent(existing.student),
            comparableStudent(next.student),
          ) ||
            existing.status !== next.status)
        )
          conflict(
            "شناسهٔ هنرجوی تازه در نوبت دیگر به اطلاعات متفاوت تعلق دارد.",
          );
        if (!existing) members.set(id, copy(next));
        continue;
      }
      const identityChanged = !same(
          comparableStudent(old.student),
          comparableStudent(next.student),
        ),
        membershipChanged = old.status !== next.status;
      if (!identityChanged && !membershipChanged) continue;
      if (!existing) {
        members.set(id, copy(next));
        continue;
      }
      if (membershipChanged) {
        if (existing.status !== old.status && existing.status !== next.status)
          conflict("عضویت هنرجو در نوبت دیگر متفاوت است.");
        existing.status = next.status;
      }
      for (const key of new Set([
        ...Object.keys(old.student),
        ...Object.keys(next.student),
      ])) {
        if (key === "id") continue;
        if (key === "code") {
          const oldCode = old.student.code || "",
            newCode = next.student.code || "",
            targetCode = existing.student.code || "";
          if (oldCode === newCode) continue;
          if (targetCode !== oldCode && targetCode !== newCode)
            conflict("کد هنرجو در نوبت دیگر متفاوت است.");
          if (own(next.student, "code")) existing.student.code = newCode;
          else delete existing.student.code;
        } else
          applyField(
            existing.student,
            old.student,
            next.student,
            key,
            next.student.name || id,
          );
      }
    }
    checkCodes(members);
    for (const [field, status] of [
      ["students", "active"],
      ["archivedStudents", "archived"],
    ]) {
      const ids = new Set(
        [...members]
          .filter(([, entry]) => entry.status === status)
          .map(([id]) => id),
      );
      result[field] = ordered(
        previous[field] || [],
        current[field] || [],
        target[field] || [],
        ids,
      ).map((id) => copy(members.get(id).student));
    }
    return result;
  }

  function layoutIndex(layout) {
    const schools = index(layout),
      classes = new Map();
    for (const school of schools.values()) {
      if (!Array.isArray(school.classes))
        conflict("چیدمان کلاس‌های مدرسه معتبر نیست.");
      for (const id of school.classes) {
        identify({ id });
        if (classes.has(id))
          conflict("کلاس در چند مدرسه یا چند بار در چیدمان تکرار شده است.");
        classes.set(id, school.id);
      }
    }
    return { schools, classes };
  }
  function layoutHasChanges(previous, current) {
    layoutIndex(previous);
    layoutIndex(current);
    return !same(previous, current);
  }
  // Layout removals do not delete records themselves. The transaction caller
  // must first call assertClassRemovable with the companion's sessions, then
  // remove those class records and invalid schedule references atomically.
  function mirrorLayout(previous, current, target) {
    const before = layoutIndex(previous),
      next = layoutIndex(current),
      existing = layoutIndex(target),
      result = new Map(
        [...existing.schools].map(([id, school]) => [id, copy(school)]),
      );
    for (const [id, old] of before.schools) {
      if (next.schools.has(id)) continue;
      const found = result.get(id);
      if (!found) continue;
      if (
        found.name !== old.name ||
        found.classes.some((classId) => !old.classes.includes(classId))
      )
        conflict("مدرسهٔ در حال حذف در نوبت دیگر اطلاعات متفاوت دارد.");
      result.delete(id);
    }
    for (const [id, incoming] of next.schools) {
      const old = before.schools.get(id),
        found = result.get(id);
      if (!old) {
        if (found && found.name !== incoming.name)
          conflict("شناسهٔ مدرسهٔ تازه در نوبت دیگر متفاوت است.");
        if (!found) result.set(id, { ...copy(incoming), classes: [] });
      } else if (found) applyField(found, old, incoming, "name", "نام مدرسه");
      else if (!same(old, incoming))
        result.set(id, { ...copy(incoming), classes: [] });
    }
    // Detect unexpected school ownership before applying any incoming move.
    for (const id of new Set([
      ...before.classes.keys(),
      ...next.classes.keys(),
    ])) {
      const old = before.classes.get(id),
        incoming = next.classes.get(id),
        found = existing.classes.get(id);
      if (old === incoming) continue;
      if (found !== undefined && found !== old && found !== incoming)
        conflict("کلاس در نوبت دیگر به مدرسهٔ متفاوتی تعلق دارد.");
      if (old === undefined && found !== undefined && found !== incoming)
        conflict("شناسهٔ کلاس تازه در مدرسهٔ دیگری استفاده شده است.");
      for (const school of result.values())
        school.classes = school.classes.filter((value) => value !== id);
      if (incoming !== undefined) {
        if (!result.has(incoming)) conflict("مدرسهٔ مقصد کلاس وجود ندارد.");
        result.get(incoming).classes.push(id);
      }
    }
    for (const [id, school] of result) {
      const incoming = next.schools.get(id),
        old = before.schools.get(id),
        found = existing.schools.get(id);
      if (incoming)
        school.classes = ordered(
          old?.classes || [],
          incoming.classes,
          found?.classes || [],
          new Set(school.classes),
        );
    }
    const resultIds = ordered(
      previous,
      current,
      target,
      new Set(result.keys()),
    );
    const output = resultIds.map((id) => result.get(id));
    layoutIndex(output);
    return output;
  }
  function classHasHistory(classroom, sessions = []) {
    identify(classroom);
    if (sessions.some((session) => session.classId === classroom.id))
      return true;
    for (const lesson of classroom.lessons || []) {
      if (Object.keys(lesson.kardaneshScores || {}).length) return true;
      for (const pod of lesson.poudmans || []) {
        if (Object.keys(pod.podScores || {}).length) return true;
        for (const unit of pod.units || [])
          if (Object.keys(unit.unitScores || {}).length) return true;
      }
    }
    return false;
  }
  function assertClassRemovable(classroom, sessions = []) {
    if (classHasHistory(classroom, sessions))
      conflict(
        "کلاس «" +
          (classroom.name || classroom.id) +
          "» در نوبت دیگر نمره یا جلسه دارد؛ برای حفظ سوابق، حذف مشترک انجام نشد.",
      );
    return true;
  }

  // A partial old roster can be safely unioned only when every shared identity
  // and every recorded relative order agree. No name/code-based ID matching.
  function unionOrder(sequences, available) {
    const rank = new Map(),
      following = new Map(),
      indegree = new Map();
    for (const id of available) {
      rank.set(id, rank.size);
      following.set(id, new Set());
      indegree.set(id, 0);
    }
    for (const sequence of sequences) {
      const ids = sequence.filter((id) => available.has(id));
      for (let i = 1; i < ids.length; i++) {
        const a = ids[i - 1],
          b = ids[i];
        if (a === b) conflict("ترتیب فهرست قدیمی شناسهٔ تکراری دارد.");
        if (!following.get(a).has(b)) {
          following.get(a).add(b);
          indegree.set(b, indegree.get(b) + 1);
        }
      }
    }
    const queue = [...available].filter((id) => !indegree.get(id)),
      output = [];
    while (queue.length) {
      queue.sort((a, b) => rank.get(a) - rank.get(b));
      const id = queue.shift();
      output.push(id);
      for (const next of following.get(id)) {
        indegree.set(next, indegree.get(next) - 1);
        if (!indegree.get(next)) queue.push(next);
      }
    }
    if (output.length !== available.size)
      conflict(
        "ترتیب ثبت فهرست‌های قدیمی سال با هم متفاوت است؛ ترتیب هیچ نوبت خودکار بازنویسی نشد.",
      );
    return output;
  }
  function reconcileClass(copies) {
    if (!Array.isArray(copies) || !copies.length)
      conflict("کلاسی برای یکپارچه‌سازی مشخص نشده است.");
    const result = copy(copies[0]),
      id = identify(result),
      entries = new Map();
    for (const classroom of copies) {
      if (identify(classroom) !== id || classroom.name !== result.name)
        conflict(
          "نام یا شناسهٔ کلاس‌های سال متفاوت است؛ ابتدا تعارض را بررسی کنید.",
        );
      for (const [sid, incoming] of roster(classroom)) {
        const existing = entries.get(sid);
        if (
          existing &&
          (existing.status !== incoming.status ||
            !same(
              comparableStudent(existing.student),
              comparableStudent(incoming.student),
            ))
        )
          conflict(
            "مشخصات یا عضویت هنرجوی «" +
              (incoming.student.name || sid) +
              "» بین نوبت‌ها متفاوت است.",
          );
        if (!existing) entries.set(sid, copy(incoming));
      }
    }
    checkCodes(entries);
    for (const [field, status] of [
      ["students", "active"],
      ["archivedStudents", "archived"],
    ]) {
      const available = new Set(
        [...entries]
          .filter(([, entry]) => entry.status === status)
          .map(([sid]) => sid),
      );
      result[field] = unionOrder(
        copies.map((classroom) =>
          (classroom[field] || []).map((student) => student.id),
        ),
        available,
      ).map((sid) => copy(entries.get(sid).student));
    }
    return result;
  }
  function reconcileLayouts(layouts) {
    if (!Array.isArray(layouts) || !layouts.length)
      conflict("چیدمانی برای یکپارچه‌سازی مشخص نشده است.");
    const schools = new Map(),
      owners = new Map();
    for (const layout of layouts) {
      layoutIndex(layout);
      for (const school of layout) {
        const existing = schools.get(school.id);
        if (existing && existing.name !== school.name)
          conflict(
            "نام مدرسه بین نوبت‌های سال متفاوت است؛ ابتدا تعارض را بررسی کنید.",
          );
        if (!existing) schools.set(school.id, { ...copy(school), classes: [] });
        for (const classId of school.classes) {
          if (owners.has(classId) && owners.get(classId) !== school.id)
            conflict("کلاس بین نوبت‌های سال به مدرسه‌های متفاوت تعلق دارد.");
          owners.set(classId, school.id);
        }
      }
    }
    for (const [id, school] of schools) {
      const available = new Set(
        [...owners]
          .filter(([, schoolId]) => schoolId === id)
          .map(([classId]) => classId),
      );
      school.classes = unionOrder(
        layouts.map(
          (layout) => layout.find((item) => item.id === id)?.classes || [],
        ),
        available,
      );
    }
    return unionOrder(
      layouts.map((layout) => layout.map((school) => school.id)),
      new Set(schools.keys()),
    ).map((id) => schools.get(id));
  }

  function scheduleProjection(meta = {}) {
    meta ||= {};
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : object(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    return {
      masterSchedule: canonical(meta.masterSchedule || {}),
      activeDays: [...(meta.activeDays || [0, 1, 2, 3, 4, 5])].sort(
        (a, b) => a - b,
      ),
      periods: meta.periods ?? 6,
      weekStartDate: meta.settings?.weekStartDate ?? "",
    };
  }
  function scheduleHasChanges(previous, current) {
    return !same(scheduleProjection(previous), scheduleProjection(current));
  }
  function mirrorSchedule(previous, current, target, { replace = false } = {}) {
    const before = scheduleProjection(previous),
      after = scheduleProjection(current),
      existing = scheduleProjection(target),
      result = copy(target);
    for (const field of Object.keys(after)) {
      if (!replace && same(before[field], after[field])) continue;
      if (
        !replace &&
        !same(existing[field], before[field]) &&
        !same(existing[field], after[field])
      ) {
        const error = Error(
          "برنامهٔ هفتگی قدیمی در نوبت‌های سال متفاوت است؛ برنامهٔ درست را بررسی و «یکسان‌سازی برنامهٔ سال تحصیلی» را تأیید کنید.",
        );
        error.code = "ACADEMIC_SCHEDULE_CONFLICT";
        throw error;
      }
      if (field === "weekStartDate") {
        result.settings ||= {};
        result.settings.weekStartDate = after[field];
      } else result[field] = copy(after[field]);
    }
    return result;
  }

  root.EduAcademicYearDirectory = Object.freeze({
    scheduleProjection,
    scheduleHasChanges,
    mirrorSchedule,
    hasChanges,
    projection,
    mirrorClass,
    skeleton,
    layoutHasChanges,
    mirrorLayout,
    classHasHistory,
    assertClassRemovable,
    reconcileClass,
    reconcileLayouts,
  });
})(globalThis);
