(function (root) {
  "use strict";
  const clone = (x) => structuredClone(x);
  const digits = (x) =>
    String(x ?? "")
      .replace(/[۰-۹]/g, (c) => c.charCodeAt(0) - 1776)
      .replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 1632)
      .replace(/[٫،]/g, ".")
      .trim();
  function decimal(x) {
    const [a, e = "0"] = String(x).toLowerCase().split("e"),
      [w, f = ""] = a.split(".");
    let n = BigInt(w + f),
      scale = f.length - Number(e);
    return scale >= 0
      ? { n, d: 10n ** BigInt(scale) }
      : { n: n * 10n ** BigInt(-scale), d: 1n };
  }
  function atLeast(a, b) {
    const x = decimal(a),
      y = decimal(b);
    return x.n * y.d >= y.n * x.d;
  }
  function combine(a, b, weight, minimum) {
    const x = decimal(a),
      y = decimal(b),
      w = decimal(weight);
    const n = x.n * y.d * w.n + y.n * x.d * (100n * w.d - w.n),
      d = 100n * w.d * x.d * y.d;
    const t = decimal(minimum);
    return { final: finiteRatio(n, d), passed: n * t.d >= t.n * d };
  }
  function defaults(method = "dual", year = "") {
    return {
      version: 1,
      revision: 1,
      method,
      year,
      branch: method === "dual" ? "kardanesh" : "fani",
      grade: "10",
      field: "",
      code: "",
      authority: "",
      circularNumber: "",
      circularDate: "",
      reference: "",
      confirmed: false,
      practicalWeight: 70,
      theoryMin: 0,
      practicalMin: 0,
      passMin: 14,
      mostamarMax: 5,
      competencyFactor: 5,
      competencyMin: 2,
      moduleMin: 12,
      continuousStep: 0.5,
      requireGate: false,
      unitCount: 1,
    };
  }
  function validate(p) {
    if (p?.subjectType !== undefined && !["general", "vocational"].includes(p.subjectType))
      throw Error("نوع درس نامعتبر است.");
    if (p?.subjectType === "general" && p.method !== "dual")
      throw Error("درس عمومی نمره مستقیم دارد.");
    if (
      !p ||
      p.version !== 1 ||
      !Number.isInteger(p.revision) ||
      p.revision < 1 ||
      !["dual", "modular"].includes(p.method)
    )
      throw Error("نسخه یا روش ارزشیابی نامعتبر است.");
    if (
      !["kardanesh", "fani"].includes(p.branch) ||
      !["10", "11", "12"].includes(p.grade)
    )
      throw Error("شاخه یا پایه نامعتبر است.");
    if ((p.branch === "kardanesh") !== (p.method === "dual"))
      throw Error("کاردانش باید نظری و عملی و فنی‌وحرفه‌ای باید پودمانی باشد.");
    for (const k of [
      "year",
      "field",
      "code",
      "authority",
      "circularNumber",
      "circularDate",
      "reference",
    ])
      if (typeof p[k] !== "string" || p[k].length > 2000)
        throw Error("مشخصات ابلاغیه نامعتبر است: " + k);
    if (
      !/^\d{4}-\d{4}$/.test(p.year) ||
      Number(p.year.slice(5)) - Number(p.year.slice(0, 4)) !== 1
    )
      throw Error("سال تحصیلی مانند 1405-1406 باشد.");
    if (typeof p.confirmed !== "boolean" || typeof p.requireGate !== "boolean")
      throw Error("وضعیت تأیید نامعتبر است.");
    if (p.confirmed && !p.code.trim())
      throw Error("برای تأیید قواعد، کد درس / استاندارد را تکمیل کنید.");
    for (const k of [
      "practicalWeight",
      "theoryMin",
      "practicalMin",
      "passMin",
      "mostamarMax",
      "competencyFactor",
      "competencyMin",
      "moduleMin",
      "continuousStep",
    ])
      if (typeof p[k] !== "number" || !Number.isFinite(p[k]))
        throw Error("عدد قواعد نامعتبر است: " + k);
    if (
      p.practicalWeight < 0 ||
      p.practicalWeight > 100 ||
      [p.theoryMin, p.practicalMin, p.passMin, p.moduleMin].some(
        (x) => x < 0 || x > 20,
      )
    )
      throw Error("وزن باید صفر تا صد و حدنصاب صفر تا بیست باشد.");
    if (
      p.mostamarMax <= 0 ||
      p.mostamarMax > 20 ||
      p.competencyFactor <= 0 ||
      p.mostamarMax + 3 * p.competencyFactor !== 20
    )
      throw Error("حداکثر مستمر + سه برابر ضریب شایستگی باید ۲۰ باشد.");
    if (
      ![1, 2, 3].includes(p.competencyMin) ||
      p.continuousStep <= 0 ||
      p.continuousStep > p.mostamarMax ||
      !Number.isInteger(p.unitCount) ||
      p.unitCount < 1 ||
      p.unitCount > 10
    )
      throw Error("گام مستمر، حد شایستگی یا تعداد واحد نامعتبر است.");
    return true;
  }
  function parse(value, p, field, kind) {
    const text = digits(value);
    if (!text)
      return {
        ok: false,
        message: "برای حذف نمره از دکمه پاک‌کردن استفاده کنید.",
      };
    if (!/^(?:\d{1,2}(?:\.\d{1,6})?|\.\d{1,6})$/.test(text))
      return {
        ok: false,
        message: "عدد معتبر با حداکثر شش رقم اعشار وارد کنید.",
      };
    const v = Number(text);
    let max = 20;
    if (kind === "pod") max = field === "c" ? 3 : p.mostamarMax;
    if (v < 0 || v > max)
      return { ok: false, message: "بازه مجاز صفر تا " + max + " است." };
    if (kind === "pod" && field === "c" && ![1, 2, 3].includes(v))
      return { ok: false, message: "شایستگی فقط ۱، ۲ یا ۳ است." };
    if (kind === "pod" && field === "m") {
      const a = decimal(v),
        b = decimal(p.continuousStep);
      if ((a.n * b.d) % (a.d * b.n) !== 0n)
        return {
          ok: false,
          message: "نمره مستمر باید مضربی از " + p.continuousStep + " باشد.",
        };
    }
    return { ok: true, value: v };
  }
  function dual(p, practical, theory) {
    if (p.subjectType === "general")
      return {
        final: theory ?? null,
        complete: theory != null,
        passed: null,
        reason: theory == null ? "نمره ثبت نشده است." : "",
      };
    p = {
      ...p,
      practicalWeight: 70,
      theoryMin: 0,
      practicalMin: 0,
      passMin: 14,
    };
    if (practical == null || theory == null)
      return {
        final: null,
        passed: null,
        complete: false,
        reason: "هر دو نمره نظری و عملی لازم است.",
      };
    const r = combine(practical, theory, p.practicalWeight, p.passMin),
      reasons = [];
    if (!atLeast(theory, p.theoryMin))
      reasons.push("نظری کمتر از " + p.theoryMin);
    if (!atLeast(practical, p.practicalMin))
      reasons.push("عملی کمتر از " + p.practicalMin);
    if (!r.passed) reasons.push("نهایی کمتر از " + p.passMin);
    return {
      ...r,
      passed: r.passed && !reasons.length,
      complete: true,
      reason: reasons.join("؛ "),
      threshold: p.passMin,
    };
  }
  function moduleResult(p, g = {}) {
    g = Object.assign(Object.create(null), isDataObject(g) ? g : null);
    const complete = g.m != null && g.c != null;
    if (!complete)
      return {
        final: null,
        passed: null,
        complete: false,
        reason: g.m == null && g.c == null ? "نمره‌ای ثبت نشده" : g.m == null ? "مستمر ثبت نشده" : "شایستگی ثبت نشده",
      };
    const x = decimal(g.m),
      y = decimal(p.competencyFactor),
      n = x.n * y.d + BigInt(g.c) * y.n * x.d,
      d = x.d * y.d,
      t = decimal(p.moduleMin);
    const final = finiteRatio(n, d),
      reasons = [];
    if (g.c < p.competencyMin) reasons.push("حد شایستگی احراز نشده");
    if (n * t.d < t.n * d) reasons.push("نمره پودمان کمتر از " + p.moduleMin);
    return {
      final,
      passed: !reasons.length,
      complete: true,
      reason: reasons.join("؛ "),
      threshold: p.moduleMin,
    };
  }
  function lesson(p, pods, sid) {
    const modules = pods.map((pod) => ({
      id: pod.id,
      name: pod.name,
      ...moduleResult(p, ownScoreRecord(pod.podScores, sid)),
    }));
    const present = modules.filter((x) => x.final != null),
      complete = modules.length > 0 && modules.every((x) => x.complete);
    const average = present.length
      ? present.reduce((n, x) => n + x.final, 0) / present.length
      : null;
    const passed = complete ? modules.every((x) => x.passed) : null;
    return {
      modules,
      complete,
      passed,
      provisionalAverage: average,
      final: passed ? average : null,
      reason: !complete
        ? "پودمان ناقص"
        : passed
          ? ""
          : "نیازمند جبران: " +
            modules
              .filter((x) => !x.passed)
              .map((x) => x.name)
              .join("، "),
    };
  }
  function hasGrades(l) {
    return (
      Object.values(l.kardaneshScores || {}).some(
        (g) =>
          g.practical != null ||
          g.theory != null ||
          g.midtermPractical != null ||
          g.midtermTheory != null,
      ) ||
      l.poudmans.some(
        (p) =>
          Object.keys(p.podScores || {}).length ||
          p.units.some((u) => Object.keys(u.unitScores || {}).length),
      )
    );
  }
  // Descriptive corrections are separate from the historical grading policy.
  function identity(l, year) {
    const policy = l.gradingPolicy || {},
      metadata = l.courseInfo || {};
    const info = {};
    for (const key of ["year", "grade", "field", "code", "authority"])
      info[key] =
        typeof metadata[key] === "string"
          ? metadata[key]
          : typeof policy[key] === "string"
            ? policy[key]
            : "";
    info.year = year ?? info.year;
    info.grade = info.grade || "10";
    info.branch =
      (policy.method || (l.gradeMode === "kardanesh" ? "dual" : "modular")) ===
      "dual"
        ? "kardanesh"
        : "fani";
    return info;
  }
  function freshCopy(l, id, newYear, newId) {
    const next = clone(l);
    next.id = id;
    next.kardaneshScores = {};
    next.courseInfo = identity(l, newYear);
    for (const p of next.poudmans) {
      p.id = newId();
      p.podScores = {};
      for (const u of p.units) {
        u.id = newId();
        u.unitScores = {};
      }
    }
    if (next.gradingPolicy) {
      Object.assign(next.gradingPolicy, next.courseInfo);
      next.gradingPolicy.year = newYear;
      next.gradingPolicy.revision = 1;
      next.gradingPolicy.confirmed = false;
      next.gradingPolicy.circularNumber = "";
      next.gradingPolicy.circularDate = "";
      next.gradingPolicy.reference = "";
    }
    return next;
  }
  function describe(l) {
    if (l.gradingPolicy?.subjectType === "general")
      return "درس عمومی؛ هر مرحله یک نمره از صفر تا بیست";
    const p =
      l.gradingPolicy?.method === "dual"
        ? {
            ...l.gradingPolicy,
            practicalWeight: 70,
            theoryMin: 0,
            practicalMin: 0,
            passMin: 14,
          }
        : l.gradingPolicy;
    if (!p) return "قواعد قبلی — بدون مرجع ابلاغیه";
    return (
      (p.branch === "fani" ? "فنی‌وحرفه‌ای" : "کاردانش") +
      " | پایه " +
      identity(l).grade +
      " | " +
      p.year +
      " | " +
      (p.method === "dual"
        ? "نظری " +
          (100 - p.practicalWeight) +
          "٪ + عملی " +
          p.practicalWeight +
          "٪؛ حد نهایی " +
          p.passMin +
          "، نظری " +
          p.theoryMin +
          "، عملی " +
          p.practicalMin
        : "پودمانی؛ مستمر تا " +
          p.mostamarMax +
          " + شایستگی × " +
          p.competencyFactor +
          "؛ حد " +
          p.moduleMin) +
      " | " +
      (p.confirmed ? "قواعد تأییدشده توسط کاربر" : "قواعد پیش‌نویس")
    );
  }
  root.EduPolicy = {
    defaults,
    validate,
    parse,
    dual,
    moduleResult,
    lesson,
    hasGrades,
    freshCopy,
    identity,
    describe,
    clone,
  };
})(globalThis);
