(function (root) {
  "use strict";

  function emptyCounts() {
    return {
      present: 0,
      absent: 0,
      leave: 0,
      late: 0,
      unknown: 0,
      lateMinutes: 0,
      lateMinutesRecorded: 0,
    };
  }

  function normalize(value) {
    if (value === "present")
      return { status: "present", label: "حاضر", minutes: null };
    if (value === "absent")
      return { status: "absent", label: "غایب", minutes: null };
    if (value === "leave")
      return { status: "leave", label: "مرخصی", minutes: null };
    const match =
      typeof value === "string" ? value.match(/^late(?::(\d+))?$/) : null;
    if (match)
      return {
        status: "late",
        label: "با تأخیر",
        minutes: match[1] === undefined ? null : Number(match[1]),
      };
    return { status: "unknown", label: "تعیین نشده", minutes: null };
  }

  // The accumulator belongs to the caller. Keep the teacher report's mutation
  // and minute-recording semantics, including an explicitly recorded zero.
  function tally(counts, attendance) {
    counts[attendance.status]++;
    if (
      attendance.minutes !== null &&
      Number.isSafeInteger(attendance.minutes)
    ) {
      counts.lateMinutes += attendance.minutes;
      counts.lateMinutesRecorded++;
    }
  }

  function attendanceRate(counts) {
    const known = counts.present + counts.absent + counts.late;
    return known
      ? Number((((counts.present + counts.late) * 100) / known).toFixed(1))
      : null;
  }

  function requiredId(value) {
    if (typeof value !== "string" || !value.trim())
      throw TypeError("شناسهٔ مرجع مشاهدهٔ حضور معتبر نیست.");
    return value;
  }

  function observationDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw TypeError("تاریخ مشاهدهٔ حضور معتبر نیست.");
    const parsed = new Date(value + "T00:00:00.000Z");
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw TypeError("تاریخ مشاهدهٔ حضور معتبر نیست.");
    return value;
  }

  /**
   * Summarize resolved observations, not a school roster or imported packets.
   * Each row is { schoolId, studentId, sessionId, date, raw }. All three IDs
   * MUST already be canonical in their school: names and teacher-local IDs are
   * never matched here. In particular, session IDs must distinguish sources.
   * An identical school/session/student observation is counted once; an
   * unresolved duplicate with a different date/status/minutes is an error.
   * uniqueStudents means participating people, not the school population.
   * studentDayCounts categories overlap; present includes late, and an absent
   * day means at least one absent observation, NOT absence for the whole day.
   */
  function summarizeObservations(rows) {
    if (!Array.isArray(rows)) throw TypeError("مشاهدات حضور باید فهرست باشند.");
    const counts = emptyCounts(),
      observations = new Map(),
      sessions = new Map(),
      students = new Set(),
      days = new Map(),
      studentDayCounts = {
        present: 0,
        absent: 0,
        leave: 0,
        late: 0,
        unknown: 0,
      };
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw TypeError("مشاهدهٔ حضور معتبر نیست.");
      const schoolId = requiredId(row.schoolId),
        studentId = requiredId(row.studentId),
        sessionId = requiredId(row.sessionId),
        date = observationDate(row.date),
        attendance = normalize(row.raw),
        sessionKey = JSON.stringify([schoolId, sessionId]),
        key = JSON.stringify([schoolId, sessionId, studentId]),
        previous = observations.get(key);
      if (sessions.has(sessionKey) && sessions.get(sessionKey) !== date)
        throw Error("تاریخ‌های متفاوت برای یک جلسهٔ مرجع قابل جمع نیستند.");
      if (previous) {
        if (
          previous.date !== date ||
          previous.status !== attendance.status ||
          previous.minutes !== attendance.minutes
        )
          throw Error("وضعیت‌های متعارض یک مشاهدهٔ حضور قابل جمع نیستند.");
        continue;
      }
      observations.set(key, { date, ...attendance });
      sessions.set(sessionKey, date);
      students.add(JSON.stringify([schoolId, studentId]));
      const dayKey = JSON.stringify([schoolId, studentId, date]);
      if (!days.has(dayKey)) days.set(dayKey, new Set());
      const statuses = days.get(dayKey);
      statuses.add(attendance.status);
      if (attendance.status === "late") statuses.add("present");
      tally(counts, attendance);
    }
    for (const statuses of days.values())
      for (const status of statuses) studentDayCounts[status]++;
    return {
      counts,
      attendanceRate: attendanceRate(counts),
      observations: observations.size,
      sessions: sessions.size,
      uniqueStudents: students.size,
      studentDays: days.size,
      studentDayCounts,
    };
  }

  root.EduReportAttendance = Object.freeze({
    normalize,
    emptyCounts,
    tally,
    attendanceRate,
    summarizeObservations,
  });
})(globalThis);
