function legacy_prepareDB(input) {
  const d = JSON.parse(JSON.stringify(input));
  validateDB(d);
  const result = Object.assign(defaultDB(), d);
  const warnings = Array.isArray(result.migrationWarnings)
    ? [...result.migrationWarnings]
    : [];
  result.settings = Object.assign(defaultDB().settings, d.settings || {});
  result.schemaVersion = 23;
  migrateToMaster(result);
  migrateUnitScores(result);
  result.schools.forEach((s) =>
    s.classes.forEach((c) => {
      c.archivedStudents = c.archivedStudents || [];
      c.lessons = c.lessons || [];
      c.lessons.forEach((l) => {
        l.gradeMode = l.gradeMode || "standard";
        if (
          l.gradingPolicy &&
          ["dual", "modular"].includes(l.gradingPolicy.method)
        ) {
          const expected =
            l.gradingPolicy.method === "dual" ? "kardanesh" : "fani";
          if (l.gradingPolicy.branch !== expected) {
            l.gradingPolicy.branch = expected;
            if (l.courseInfo) l.courseInfo.branch = expected;
            warnings.push(
              "شاخه درس «" +
                l.name +
                "» با روش ثبت‌شده آن هماهنگ شد؛ قواعد را بررسی کنید.",
            );
          }
        }
        l.kardaneshScores = l.kardaneshScores || {};
        l.weightMostamar = l.weightMostamar ?? 40;
        l.weightPayani = l.weightPayani ?? 60;
        for (const g of Object.values(l.kardaneshScores)) {
          g.final =
            g.practical != null && g.theory != null
              ? (g.practical * 7 + g.theory * 3) / 10
              : null;
          g.passed = g.final === null ? null : g.final >= 14;
        }
      });
    }),
  );
  if (warnings.length) result.migrationWarnings = [...new Set(warnings)];
  return result;
}

