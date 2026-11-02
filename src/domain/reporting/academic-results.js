(function (root) {
  "use strict";

  // Pure academic report calculations. Callers supply scoped, validated data;
  // this module never reads a workspace, storage, selection or report DOM.
  function settings(lesson) {
    return lesson.gradingPolicy?.method === "dual"
      ? root.EduPolicy.dualSettings(lesson.gradingPolicy)
      : {
          practicalWeight: 70,
          theoryMin: 0,
          practicalMin: 0,
          passMin: 14,
        };
  }

  function weights(lesson) {
    const practical = settings(lesson).practicalWeight;
    return { practical, theory: 100 - practical };
  }

  function assessment(
    lesson,
    studentId,
    stage = "final",
    { fallbackPolicy = null } = {},
  ) {
    if (!["midterm", "final"].includes(stage))
      throw Error("مرحله ارزشیابی نامعتبر است.");
    const grade = ownScoreRecord(lesson?.kardaneshScores, studentId),
      policy = lesson.gradingPolicy || fallbackPolicy,
      practical =
        policy?.subjectType === "general"
          ? null
          : (grade[stage === "midterm" ? "midtermPractical" : "practical"] ??
            null),
      theory = grade[stage === "midterm" ? "midtermTheory" : "theory"] ?? null;
    if (policy?.method === "dual" || policy?.subjectType === "general")
      return {
        practical,
        theory,
        ...root.EduPolicy.dual(policy, practical, theory),
      };

    // Historical teacher assessments have no policy explanation field and
    // always expose threshold 14, including incomplete assessments. Preserve
    // that DTO while using the same exact fixed 70/30 policy calculation.
    const { final, passed } = root.EduPolicy.dual(
      { dualConfigurable: false },
      practical,
      theory,
    );
    return {
      practical,
      theory,
      final,
      passed,
      complete: practical !== null && theory !== null,
      threshold: 14,
    };
  }

  function fraction(value) {
    const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e"),
      negative = mantissa.startsWith("-"),
      [whole, decimal = ""] = mantissa.replace("-", "").split(".");
    const n = BigInt(whole + decimal) * (negative ? -1n : 1n),
      scale = decimal.length - Number(exponent);
    return scale >= 0
      ? { n, d: 10n ** BigInt(scale) }
      : { n: n * 10n ** BigInt(-scale), d: 1n };
  }

  function annual(components, { general = false, threshold = 14 } = {}) {
    if (!Array.isArray(components) || components.length !== 4)
      throw Error("نتیجهٔ سالانه به چهار مرحلهٔ ارزشیابی نیاز دارد.");
    const complete = components.every((item) => item.complete);
    let final = null,
      passed = null;
    if (complete) {
      let total = { n: 0n, d: 1n };
      // Compute from raw inputs, not rounded/displayed stage results. Keeping
      // the rational sum preserves imported tiny values and exact thresholds.
      for (const item of components) {
        const p = fraction(general ? 0 : item.practical),
          t = fraction(item.theory),
          weight = fraction(item.practicalWeight),
          n = general
            ? t.n
            : weight.n * p.n * t.d + (100n * weight.d - weight.n) * t.n * p.d,
          d = general ? t.d : 100n * weight.d * p.d * t.d;
        total = reduceGradeFraction(total.n * d + n * total.d, total.d * d);
      }
      final = finiteRatio(total.n, total.d * 4n);
      const minimum = fraction(threshold);
      passed = general ? null : total.n * minimum.d >= minimum.n * total.d * 4n;
    }
    return { complete, final, passed, threshold: general ? null : threshold };
  }

  function modular(lesson, studentId) {
    return root.EduPolicy.lesson(
      lesson.gradingPolicy,
      lesson.poudmans,
      studentId,
    );
  }

  root.EduReportGrades = Object.freeze({
    settings,
    weights,
    assessment,
    annual,
    modular,
  });
})(globalThis);
