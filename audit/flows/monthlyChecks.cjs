"use strict";

async function monthlyChecks() {
  const cases = [],
    check = (id, name, pass) => cases.push({ id, name, pass: !!pass });
  for (const [id, date, start, end, days] of [
    ["M01", "2024-03-20", "2024-03-20", "2024-04-19", 31],
    ["M02", "2025-03-19", "2025-02-19", "2025-03-20", 30],
    ["M03", "2025-03-21", "2025-03-21", "2025-04-20", 31],
    ["M04", "2026-10-25", "2026-10-23", "2026-11-21", 30],
  ]) {
    const range = EduPeriodicReports.range("monthly", date);
    const m = EduPeriodicReports.build(db, {
      mode: "monthly",
      date,
      schoolId: "school_a",
      classId: "class_a",
      audience: "management",
      detailLevel: "summary",
    });
    check(
      id,
      "Persian month boundary and complete daily rows " + date,
      range.start === start &&
        range.end === end &&
        m.days.length === days &&
        m.days.at(-1).date === end,
    );
  }
  EduPeriodicReports.render("monthly");
  EduPeriodicReports.selectScope("school_a", "class_a");
  EduPeriodicReports.set("date", "2026-10-25");
  const m = await EduPeriodicReports.generate();
  check(
    "M05",
    "monthly report generates and displays correct heading",
    !!m &&
      EduPeriodicReports.documentHtml(m).includes("گزارش ماهانه") &&
      EduPeriodicReports.textReport(m).includes("ماهانه"),
  );
  return cases;
}

module.exports = monthlyChecks;
