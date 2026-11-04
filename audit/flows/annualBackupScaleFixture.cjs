"use strict";

// Browser-only synthetic data. No user profile or application source is read.
module.exports = function buildAnnualBackupScale() {
  const year = "1405-1406",
    stamp = "2026-09-23T08:00:00.000Z",
    ids = ["scale-first", "scale-second"],
    clone = structuredClone,
    collect = EduWorkspaceRecords.create({ clone }).collectRecords,
    addDays = (date, days) => {
      const value = new Date(date + "T00:00:00Z");
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    },
    saturday = (date) => {
      const weekday = new Date(date + "T00:00:00Z").getUTCDay();
      return addDays(date, (6 - weekday + 7) % 7);
    },
    start = saturday(EduAcademicYear.range(year).start),
    termStarts = [start, saturday(addDays(start, 126))],
    firstTerm = "\u0627\u0648\u0644",
    secondTerm = "\u062f\u0648\u0645",
    terms = [firstTerm, secondTerm],
    schools = [],
    slots = [],
    schedule = {};
  for (let schoolIndex = 0; schoolIndex < 2; schoolIndex++) {
    const school = {
      id: "scale-school-" + schoolIndex,
      name:
        "\u0645\u062f\u0631\u0633\u0647 \u0622\u0632\u0645\u0648\u0646 " +
        (schoolIndex + 1),
      classes: [],
    };
    for (let classIndex = 0; classIndex < 2; classIndex++) {
      const classId = "scale-class-" + schoolIndex + "-" + classIndex,
        students = Array.from({ length: 25 }, (_, index) => ({
          id: classId + "-student-" + index,
          name:
            "\u0647\u0646\u0631\u062c\u0648 " + (index + 1) + " / " + classId,
          code: String(index + 1),
        })),
        classroom = {
          id: classId,
          name:
            (classIndex === 0
              ? "\u06a9\u0627\u0631\u062f\u0627\u0646\u0634 "
              : "\u0641\u0646\u06cc ") +
            (schoolIndex + 1),
          students: students.slice(0, 24),
          archivedStudents: students.slice(24),
          lessons: [],
        };
      for (let lessonIndex = 0; lessonIndex < 2; lessonIndex++) {
        const lessonId = classId + "-lesson-" + lessonIndex,
          method = classIndex === 0 ? "dual" : "modular",
          lesson = {
            id: lessonId,
            name:
              "\u062f\u0631\u0633 " +
              (lessonIndex + 1) +
              " / " +
              classroom.name,
            teacher: "\u062f\u0628\u06cc\u0631 \u0622\u0632\u0645\u0648\u0646",
            gradeMode: method === "dual" ? "kardanesh" : "standard",
            gradingPolicy: {
              ...EduPolicy.defaults(method, year),
              confirmed: true,
              code:
                "SCALE-" + schoolIndex + "-" + classIndex + "-" + lessonIndex,
              grade: schoolIndex === 0 ? "11" : "12",
              field:
                method === "dual"
                  ? "Synthetic vocational"
                  : "Synthetic technical",
              unitCount: 2,
            },
            kardaneshScores: {},
            poudmans: [],
          };
        if (method === "modular")
          for (let moduleIndex = 0; moduleIndex < 5; moduleIndex++) {
            const podId = lessonId + "-pod-" + moduleIndex,
              pod = {
                id: podId,
                name:
                  "\u067e\u0648\u062f\u0645\u0627\u0646 " + (moduleIndex + 1),
                podScores: {},
                units: [],
              };
            for (const [index, student] of students.entries())
              pod.podScores[student.id] = {
                m: index % 7 === 0 ? null : ((index + moduleIndex) % 11) / 2,
                c: index % 9 === 0 ? null : 1 + ((index + moduleIndex) % 3),
              };
            for (let unitIndex = 0; unitIndex < 2; unitIndex++) {
              const unit = {
                id: podId + "-unit-" + unitIndex,
                name:
                  "\u0648\u0627\u062d\u062f \u06a9\u0627\u0631 " +
                  (unitIndex + 1),
                applyOptions: {
                  pos: true,
                  neg: true,
                  hw: true,
                  present: true,
                  late: true,
                },
                unitScores: {},
              };
              for (const [index, student] of students.entries())
                unit.unitScores[student.id] = {
                  m:
                    index % 7 === 0
                      ? null
                      : (index + moduleIndex + unitIndex) % 21,
                  p:
                    index % 9 === 0
                      ? null
                      : (20 - index + moduleIndex + unitIndex + 21) % 21,
                };
              pod.units.push(unit);
            }
            lesson.poudmans.push(pod);
          }
        classroom.lessons.push(lesson);
        for (let meeting = 0; meeting < 2; meeting++) {
          const slot = slots.length,
            day = Math.floor(slot / 6),
            period = slot % 6,
            entry = { schoolId: school.id, classId, lessonId };
          schedule[day + "-" + period + "-all"] = clone(entry);
          slots.push({ ...entry, day, period, meeting });
        }
      }
      school.classes.push(classroom);
    }
    schools.push(school);
  }
  const output = {
    format: "EduManager.FullBackup",
    version: 2,
    schemaVersion: 26,
    exportedAt: stamp,
    activeWorkspace: ids[1],
    snapshotNotes: [],
    stores: {
      catalog: [],
      records: [],
      events: [],
      backups: [],
      undo: [],
      reports: [],
    },
    reportDrafts: {},
    gradeDrafts: [],
    deputyExportIdentity: {
      version: 1,
      token: "scale-original-identity",
      sender: {
        code: "SCALE-TEACHER",
        name: "\u062f\u0628\u06cc\u0631 \u0622\u0632\u0645\u0648\u0646",
      },
      schools: schools.map((school, index) => ({
        year,
        id: school.id,
        code: "SCALE-SCHOOL-" + index,
      })),
    },
  };
  const values = [];
  for (let termIndex = 0; termIndex < 2; termIndex++) {
    const value = {
      schemaVersion: 26,
      settings: {
        academicYear: year,
        academicTerm: terms[termIndex],
        password: "",
        weekStartDate: start,
      },
      periods: 6,
      activeDays: [0, 1, 2, 3, 4],
      masterSchedule: clone(schedule),
      schools: clone(schools),
      sessions: [],
    };
    for (const school of value.schools)
      for (const classroom of school.classes)
        for (const [lessonIndex, lesson] of classroom.lessons.entries())
          if (lesson.gradeMode === "kardanesh")
            for (const [index, student] of [
              ...classroom.students,
              ...classroom.archivedStudents,
            ].entries())
              lesson.kardaneshScores[student.id] = {
                midtermPractical:
                  index === 1
                    ? null
                    : (index + termIndex * 3 + lessonIndex) % 21,
                midtermTheory:
                  index === 2 ? null : (20 - index + termIndex * 2 + 21) % 21,
                practical:
                  index === 3
                    ? null
                    : (18 + index + termIndex + lessonIndex) % 21,
                theory: index === 4 ? null : (14 + index + termIndex * 2) % 21,
              };
    for (let week = 0; week < 16; week++)
      for (const [slotIndex, slot] of slots.entries()) {
        const school = value.schools.find((item) => item.id === slot.schoolId),
          classroom = school.classes.find((item) => item.id === slot.classId),
          lesson = classroom.lessons.find((item) => item.id === slot.lessonId),
          known = [...classroom.students, ...classroom.archivedStudents],
          roster = known.map((student, index) => ({
            ...clone(student),
            name:
              student.name +
              (index === 24
                ? " (\u0633\u0627\u0628\u0642\u0647 \u062a\u0627\u0631\u06cc\u062e\u06cc)"
                : ""),
          })),
          attendance = {},
          pod = lesson.poudmans[week % 5],
          unit = pod?.units[slot.meeting],
          types = [
            "mostamar",
            "payani",
            "positive",
            "negative",
            "classGrade",
            "activity",
            "homework",
          ],
          scoreValues = [0, 20, 1, 1, 0, 2, 0];
        for (const [index, student] of roster.entries()) {
          const status = ["present", "absent", "leave", "late:7", null][
            (index + week) % 5
          ];
          if (status !== null) attendance[student.id] = status;
        }
        value.sessions.push({
          id: ids[termIndex] + "-session-" + week + "-" + slotIndex,
          schoolId: school.id,
          classId: classroom.id,
          lessonId: lesson.id,
          date: addDays(termStarts[termIndex], week * 7 + slot.day),
          period: slot.period,
          poudmanId: pod?.id || null,
          unitId: unit?.id || null,
          roster,
          attendance,
          scores: types.map((type, index) => ({
            studentId: roster[index].id,
            type,
            value: scoreValues[index],
            note:
              "\u06cc\u0627\u062f\u062f\u0627\u0634\u062a \u062c\u0644\u0633\u0647 / " +
              type +
              " / " +
              week +
              " / " +
              terms[termIndex],
          })),
        });
      }
    const normalized = EduV24.normalizeDB(value),
      periodId = ids[termIndex],
      noteKey = [
        periodId,
        "daily",
        termStarts[termIndex],
        schools[0].id,
        schools[0].classes[0].id,
        "management",
        "",
      ].join("|"),
      notes = {
        [noteKey]:
          "\u06cc\u0627\u062f\u062f\u0627\u0634\u062a \u06af\u0632\u0627\u0631\u0634 " +
          terms[termIndex],
      };
    values.push(normalized);
    output.stores.catalog.push({
      id: periodId,
      year,
      term: terms[termIndex],
      termKind: termIndex === 0 ? "first" : "second",
      revision: 3 + termIndex,
      closed: termIndex === 0,
      createdAt: stamp,
      updatedAt: stamp,
      reportNotesRecovery: clone(notes),
    });
    output.reportDrafts[periodId] = clone(notes);
    for (const [logical, item] of collect(normalized))
      output.stores.records.push({
        key: periodId + "|" + logical,
        workspace: periodId,
        logical,
        value: item,
      });
    output.stores.events.push({
      id: termIndex + 1,
      workspace: periodId,
      revision: 3 + termIndex,
      at: stamp,
      action: "Synthetic exact historical event " + termIndex,
      changes: [
        { path: "synthetic.note", before: null, after: terms[termIndex] },
      ],
    });
    output.stores.backups.push({
      id: "scale-local-" + termIndex,
      workspace: periodId,
      at: stamp,
      label: "Synthetic ordinary internal backup " + termIndex,
      db: clone(normalized),
    });
  }
  const classroom = values[1].schools[0].classes[0],
    lesson = classroom.lessons[0],
    draftEntry = {
      kind: "k",
      classId: classroom.id,
      lid: lesson.id,
      sid: classroom.students[0].id,
      field: "practical",
      baseRevision: 4,
    };
  for (const [owner, raw] of [
    ["external-alpha", "9".repeat(101)],
    ["external-beta", "99"],
  ])
    output.gradeDrafts.push({
      key: "Edu24.drafts." + ids[1] + "." + owner,
      workspace: ids[1],
      generation: 2,
      updatedAt: stamp,
      entries: [
        {
          ...draftEntry,
          value: raw,
          review: true,
          error: "Synthetic pending input",
        },
      ],
    });
  const modularClass = values[0].schools[0].classes[1],
    modularLesson = modularClass.lessons[0],
    pod = modularLesson.poudmans[0];
  output.gradeDrafts.push({
    key: "Edu24.drafts." + ids[0] + ".external-unit",
    workspace: ids[0],
    generation: 2,
    updatedAt: stamp,
    entries: [
      {
        kind: "u",
        classId: modularClass.id,
        lid: modularLesson.id,
        pid: pod.id,
        uid: pod.units[0].id,
        sid: modularClass.students[1].id,
        field: "m",
        value: "0",
        baseRevision: 3,
        review: true,
        error: "Synthetic pending closed-term input",
      },
    ],
  });
  const frozenClass = values[0].schools[0].classes[0],
    frozenLesson = frozenClass.lessons[0],
    student = frozenClass.students[0],
    raw = frozenLesson.kardaneshScores[student.id],
    midterm = EduPolicy.dual(
      frozenLesson.gradingPolicy,
      raw.midtermPractical,
      raw.midtermTheory,
    ),
    final = EduPolicy.dual(
      frozenLesson.gradingPolicy,
      raw.practical,
      raw.theory,
    );
  output.stores.reports.push({
    id: "scale-frozen-first",
    workspace: ids[0],
    year,
    term: firstTerm,
    at: stamp,
    classes: [
      {
        school: values[0].schools[0].name,
        name: frozenClass.name,
        students: [
          {
            id: student.id,
            name: student.name,
            code: student.code,
            average: final.final,
            lessons: [
              {
                id: frozenLesson.id,
                name: frozenLesson.name,
                mode: "kardanesh",
                teacher: frozenLesson.teacher,
                policy: clone(frozenLesson.gradingPolicy),
                practical: raw.practical,
                theory: raw.theory,
                final: final.final,
                passed: final.passed,
                assessments: {
                  version: 1,
                  midterm: {
                    ...midterm,
                    practical: raw.midtermPractical,
                    theory: raw.midtermTheory,
                  },
                  final: {
                    ...final,
                    practical: raw.practical,
                    theory: raw.theory,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });
  EduV24.validateFullBackup(output);
  return output;
};
