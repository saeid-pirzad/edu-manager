// Shared date ranges; independent of either application's state or DOM.
(function (root) {
  "use strict";
  function isoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw Error("تاریخ معتبر انتخاب کنید.");
    const d = new Date(value + "T12:00:00Z");
    if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value)
      throw Error("تاریخ معتبر انتخاب کنید.");
    return d;
  }
  function addDays(value, n) {
    const d = isoDate(value);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function range(mode, date, academicYear, selection = {}) {
    if (!["daily", "weekly", "monthly", "annual"].includes(mode))
      throw Error("نوع گزارش نامعتبر است.");
    const d = isoDate(date);
    if (mode === "weekly" && (selection.startDate || selection.endDate)) {
      isoDate(selection.startDate);
      isoDate(selection.endDate);
      if (selection.endDate < selection.startDate)
        throw Error("تاریخ پایان نباید قبل از تاریخ شروع باشد.");
      return { start: selection.startDate, end: selection.endDate };
    }
    if (mode === "annual") {
      return root.EduAcademicYear.range(academicYear);
    }
    if (mode === "monthly") {
      const [jy, jm] = gregorianToJalali(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
      );
      const iso = (parts) =>
        parts
          .map((v, i) => (i ? String(v).padStart(2, "0") : String(v)))
          .join("-");
      const start = iso(jalaliToGregorian(jy, jm, 1));
      const next = iso(
        jalaliToGregorian(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 1),
      );
      return { start, end: addDays(next, -1) };
    }
    const start =
      mode === "weekly" ? addDays(date, -((d.getUTCDay() + 1) % 7)) : date;
    return { start, end: mode === "weekly" ? addDays(start, 6) : start };
  }

  root.EduReportDates = Object.freeze({ isoDate, addDays, range });
})(globalThis);
