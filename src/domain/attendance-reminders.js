(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000,
    MAX_MARKERS = 5000,
    fields = new Set([
      "id",
      "date",
      "period",
      "schoolId",
      "classId",
      "lessonId",
      "recordedAt",
    ]);
  const identityKey = (value) =>
    [
      value.date,
      value.period,
      value.schoolId,
      value.classId,
      value.lessonId,
    ].join("|");
  const slotKey = (value) => value.date + "|" + value.period;
  function invalidMarkers() {
    const error = Error("فهرست جلسات برگزارنشده معتبر نیست.");
    error.code = "ATTENDANCE_REMINDER_MARKERS_INVALID";
    throw error;
  }
  function validateMarkers(markers) {
    if (markers === undefined) return true;
    if (!Array.isArray(markers) || markers.length > MAX_MARKERS)
      invalidMarkers();
    const ids = new Set(),
      identities = new Set();
    for (const marker of markers) {
      if (
        !isDataObject(marker) ||
        Object.keys(marker).some((key) => !fields.has(key)) ||
        ![marker.id, marker.schoolId, marker.classId, marker.lessonId].every(
          isSafeRecordId,
        ) ||
        !root.EduAcademicYear.validDate(marker.date) ||
        !Number.isInteger(marker.period) ||
        marker.period < 0 ||
        marker.period > 11 ||
        typeof marker.recordedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
          marker.recordedAt,
        ) ||
        !Number.isFinite(Date.parse(marker.recordedAt)) ||
        new Date(marker.recordedAt).toISOString().slice(0, 19) !==
          marker.recordedAt.slice(0, 19)
      )
        invalidMarkers();
      const key = identityKey(marker);
      if (ids.has(marker.id) || identities.has(key)) invalidMarkers();
      ids.add(marker.id);
      identities.add(key);
    }
    return true;
  }
  function classIndex(data) {
    return new Map(
      (data.schools || []).flatMap((school) =>
        school.classes.map((classroom) => [
          classroom.id,
          {
            school,
            classroom,
            lessons: new Map(
              classroom.lessons.map((lesson) => [lesson.id, lesson]),
            ),
          },
        ]),
      ),
    );
  }
  function attendanceProgress(session, classroom) {
    const roster = Array.isArray(session.roster)
        ? session.roster
        : [
            ...(classroom?.students || []),
            ...(classroom?.archivedStudents || []),
          ],
      members = new Set(roster.map((student) => student.id));
    let unknown = 0;
    for (const id of members) {
      const value = Object.hasOwn(session.attendance || {}, id)
        ? session.attendance[id]
        : "";
      if (!/^(present|absent|leave|late(?::\d{1,3})?)$/.test(value)) unknown++;
    }
    return { unknown, total: members.size };
  }
  function build(
    source,
    {
      year = source.settings.academicYear,
      today,
      workspaceId,
      parts = [],
    } = {},
  ) {
    if (!root.EduAcademicYear.validDate(today) || !isSafeRecordId(workspaceId))
      throw Error("تاریخ یا ترم مبنای یادآوری حضور معتبر نیست.");
    year = root.EduAcademicYear.normalize(year);
    const bounds = root.EduAcademicYear.range(year),
      yesterday = new Date(Date.parse(today + "T00:00:00.000Z") - DAY_MS)
        .toISOString()
        .slice(0, 10),
      start = bounds.start,
      end = yesterday < bounds.end ? yesterday : bounds.end,
      items = [];
    if (end < start) return { start, end, items, scannedDays: 0 };
    const sources = new Map([[workspaceId, source]]);
    for (const part of parts) {
      const partYear = part.period?.year || part.data?.settings?.academicYear;
      if (partYear !== year || sources.has(part.period.id)) continue;
      if (!isSafeRecordId(part.period.id))
        throw Error("شناسهٔ ترم سوابق حضور معتبر نیست.");
      sources.set(part.period.id, part.data);
    }
    const actual = new Map(),
      dismissed = new Set();
    for (const [sourcePeriodId, data] of sources) {
      validateMarkers(data.notHeldSessions);
      for (const marker of data.notHeldSessions || [])
        dismissed.add(identityKey(marker));
      const classes = classIndex(data);
      for (const session of data.sessions || []) {
        if (session.date < start || session.date > end) continue;
        const found = classes.get(session.classId),
          lesson = found?.lessons.get(session.lessonId),
          item = {
            date: session.date,
            day:
              (new Date(session.date + "T00:00:00.000Z").getUTCDay() + 1) % 7,
            period: session.period,
            schoolId: session.schoolId,
            classId: session.classId,
            lessonId: session.lessonId,
            schoolName: found?.school.name || "مدرسه نامشخص",
            className: found?.classroom.name || "کلاس نامشخص",
            lessonName: lesson?.name || "درس نامشخص",
            sourcePeriodId,
            sessionId: session.id,
            ...attendanceProgress(session, found?.classroom),
          },
          key = slotKey(item);
        if (!actual.has(key)) actual.set(key, []);
        actual.get(key).push(item);
      }
    }
    // Any real session claims its physical date/bell, even if the current
    // timetable changed. A dismissal can never hide incomplete real attendance.
    for (const sessions of actual.values()) {
      sessions.sort(
        (a, b) =>
          a.sourcePeriodId.localeCompare(b.sourcePeriodId) ||
          a.sessionId.localeCompare(b.sessionId),
      );
      const first = sessions[0];
      if (sessions.length > 1)
        items.push({
          ...first,
          key: slotKey(first),
          kind: "conflict",
          unknown: sessions.reduce((sum, session) => sum + session.unknown, 0),
          total: sessions.reduce((sum, session) => sum + session.total, 0),
          sessions,
        });
      else if (first.unknown)
        items.push({ ...first, key: identityKey(first), kind: "incomplete" });
    }
    const classes = classIndex(source),
      activeDays = new Set(source.activeDays ?? [0, 1, 2, 3, 4, 5]),
      periods = source.periods ?? 6;
    if (!Number.isInteger(periods) || periods < 1 || periods > 12)
      throw Error("تعداد زنگ‌های مبنای یادآوری حضور معتبر نیست.");
    let scannedDays = 0;
    for (
      let stamp = Date.parse(start + "T00:00:00.000Z");
      stamp <= Date.parse(end + "T00:00:00.000Z") && scannedDays < 366;
      stamp += DAY_MS
    ) {
      scannedDays++;
      const date = new Date(stamp).toISOString().slice(0, 10),
        day = (new Date(stamp).getUTCDay() + 1) % 7;
      if (!activeDays.has(day)) continue;
      for (let period = 0; period < periods; period++) {
        if (actual.has(slotKey({ date, period }))) continue;
        const scheduled = root.EduSessionSlots.entry(
            source,
            day,
            period,
            date,
            today,
          ),
          found = scheduled && classes.get(scheduled.classId),
          lesson = found?.lessons.get(scheduled.lessonId);
        if (!lesson || found.school.id !== scheduled.schoolId) continue;
        const item = {
          date,
          day,
          period,
          schoolId: found.school.id,
          classId: found.classroom.id,
          lessonId: lesson.id,
          schoolName: found.school.name,
          className: found.classroom.name,
          lessonName: lesson.name,
          sourcePeriodId: workspaceId,
          sessionId: "",
          unknown: found.classroom.students.length,
          total: found.classroom.students.length,
          kind: "missing",
        };
        item.key = identityKey(item);
        if (!dismissed.has(item.key)) items.push(item);
      }
    }
    items.sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
    return { start, end, items, scannedDays };
  }
  root.EduAttendanceReminders = Object.freeze({ validateMarkers, build });
})(globalThis);
