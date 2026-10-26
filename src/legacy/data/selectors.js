function getSchool(id) {
  return db.schools.find((s) => s.id === id);
}
function getClassObj(sId, cId) {
  const s = getSchool(sId);
  return s ? s.classes.find((c) => c.id === cId) : null;
}
function getLessonObj(cObj, lId) {
  return cObj ? (cObj.lessons || []).find((l) => l.id === lId) : null;
}
function getStudentObj(cObj, stId) {
  return cObj
    ? [...cObj.students, ...(cObj.archivedStudents || [])].find(
        (s) => s.id === stId,
      )
    : null;
}
function findClassById(cId) {
  for (const s of db.schools) {
    const c = s.classes.find((x) => x.id === cId);
    if (c) return { school: s, classObj: c };
  }
  return null;
}
function getClassColor(cId) {
  const all = [];
  db.schools.forEach((s) => s.classes.forEach((c) => all.push(c.id)));
  const idx = all.indexOf(cId);
  return idx >= 0 ? COLORS[idx % COLORS.length] : "#64748b";
}
function getSaturdayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getWeekParity(dateStr) {
  const start = getSaturdayOf(db.settings.weekStartDate || todayISO());
  const target = getSaturdayOf(dateStr || todayISO());
  const weeks = Math.round(
    (new Date(target + "T00:00:00") - new Date(start + "T00:00:00")) /
      (7 * 24 * 60 * 60 * 1000),
  );
  return weeks % 2 === 0 ? "odd" : "even";
}
function getMasterEntry(day, period, dateStr) {
  const parity = getWeekParity(dateStr);
  const m = db.masterSchedule || {};
  return m[`${day}-${period}-${parity}`] || m[`${day}-${period}-all`] || null;
}
function getBothEntries(day, period) {
  const m = db.masterSchedule || {};
  return {
    all: m[`${day}-${period}-all`] || null,
    odd: m[`${day}-${period}-odd`] || null,
    even: m[`${day}-${period}-even`] || null,
  };
}

// ==================== ناوبری ====================
