"use strict";

function matrix() {
  const base = defaultDB();
  const year = base.settings.academicYear;
  const policy = (method) => ({
    ...EduPolicy.defaults(method, year),
    code: method === "dual" ? "C01" : "F01",
    confirmed: true,
  });
  base.schools = [
    {
      id: "school_a",
      name: "مدرسه آزمایشی",
      classes: [
        {
          id: "class_a",
          name: "کلاس آزمایشی",
          students: [
            { id: "student_a", name: "هنرجوی اول", code: "001" },
            { id: "student_b", name: "هنرجوی دوم", code: "002" },
          ],
          archivedStudents: [
            { id: "student_z", name: "هنرجوی بایگانی", code: "003" },
          ],
          lessons: [
            {
              id: "lesson_dual",
              name: "درس نظری و عملی",
              gradeMode: "kardanesh",
              gradingPolicy: policy("dual"),
              poudmans: [],
              kardaneshScores: { student_a: { practical: 18, theory: 12 } },
            },
            {
              id: "lesson_modular",
              name: "درس پودمانی",
              gradeMode: "standard",
              gradingPolicy: policy("modular"),
              kardaneshScores: {},
              poudmans: [
                {
                  id: "pod_a",
                  name: "پودمان اول",
                  podScores: { student_a: { m: 2, c: 2 } },
                  units: [{ id: "unit_a", name: "واحد اول", unitScores: {} }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "school_b",
      name: "مدرسه دوم",
      classes: [
        {
          id: "class_b",
          name: "کلاس دوم",
          students: [
            { id: "student_other", name: "هنرجوی کلاس دیگر", code: "010" },
          ],
          archivedStudents: [],
          lessons: [
            {
              id: "lesson_other",
              name: "درس دیگر",
              gradeMode: "kardanesh",
              gradingPolicy: policy("dual"),
              poudmans: [],
              kardaneshScores: {},
            },
          ],
        },
      ],
    },
  ];
  base.sessions = [
    {
      id: "session_a",
      schoolId: "school_a",
      classId: "class_a",
      lessonId: "lesson_dual",
      date: "2026-10-24",
      period: 0,
      poudmanId: null,
      unitId: null,
      roster: [
        { id: "student_a", name: "نام تاریخی اول", code: "001" },
        { id: "student_b", name: "نام تاریخی دوم", code: "002" },
      ],
      attendance: { student_a: "present" },
      scores: [
        {
          studentId: "student_a",
          type: "activity",
          value: 1,
          note: "فعالیت آزمایشی",
        },
      ],
    },
  ];
  base.masterSchedule = {
    "0-0-all": {
      schoolId: "school_a",
      classId: "class_a",
      lessonId: "lesson_dual",
    },
  };
  const results = [];
  const cls = (d) => d.schools[0].classes[0];
  const dual = (d) => cls(d).lessons[0];
  const modular = (d) => cls(d).lessons[1];
  const check = (id, name, expected, change, verify, options = {}) => {
    const data = structuredClone(base);
    let accepted = false,
      error = "",
      verified = true;
    try {
      change(data);
      const normalized = EduV24.normalizeDB(data, options);
      accepted = true;
      if (verify) verified = !!verify(normalized);
    } catch (e) {
      error = e.message;
      if (accepted) verified = false;
    }
    results.push({
      id,
      name,
      expected,
      observed: accepted ? "accept" : "reject",
      pass: accepted === (expected === "accept") && verified,
      ...(error ? { error } : {}),
    });
  };
  check("D01", "valid current database", "accept", () => {});
  for (const [i, value] of [
    "__proto__",
    "constructor",
    "prototype",
    "toString",
  ].entries())
    check("D0" + (i + 2), "reserved student id: " + value, "reject", (d) =>
      cls(d).students.push({ id: value, name: "شناسه نامعتبر" }),
    );
  check("D06", "empty student id", "reject", (d) =>
    cls(d).students.push({ id: "", name: "نام" }),
  );
  check("D07", "overlong student id", "reject", (d) =>
    cls(d).students.push({ id: "a".repeat(121), name: "نام" }),
  );
  check("D08", "unsafe identifier punctuation", "reject", (d) =>
    cls(d).students.push({ id: "x'y", name: "نام" }),
  );
  check("D09", "duplicate active/archive id", "reject", (d) =>
    cls(d).archivedStudents.push(structuredClone(cls(d).students[0])),
  );
  check("D10", "same identity in separate class memberships", "accept", (d) =>
    d.schools[1].classes[0].students.push(structuredClone(cls(d).students[0])),
  );
  check(
    "D11",
    "duplicate lesson identifier",
    "reject",
    (d) => (cls(d).lessons[1].id = "lesson_dual"),
  );
  check(
    "D12",
    "homonyms are independent people",
    "accept",
    (d) => (cls(d).students[1].name = cls(d).students[0].name),
  );
  check("D13", "optional empty student code", "accept", (d) => {
    delete cls(d).students[0].code;
  });
  check(
    "D14",
    "active duplicate code",
    "reject",
    (d) => (cls(d).students[1].code = "001"),
  );
  check(
    "D15",
    "active/archive duplicate code",
    "reject",
    (d) => (cls(d).archivedStudents[0].code = "001"),
  );
  check(
    "D16",
    "Persian/ASCII duplicate codes",
    "reject",
    (d) => (cls(d).students[1].code = "۰۰۱"),
  );
  check(
    "D17",
    "same code in separate classes",
    "accept",
    (d) => (d.schools[1].classes[0].students[0].code = "001"),
  );
  check(
    "D18",
    "dual grade for nonexistent student",
    "reject",
    (d) => (dual(d).kardaneshScores.missing = { practical: 18, theory: 12 }),
  );
  check(
    "D19",
    "dual grade for other-class student",
    "reject",
    (d) =>
      (dual(d).kardaneshScores.student_other = { practical: 18, theory: 12 }),
  );
  check(
    "D20",
    "archived student grade remains valid",
    "accept",
    (d) => (dual(d).kardaneshScores.student_z = { practical: 18, theory: 12 }),
  );
  check(
    "D21",
    "dual grade greater than twenty",
    "reject",
    (d) => (dual(d).kardaneshScores.student_a.practical = 21),
  );
  check(
    "D22",
    "negative dual grade",
    "reject",
    (d) => (dual(d).kardaneshScores.student_a.theory = -1),
  );
  check(
    "D23",
    "string grade",
    "reject",
    (d) => (dual(d).kardaneshScores.student_a.practical = "18"),
  );
  check(
    "D24",
    "forged cached final is recomputed",
    "accept",
    (d) => {
      dual(d).kardaneshScores.student_a.final = 20;
    },
    (d) => dual(d).kardaneshScores.student_a.final === 16.2,
  );
  check(
    "D25",
    "pod grade for other-class student",
    "reject",
    (d) => (modular(d).poudmans[0].podScores.student_other = { m: 2, c: 2 }),
  );
  check(
    "D26",
    "fractional competency",
    "reject",
    (d) => (modular(d).poudmans[0].podScores.student_a.c = 2.5),
  );
  check(
    "D27",
    "invalid continuous step",
    "reject",
    (d) => (modular(d).poudmans[0].podScores.student_a.m = 1.3),
  );
  check(
    "D28",
    "unit grade for other-class student",
    "reject",
    (d) =>
      (modular(d).poudmans[0].units[0].unitScores.student_other = { m: 10 }),
  );
  check(
    "D29",
    "session school ownership",
    "reject",
    (d) => (d.sessions[0].schoolId = "school_b"),
  );
  check(
    "D30",
    "session lesson ownership",
    "reject",
    (d) => (d.sessions[0].lessonId = "lesson_other"),
  );
  check(
    "D31",
    "attendance outside historical roster",
    "reject",
    (d) => (d.sessions[0].attendance.student_z = "present"),
  );
  check("D32", "score outside historical roster", "reject", (d) =>
    d.sessions[0].scores.push({
      studentId: "student_z",
      type: "activity",
      value: 1,
    }),
  );
  check("D33", "historical roster unknown identity", "reject", (d) =>
    d.sessions[0].roster.push({ id: "missing", name: "نام" }),
  );
  check("D34", "duplicate historical roster member", "reject", (d) =>
    d.sessions[0].roster.push(structuredClone(d.sessions[0].roster[0])),
  );
  check(
    "D35",
    "invalid attendance status",
    "reject",
    (d) => (d.sessions[0].attendance.student_a = "unknown-value"),
  );
  check(
    "D36",
    "invalid calendar date",
    "reject",
    (d) => (d.sessions[0].date = "2026-02-30"),
  );
  check("D37", "duplicate class/date/period slot", "reject", (d) =>
    d.sessions.push({
      ...structuredClone(d.sessions[0]),
      id: "session_duplicate",
    }),
  );
  check("D38", "unit belongs to another lesson", "reject", (d) => {
    d.sessions[0].poudmanId = "pod_a";
    d.sessions[0].unitId = "unit_a";
  });
  check("D39", "valid modular session ownership", "accept", (d) => {
    d.sessions[0].lessonId = "lesson_modular";
    d.sessions[0].poudmanId = "pod_a";
    d.sessions[0].unitId = "unit_a";
  });
  check(
    "D40",
    "historical name remains unchanged",
    "accept",
    (d) => (cls(d).students[0].name = "نام جاری اصلاح شده"),
    (d) => d.sessions[0].roster[0].name === "نام تاریخی اول",
  );
  check(
    "D41",
    "timetable lesson belongs to class",
    "reject",
    (d) => (d.masterSchedule["0-0-all"].lessonId = "lesson_other"),
  );
  check(
    "D42",
    "policy year belongs to period",
    "reject",
    (d) =>
      (dual(d).gradingPolicy.year =
        year === "1406-1407" ? "1407-1408" : "1406-1407"),
  );
  check(
    "D43",
    "branch and grade method agree",
    "reject",
    (d) => (dual(d).gradingPolicy.branch = "fani"),
  );
  check(
    "D44",
    "unknown future database version",
    "reject",
    (d) => (d.schemaVersion = 999),
  );
  check("D45", "reserved key in JSON document", "reject", (d) => {
    d.extra = JSON.parse('{"__proto__":{"polluted":true}}');
  });
  check(
    "D46",
    "legacy orphan identity is recovered explicitly",
    "accept",
    (d) => {
      d.schemaVersion = 23;
      d.sessions[0].attendance.legacy_missing = "absent";
    },
    (d) =>
      cls(d).archivedStudents.some(
        (st) => st.id === "legacy_missing" && st.recovered,
      ) &&
      d.sessions[0].roster.some((st) => st.id === "legacy_missing") &&
      d.migrationWarnings.length > 0,
    { legacy: true },
  );
  check(
    "D47",
    "Arabic digits preserve leading zero code",
    "accept",
    (d) => (cls(d).students[0].code = "٠٠١"),
    (d) => cls(d).students[0].code === "001",
  );
  window.auditFixture = base;
  return results;
}

module.exports = matrix;
