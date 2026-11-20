(function (root) {
  "use strict";

  // Presentation and application lookups belong to the caller. The model owns
  // only report selection, historical roster projection and ordered groups.
  root.EduActivityReportModel = function (api) {
    function filterSessions(source, filter) {
      const classroom = (session) =>
        source.schools
          .find((school) => school.id === session.schoolId)
          ?.classes.find((item) => item.id === session.classId);
      return source.sessions
        .filter((session) => {
          if (filter.date && session.date !== filter.date) return false;
          if (filter.schoolId && session.schoolId !== filter.schoolId)
            return false;
          if (filter.classId && session.classId !== filter.classId)
            return false;
          if (filter.lessonId && session.lessonId !== filter.lessonId)
            return false;
          if (filter.period && String(session.period) !== filter.period)
            return false;
          if (filter.studentId) {
            const hasAttendance =
              session.attendance[filter.studentId] !== undefined;
            const hasScore = session.scores.some(
              (score) => score.studentId === filter.studentId,
            );
            const roster = session.roster || classroom(session)?.students || [];
            if (
              !hasAttendance &&
              !hasScore &&
              !roster.some((student) => student.id === filter.studentId)
            )
              return false;
          }
          return true;
        })
        .map((session) => {
          const studentId = filter.studentId;
          if (!studentId) return session;
          // Scope the whole session before either presentation can inspect it.
          const roster = session.roster || classroom(session)?.students || [];
          return {
            ...session,
            roster: roster.filter((student) => student.id === studentId),
            attendance: Object.hasOwn(session.attendance, studentId)
              ? { [studentId]: session.attendance[studentId] }
              : {},
            scores: session.scores.filter(
              (score) => score.studentId === studentId,
            ),
          };
        })
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return a.period - b.period;
        });
    }

    function attendance(classroom, session) {
      const counts = api.attendance.emptyCounts(),
        names = {
          presentNames: [],
          absentNames: [],
          leaveNames: [],
          lateNames: [],
          unknownNames: [],
        };
      const people = api.sessionStudents(classroom, session).map((student) => {
        const attendance = api.attendance.normalize(
          session.attendance[student.id],
        );
        api.attendance.tally(counts, attendance);
        if (attendance.status === "present")
          names.presentNames.push(student.name);
        else if (attendance.status === "leave")
          names.leaveNames.push(student.name);
        else if (attendance.status === "absent")
          names.absentNames.push(student.name);
        else if (attendance.status === "late") {
          names.presentNames.push(student.name);
          names.lateNames.push(
            `${student.name}${attendance.minutes === null ? "" : " (" + attendance.minutes + "د)"}`,
          );
        } else names.unknownNames.push(student.name);
        return { student, attendance };
      });
      return { counts, people, ...names };
    }

    function project(session, filter) {
      const classInfo = api.findClass(session.classId, session.schoolId),
        classroom = classInfo.classObj,
        lesson = api.getLesson(classroom, session.lessonId),
        records = filter.studentId
          ? session.scores.filter(
              (score) => score.studentId === filter.studentId,
            )
          : session.scores,
        scores = {};
      for (const type of [
        "mostamar",
        "payani",
        "classGrade",
        "activity",
        "positive",
        "negative",
        "homework",
      ])
        scores[type] = records.filter((score) => score.type === type);
      // Filtering the original list preserves interleaved activity order.
      scores.exams = records.filter(
        (score) =>
          score.type === "mostamar" ||
          score.type === "payani" ||
          score.type === "classGrade" ||
          score.type === "activity",
      );
      const entries = {};
      if (filter.reportMode !== "summary") {
        const studentName = (score) => {
          const student = api.sessionStudent(
            classroom,
            session,
            score.studentId,
          );
          return student ? student.name : "";
        };
        if (filter.showScores)
          entries.exams = scores.exams.map(
            (score) =>
              `${studentName(score)}(${api.typeLabel(score.type)}:${score.value})`,
          );
        if (filter.showPosNeg)
          for (const type of ["positive", "negative"])
            entries[type] = scores[type].map(
              (score) => `${studentName(score)}(${score.value})`,
            );
        if (filter.showHomework)
          entries.homework = scores.homework.map(
            (score) =>
              `${studentName(score)}${score.note ? "(" + score.note + ")" : ""}`,
          );
      }
      return {
        session,
        classInfo,
        lesson,
        scores,
        entries,
        attendance:
          filter.showAttendance &&
          (filter.reportMode !== "summary" || !filter.studentId)
            ? attendance(classroom, session)
            : null,
        studentAttendance:
          filter.reportMode === "summary" &&
          filter.studentId &&
          filter.showAttendance
            ? api.attendance.normalize(session.attendance[filter.studentId])
            : null,
      };
    }

    function build(sessions, filter) {
      const rows = sessions.map((session) => project(session, filter)),
        groupedByPeriod = {};
      rows.forEach((row) => {
        const period = row.session.period;
        if (!groupedByPeriod[period]) groupedByPeriod[period] = [];
        groupedByPeriod[period].push(row);
      });
      const periods = Object.keys(groupedByPeriod)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((period) => ({
          period: parseInt(period),
          rows: groupedByPeriod[period],
        }));
      return { rows, periods };
    }

    return Object.freeze({ filterSessions, attendance, build });
  };
})(globalThis);
