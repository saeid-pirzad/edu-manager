"use strict";

async function assessmentChecks() {
  const cases = [],
    check = (id, name, pass, extra = {}) =>
      cases.push({ id, name, pass: !!pass, ...extra });
  const fixture = structuredClone(window.auditFixture);
  const lesson = fixture.schools[0].classes[0].lessons[0];
  lesson.kardaneshScores.student_a = {
    practical: 20,
    theory: 0,
    midtermPractical: 10,
    midtermTheory: 20,
  };
  let normalized = EduV24.normalizeDB(fixture);
  check(
    "G01",
    "normalization preserves independent midterm and final components",
    normalized.schools[0].classes[0].lessons[0].kardaneshScores.student_a
      .midtermPractical === 10 &&
      normalized.schools[0].classes[0].lessons[0].kardaneshScores.student_a
        .practical === 20,
  );
  for (const [id, value] of [
    ["G02", -1],
    ["G03", 21],
    ["G04", "18"],
    ["G05", {}],
  ]) {
    const corrupt = structuredClone(fixture);
    corrupt.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermTheory =
      value;
    let rejected = false;
    try {
      EduV24.normalizeDB(corrupt);
    } catch {
      rejected = true;
    }
    check(
      id,
      "invalid midterm component rejected " + JSON.stringify(value),
      rejected,
    );
  }
  const a = EduV24.assessmentResult(lesson, "student_a", "midterm"),
    b = EduV24.assessmentResult(lesson, "student_a", "final");
  check(
    "G06",
    "each assessment uses 70/30 independently",
    a.final === 13 && b.final === 14 && b.passed === true,
  );
  const second = structuredClone(fixture);
  second.schools[0].classes[0].lessons[0].kardaneshScores.student_a = {
    practical: 20,
    theory: 20,
    midtermPractical: 18,
    midtermTheory: 12,
  };
  const parts = [
    { period: { term: "اول" }, data: fixture },
    { period: { term: "دوم" }, data: second },
  ];
  const rows = EduV24.annualGradeRows(
      parts,
      "school_a",
      "class_a",
      "student_a",
    ),
    grade = rows[0];
  check(
    "G07",
    "annual grade is equal mean of all four assessments",
    rows.length === 1 &&
      grade.components.length === 4 &&
      grade.final === 15.8 &&
      grade.complete,
    { final: grade.final },
  );
  delete second.schools[0].classes[0].lessons[0].kardaneshScores.student_a
    .midtermTheory;
  const incomplete = EduV24.annualGradeRows(
    parts,
    "school_a",
    "class_a",
    "student_a",
  )[0];
  check(
    "G08",
    "missing component prevents annual average and is not counted as zero",
    !incomplete.complete &&
      incomplete.final === null &&
      incomplete.passed === null,
  );
  check(
    "G09",
    "annual grade request cannot include another student",
    EduV24.annualGradeRows(parts, "school_a", "class_a", "student_a").every(
      (row) => row.studentId === "student_a",
    ),
  );
  const legacy = EduV24.assessmentResult(
    { kardaneshScores: { student_a: { practical: 18, theory: 12 } } },
    "student_a",
    "midterm",
  );
  check(
    "G10",
    "legacy final scores never become fabricated midterm scores",
    legacy.final === null && legacy.practical === null,
  );
  const custom = {
    ...EduPolicy.defaults("dual", "1405-1406"),
    practicalWeight: 90,
    passMin: 10,
    theoryMin: 19,
  };
  check(
    "G11",
    "dual calculation follows confirmed 70/30 business rule",
    EduPolicy.dual(custom, 20, 0).final === 14 &&
      EduPolicy.dual(custom, 20, 0).passed,
  );
  return cases;
}

module.exports = assessmentChecks;
