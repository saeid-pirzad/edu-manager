// Quality of recorded observations, never an estimate of scheduled attendance.
(function (root) {
  "use strict";
  function build(model) {
    const statuses = ["present", "late", "absent", "leave", "unknown"],
      count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
    let expected = 0,
      unknown = 0,
      partialSessions = 0,
      unrecordedSessions = 0,
      emptyRosterSessions = 0;
    for (const session of model.sessions || []) {
      const total = statuses.reduce(
          (sum, key) => sum + count(session.counts[key]),
          0,
        ),
        missing = count(session.counts.unknown);
      expected += total;
      unknown += missing;
      if (!total) emptyRosterSessions++;
      else if (missing === total) unrecordedSessions++;
      else if (missing) partialSessions++;
    }
    const recorded = expected - unknown,
      followup = (model.students || [])
        .filter((student) => student.unknown || student.absent || student.late)
        .map((student) => ({
          studentId: student.studentId,
          classId: student.classId,
          name: student.name,
          className: student.className,
          code: student.code,
          absent: count(student.absent),
          late: count(student.late),
          unknown: count(student.unknown),
          sessions: count(student.sessions),
        }))
        .sort(
          (a, b) =>
            b.unknown - a.unknown || b.absent - a.absent || b.late - a.late,
        );
    return {
      expected,
      recorded,
      unknown,
      completionRate: expected ? (recorded / expected) * 100 : null,
      partialSessions,
      unrecordedSessions,
      emptyRosterSessions,
      followup,
    };
  }
  root.EduReportCompleteness = Object.freeze({ build });
})(globalThis);
