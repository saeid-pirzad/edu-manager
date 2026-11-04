"use strict";

(function (root) {
  const dayMilliseconds = 24 * 60 * 60 * 1000,
    defaultDays = [0, 1, 2, 3, 4, 5];
  function outsideSchedule(message) {
    const error = Error(message);
    error.code = "SESSION_OUTSIDE_SCHEDULE";
    return error;
  }
  function localToday() {
    const today = new Date();
    return (
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0")
    );
  }
  function dateValue(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw outsideSchedule(
        "برای بررسی برنامهٔ هفتگی، تاریخ معتبر انتخاب کنید.",
      );
    const value = new Date(date + "T00:00:00.000Z");
    if (
      !Number.isFinite(value.getTime()) ||
      value.toISOString().slice(0, 10) !== date
    )
      throw outsideSchedule(
        "برای بررسی برنامهٔ هفتگی، تاریخ معتبر انتخاب کنید.",
      );
    return value;
  }
  function saturday(date) {
    const value = dateValue(date);
    return value.getTime() - ((value.getUTCDay() + 1) % 7) * dayMilliseconds;
  }
  function weekParity(source, date, referenceDate) {
    const today = referenceDate || localToday(),
      origin = saturday(source?.settings?.weekStartDate || today),
      target = saturday(date || today),
      weeks = (target - origin) / (7 * dayMilliseconds);
    return weeks % 2 === 0 ? "odd" : "even";
  }
  function entry(source, day, period, date, referenceDate) {
    if (
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6 ||
      !Number.isInteger(period) ||
      period < 0 ||
      period > 11
    )
      return null;
    const parity = weekParity(source, date, referenceDate),
      schedule = source?.masterSchedule || {},
      ownEntry = (key) => (Object.hasOwn(schedule, key) ? schedule[key] : null);
    return (
      ownEntry(day + "-" + period + "-" + parity) ||
      ownEntry(day + "-" + period + "-all") ||
      null
    );
  }
  function matchingPeriods(source, identity, referenceDate) {
    let date;
    try {
      date = dateValue(identity?.date);
    } catch (error) {
      return [];
    }
    const day = (date.getUTCDay() + 1) % 7,
      days = source?.activeDays ?? defaultDays,
      periods = source?.periods ?? 6;
    if (
      !Array.isArray(days) ||
      !days.includes(day) ||
      !Number.isInteger(periods) ||
      periods < 1 ||
      periods > 12 ||
      !identity.schoolId ||
      !identity.classId ||
      !identity.lessonId
    )
      return [];
    const result = [];
    for (let period = 0; period < periods; period++) {
      const scheduled = entry(
        source,
        day,
        period,
        identity.date,
        referenceDate,
      );
      if (
        scheduled?.schoolId === identity.schoolId &&
        scheduled.classId === identity.classId &&
        scheduled.lessonId === identity.lessonId
      )
        result.push(period);
    }
    return result;
  }
  function assertScheduled(changes, source, referenceDate) {
    const today = referenceDate || localToday();
    for (const { value } of changes.guarded) {
      const date = dateValue(value.date),
        day = (date.getUTCDay() + 1) % 7,
        days = source?.activeDays ?? defaultDays,
        periods = source?.periods ?? 6;
      if (!Array.isArray(days) || !days.includes(day))
        throw outsideSchedule(
          "روز انتخاب‌شده در برنامهٔ هفتگی فعال نیست؛ روز جلسه یا تنظیمات برنامه را اصلاح کنید. هیچ تغییری ذخیره نشد.",
        );
      if (
        !Number.isInteger(value.period) ||
        value.period < 0 ||
        value.period >= periods ||
        !Number.isInteger(periods) ||
        periods < 1 ||
        periods > 12
      )
        throw outsideSchedule(
          "زنگ انتخاب‌شده خارج از تعداد زنگ‌های برنامهٔ هفتگی است؛ زنگ جلسه یا برنامه را اصلاح کنید. هیچ تغییری ذخیره نشد.",
        );
      const allowed = matchingPeriods(source, value, today);
      if (allowed.includes(value.period)) continue;
      throw outsideSchedule(
        allowed.length
          ? "این درس در تاریخ انتخاب‌شده فقط در زنگ " +
              allowed.map((period) => period + 1).join("، ") +
              " برنامه دارد؛ زنگ درست را انتخاب کنید. هیچ تغییری ذخیره نشد."
          : "برای این مدرسه، کلاس و درس در تاریخ انتخاب‌شده برنامه‌ای وجود ندارد؛ روز جلسه، هفتهٔ زوج/فرد یا برنامهٔ هفتگی را اصلاح کنید. هیچ تغییری ذخیره نشد.",
      );
    }
  }

  // A physical class meeting belongs to a date and bell, not to its term's
  // storage identity. Only new/moved slots are guarded: existing legacy overlaps
  // remain readable and their attendance or activities can still be corrected.
  root.EduSessionSlots = Object.freeze({
    weekParity,
    entry,
    matchingPeriods,
    assertScheduled,
    changes({ changed, before, removed, restoredRecords = null }) {
      const updates = changed
          .filter(([logical]) => logical.startsWith("session:"))
          .map(([logical, json]) => ({
            logical,
            value: JSON.parse(json),
            json,
          })),
        guarded = updates.filter(({ logical, value, json }) => {
          const previous = before.find((row) => row.key === logical)?.value;
          if (
            previous &&
            previous.schoolId === value.schoolId &&
            previous.classId === value.classId &&
            previous.lessonId === value.lessonId &&
            previous.date === value.date &&
            previous.period === value.period
          )
            return false;
          // This map comes only from the already validated historical undo,
          // never from a public save scope or a caller-supplied allow flag.
          return JSON.stringify(restoredRecords?.get(logical)) !== json;
        });
      return {
        updates,
        guarded,
        removed: removed.filter((logical) => logical.startsWith("session:")),
      };
    },

    assertAvailable(changes, workspaceId, parts) {
      if (!changes.guarded.length) return;
      const family = parts.map((part) => {
        const records = new Map(part.records);
        if (part.id === workspaceId) {
          for (const { logical, value } of changes.updates)
            records.set(logical, value);
          for (const logical of changes.removed) records.delete(logical);
        }
        return { id: part.id, records };
      });
      for (const { logical, value } of changes.guarded)
        for (const part of family)
          for (const [key, session] of part.records) {
            if (
              !key.startsWith("session:") ||
              (part.id === workspaceId && key === logical)
            )
              continue;
            if (
              session.date === value.date &&
              session.period === value.period
            ) {
              const error = Error(
                "تداخل جلسه: در این تاریخ و زنگ، جلسهٔ دیگری در همین سال تحصیلی ثبت شده است؛ کلاس، ترم و جلسهٔ قبلی را بررسی یا تاریخ و زنگ را اصلاح کنید. هیچ تغییری ذخیره نشد.",
              );
              error.code = "ACADEMIC_SESSION_SLOT_CONFLICT";
              throw error;
            }
          }
    },
  });
})(globalThis);