function legacy_validateDB(d) {
  const fail = (m) => {
      throw Error("ساختار نامعتبر: " + m);
    },
    obj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  const arr = (x, m) => {
      if (!Array.isArray(x)) fail(m);
    },
    id = (x) => {
      if (!isSafeRecordId(x)) fail("شناسه");
    },
    text = (x) => {
      if (typeof x !== "string" || x.length > 10000) fail("متن");
    };
  const score = (x) => {
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 20)
      fail("نمره صفر تا بیست");
  };
  const date = (x) => {
    if (
      typeof x !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
      !Number.isFinite(Date.parse(x + "T00:00:00Z")) ||
      new Date(x + "T00:00:00Z").toISOString().slice(0, 10) !== x
    )
      fail("تاریخ");
  };
  if (!obj(d)) fail("بانک");
  assertSafeDataTree(d);
  arr(d.schools, "مدارس");
  arr(d.sessions, "جلسات");
  const classes = new Map(),
    lessons = new Map(),
    unique = new Set();
  const uid = (x) => {
    id(x);
    if (unique.has(x)) fail("شناسه تکراری");
    unique.add(x);
  };
  d.schools.forEach((s) => {
    uid(s.id);
    text(s.name);
    arr(s.classes, "کلاس‌ها");
    s.classes.forEach((c) => {
      uid(c.id);
      text(c.name);
      arr(c.students, "دانش‌آموزان");
      arr(c.archivedStudents || [], "بایگانی");
      arr(c.lessons || [], "دروس");
      classes.set(c.id, { schoolId: s.id, c });
      const studentIds = new Set();
      [...c.students, ...(c.archivedStudents || [])].forEach((st) => {
        id(st.id);
        text(st.name);
        if (studentIds.has(st.id)) fail("دانش‌آموز تکراری");
        studentIds.add(st.id);
      });
      (c.lessons || []).forEach((l) => {
        uid(l.id);
        text(l.name);
        if (l.teacher !== undefined) text(l.teacher);
        if (l.gradeMode && !["standard", "kardanesh"].includes(l.gradeMode))
          fail("نوع درس");
        for (const k of ["weightMostamar", "weightPayani"])
          if (
            l[k] !== undefined &&
            (!Number.isFinite(l[k]) || l[k] < 0 || l[k] > 100)
          )
            fail("وزن");
        if (
          (l.gradeMode || "standard") === "standard" &&
          (l.weightMostamar ?? 40) + (l.weightPayani ?? 60) !== 100
        )
          fail("مجموع وزن‌ها صد نیست");
        arr(l.poudmans, "پودمان");
        const units = new Map(),
          pids = new Set();
        l.poudmans.forEach((p) => {
          uid(p.id);
          pids.add(p.id);
          text(p.name);
          arr(p.units, "واحد");
          p.units.forEach((u) => {
            uid(u.id);
            units.set(u.id, p.id);
            text(u.name);
            if (u.applyOptions !== undefined) {
              if (
                !obj(u.applyOptions) ||
                Object.values(u.applyOptions).some(
                  (v) => typeof v !== "boolean",
                )
              )
                fail("گزینه امتیاز");
            }
            if (u.unitScores !== undefined) {
              if (!obj(u.unitScores)) fail("نمرات واحد");
              for (const [sid, g] of Object.entries(u.unitScores)) {
                id(sid);
                if (!obj(g)) fail("نمره واحد");
                for (const k of ["m", "p"]) if (g[k] != null) score(g[k]);
              }
            }
          });
        });
        if (l.kardaneshScores !== undefined) {
          if (!obj(l.kardaneshScores)) fail("کاردانش");
          for (const [sid, g] of Object.entries(l.kardaneshScores)) {
            id(sid);
            if (!obj(g)) fail("نمره کاردانش");
            for (const k of [
              "practical",
              "theory",
              "midtermPractical",
              "midtermTheory",
            ])
              if (g[k] != null) score(g[k]);
          }
        }
        lessons.set(l.id, { classId: c.id, units, pids });
      });
    });
  });
  const slots = new Set();
  d.sessions.forEach((x) => {
    uid(x.id);
    const c = classes.get(x.classId),
      l = lessons.get(x.lessonId);
    if (!c || c.schoolId !== x.schoolId || !l || l.classId !== x.classId)
      fail("ارتباط جلسه");
    date(x.date);
    if (!Number.isInteger(x.period) || x.period < 0 || x.period > 11)
      fail("زنگ");
    const slot = x.classId + "|" + x.date + "|" + x.period;
    if (slots.has(slot)) fail("جلسه تکراری");
    slots.add(slot);
    if (x.poudmanId && !l.pids.has(x.poudmanId)) fail("پودمان جلسه");
    if (x.unitId && l.units.get(x.unitId) !== x.poudmanId) fail("واحد جلسه");
    if (!obj(x.attendance)) fail("حضور");
    for (const [sid, status] of Object.entries(x.attendance)) {
      id(sid);
      if (
        typeof status !== "string" ||
        !/^(present|absent|leave|late(?::\d{1,3})?)$/.test(status)
      )
        fail("وضعیت حضور");
    }
    arr(x.scores, "امتیازات");
    x.scores.forEach((sc) => {
      id(sc.studentId);
      if (
        !Object.hasOwn(TYPE_LABELS, sc.type) ||
        !Number.isFinite(sc.value) ||
        sc.value < 0
      )
        fail("امتیاز");
      if (["mostamar", "payani", "classGrade"].includes(sc.type))
        score(sc.value);
      if (sc.note !== undefined) text(sc.note);
    });
    if (x.roster !== undefined) {
      arr(x.roster, "فهرست جلسه");
      const rosterIds = new Set();
      x.roster.forEach((st) => {
        id(st.id);
        text(st.name);
        if (rosterIds.has(st.id)) fail("فهرست تکراری");
        rosterIds.add(st.id);
      });
    }
  });
  if (d.settings !== undefined) {
    if (!obj(d.settings)) fail("تنظیمات");
    if (d.settings.password !== undefined) text(d.settings.password);
    if (d.settings.weekStartDate) date(d.settings.weekStartDate);
  }
  if (
    d.periods !== undefined &&
    (!Number.isInteger(d.periods) || d.periods < 1 || d.periods > 12)
  )
    fail("تعداد زنگ");
  if (d.activeDays !== undefined) {
    arr(d.activeDays, "روزها");
    if (
      new Set(d.activeDays).size !== d.activeDays.length ||
      d.activeDays.some((x) => !Number.isInteger(x) || x < 0 || x > 6)
    )
      fail("روز");
  }
  if (d.masterSchedule !== undefined) {
    if (!obj(d.masterSchedule)) fail("برنامه");
    for (const [key, e] of Object.entries(d.masterSchedule)) {
      if (!/^[0-6]-(?:[0-9]|1[01])-(all|odd|even)$/.test(key) || !obj(e))
        fail("خانه برنامه");
      const c = classes.get(e.classId),
        l = lessons.get(e.lessonId);
      if (!c || c.schoolId !== e.schoolId || !l || l.classId !== e.classId)
        fail("ارتباط برنامه");
    }
  }
}
