// Use the same offline Persian calendar as the application's Intl date labels.
// Gregorian civil dates remain the persisted format; no locale text is parsed.
let calendarPersianFormatter = null;
const calendarYearStarts = new Map();
const calendarDayMilliseconds = 86400000;

function calendarInvalidDate() {
  return new RangeError("تاریخ معتبر انتخاب کنید.");
}

function calendarUTCDate(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  // Date.UTC and the multi-argument Date constructor remap years 0…99.
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function calendarPersianParts(date) {
  if (!calendarPersianFormatter) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        calendar: "persian",
        numberingSystem: "latn",
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      const options = formatter.resolvedOptions();
      if (options.calendar !== "persian" || options.numberingSystem !== "latn")
        throw Error();
      calendarPersianFormatter = formatter;
    } catch (cause) {
      throw Error("تقویم فارسی در این مرورگر پشتیبانی نمی‌شود.", { cause });
    }
  }
  const result = [];
  for (const part of calendarPersianFormatter.formatToParts(date)) {
    if (part.type === "year") result[0] = Number(part.value);
    if (part.type === "month") result[1] = Number(part.value);
    if (part.type === "day") result[2] = Number(part.value);
  }
  if (result.length !== 3 || !result.every(Number.isInteger))
    throw Error("تقویم فارسی در این مرورگر پشتیبانی نمی‌شود.");
  return result;
}

function gregorianToJalali(gy, gm, gd) {
  if (
    ![gy, gm, gd].every(Number.isInteger) ||
    gy < 1 ||
    gy > 9999 ||
    gm < 1 ||
    gm > 12 ||
    gd < 1 ||
    gd > 31
  )
    throw calendarInvalidDate();
  const date = calendarUTCDate(gy, gm, gd);
  if (
    date.getUTCFullYear() !== gy ||
    date.getUTCMonth() + 1 !== gm ||
    date.getUTCDate() !== gd
  )
    throw calendarInvalidDate();
  return calendarPersianParts(date);
}

function calendarJalaliYearStart(jy) {
  if (calendarYearStarts.has(jy)) return calendarYearStarts.get(jy);
  // Find the first UTC civil day of this Persian year. Searching an entire
  // Gregorian year also supports early and distant dates without an assumed
  // equinox day or a repeated 33-year leap cycle.
  let low = calendarUTCDate(jy + 621, 1, 1).getTime() / calendarDayMilliseconds,
    high = calendarUTCDate(jy + 622, 1, 1).getTime() / calendarDayMilliseconds;
  while (low < high) {
    const middle = Math.floor((low + high) / 2),
      parts = calendarPersianParts(new Date(middle * calendarDayMilliseconds));
    if (parts[0] < jy) low = middle + 1;
    else high = middle;
  }
  const timestamp = low * calendarDayMilliseconds,
    actual = calendarPersianParts(new Date(timestamp));
  if (actual[0] !== jy || actual[1] !== 1 || actual[2] !== 1)
    throw calendarInvalidDate();
  if (calendarYearStarts.size >= 256)
    calendarYearStarts.delete(calendarYearStarts.keys().next().value);
  calendarYearStarts.set(jy, timestamp);
  return timestamp;
}

function jalaliToGregorian(jy, jm, jd) {
  if (
    ![jy, jm, jd].every(Number.isInteger) ||
    jy < -621 ||
    jy > 9999 ||
    jm < 1 ||
    jm > 12 ||
    jd < 1 ||
    jd > 31
  )
    throw calendarInvalidDate();
  // Retain day overflow for the picker's round-trip rejection of e.g. 30
  // Esfand in an ordinary year. Only a validated selection is persisted.
  const offset = (jm <= 6 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + jd - 1,
    date = new Date(
      calendarJalaliYearStart(jy) + offset * calendarDayMilliseconds,
    );
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}
