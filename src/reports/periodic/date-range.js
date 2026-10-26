"use strict";
const localToday = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
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
function range(mode, date, academicYear) {
  if (!["daily", "weekly", "monthly", "annual"].includes(mode))
    throw Error("نوع گزارش نامعتبر است.");
  const d = isoDate(date);
  if (mode === "annual") {
    if (
      !/^\d{4}-\d{4}$/.test(academicYear || "") ||
      Number(academicYear.slice(5)) !== Number(academicYear.slice(0, 4)) + 1
    )
      throw Error("سال تحصیلی گزارش معتبر نیست.");
    const iso = (parts) =>
      parts
        .map((v, i) => (i ? String(v).padStart(2, "0") : String(v)))
        .join("-");
    return {
      start: iso(jalaliToGregorian(Number(academicYear.slice(0, 4)), 7, 1)),
      end: addDays(
        iso(jalaliToGregorian(Number(academicYear.slice(5)), 7, 1)),
        -1,
      ),
    };
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
