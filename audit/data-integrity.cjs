"use strict";
// Developer audit only. Starts a loopback server and a fresh temporary Edge profile.
// It never opens the user's browser profile or changes application source files.
// Node.js 22+; Windows with Edge, or set EDUMANAGER_EDGE to a Chromium executable.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const {spawn} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function matrix() {
  const base = defaultDB();
  const year = base.settings.academicYear;
  const policy = method => ({...EduPolicy.defaults(method, year), code: method === "dual" ? "C01" : "F01", confirmed: true});
  base.schools = [
    {id: "school_a", name: "مدرسه آزمایشی", classes: [{
      id: "class_a", name: "کلاس آزمایشی",
      students: [{id: "student_a", name: "هنرجوی اول", code: "001"}, {id: "student_b", name: "هنرجوی دوم", code: "002"}],
      archivedStudents: [{id: "student_z", name: "هنرجوی بایگانی", code: "003"}],
      lessons: [
        {id: "lesson_dual", name: "درس نظری و عملی", gradeMode: "kardanesh", gradingPolicy: policy("dual"), poudmans: [], kardaneshScores: {student_a: {practical: 18, theory: 12}}},
        {id: "lesson_modular", name: "درس پودمانی", gradeMode: "standard", gradingPolicy: policy("modular"), kardaneshScores: {}, poudmans: [
          {id: "pod_a", name: "پودمان اول", podScores: {student_a: {m: 2, c: 2}}, units: [{id: "unit_a", name: "واحد اول", unitScores: {}}]}
        ]}
      ]
    }]},
    {id: "school_b", name: "مدرسه دوم", classes: [{
      id: "class_b", name: "کلاس دوم",
      students: [{id: "student_other", name: "هنرجوی کلاس دیگر", code: "010"}], archivedStudents: [],
      lessons: [{id: "lesson_other", name: "درس دیگر", gradeMode: "kardanesh", gradingPolicy: policy("dual"), poudmans: [], kardaneshScores: {}}]
    }]}
  ];
  base.sessions = [{id: "session_a", schoolId: "school_a", classId: "class_a", lessonId: "lesson_dual", date: "2026-10-24", period: 0,
    poudmanId: null, unitId: null,
    roster: [{id: "student_a", name: "نام تاریخی اول", code: "001"}, {id: "student_b", name: "نام تاریخی دوم", code: "002"}],
    attendance: {student_a: "present"}, scores: [{studentId: "student_a", type: "activity", value: 1, note: "فعالیت آزمایشی"}]}];
  base.masterSchedule = {"0-0-all": {schoolId: "school_a", classId: "class_a", lessonId: "lesson_dual"}};
  const results = [];
  const cls = d => d.schools[0].classes[0];
  const dual = d => cls(d).lessons[0];
  const modular = d => cls(d).lessons[1];
  const check = (id, name, expected, change, verify, options = {}) => {
    const data = structuredClone(base);
    let accepted = false, error = "", verified = true;
    try {
      change(data);
      const normalized = EduV24.normalizeDB(data, options);
      accepted = true;
      if (verify) verified = !!verify(normalized);
    } catch (e) { error = e.message; if (accepted) verified = false; }
    results.push({id, name, expected, observed: accepted ? "accept" : "reject",
      pass: accepted === (expected === "accept") && verified, ...(error ? {error} : {})});
  };
  check("D01", "valid current database", "accept", () => {});
  for (const [i, value] of ["__proto__", "constructor", "prototype", "toString"].entries())
    check("D0" + (i + 2), "reserved student id: " + value, "reject", d => cls(d).students.push({id: value, name: "شناسه نامعتبر"}));
  check("D06", "empty student id", "reject", d => cls(d).students.push({id: "", name: "نام"}));
  check("D07", "overlong student id", "reject", d => cls(d).students.push({id: "a".repeat(121), name: "نام"}));
  check("D08", "unsafe identifier punctuation", "reject", d => cls(d).students.push({id: "x'y", name: "نام"}));
  check("D09", "duplicate active/archive id", "reject", d => cls(d).archivedStudents.push(structuredClone(cls(d).students[0])));
  check("D10", "same identity in separate class memberships", "accept", d => d.schools[1].classes[0].students.push(structuredClone(cls(d).students[0])));
  check("D11", "duplicate lesson identifier", "reject", d => cls(d).lessons[1].id = "lesson_dual");
  check("D12", "homonyms are independent people", "accept", d => cls(d).students[1].name = cls(d).students[0].name);
  check("D13", "optional empty student code", "accept", d => { delete cls(d).students[0].code; });
  check("D14", "active duplicate code", "reject", d => cls(d).students[1].code = "001");
  check("D15", "active/archive duplicate code", "reject", d => cls(d).archivedStudents[0].code = "001");
  check("D16", "Persian/ASCII duplicate codes", "reject", d => cls(d).students[1].code = "۰۰۱");
  check("D17", "same code in separate classes", "accept", d => d.schools[1].classes[0].students[0].code = "001");
  check("D18", "dual grade for nonexistent student", "reject", d => dual(d).kardaneshScores.missing = {practical: 18, theory: 12});
  check("D19", "dual grade for other-class student", "reject", d => dual(d).kardaneshScores.student_other = {practical: 18, theory: 12});
  check("D20", "archived student grade remains valid", "accept", d => dual(d).kardaneshScores.student_z = {practical: 18, theory: 12});
  check("D21", "dual grade greater than twenty", "reject", d => dual(d).kardaneshScores.student_a.practical = 21);
  check("D22", "negative dual grade", "reject", d => dual(d).kardaneshScores.student_a.theory = -1);
  check("D23", "string grade", "reject", d => dual(d).kardaneshScores.student_a.practical = "18");
  check("D24", "forged cached final is recomputed", "accept", d => { dual(d).kardaneshScores.student_a.final = 20; },
    d => dual(d).kardaneshScores.student_a.final === 16.2);
  check("D25", "pod grade for other-class student", "reject", d => modular(d).poudmans[0].podScores.student_other = {m: 2, c: 2});
  check("D26", "fractional competency", "reject", d => modular(d).poudmans[0].podScores.student_a.c = 2.5);
  check("D27", "invalid continuous step", "reject", d => modular(d).poudmans[0].podScores.student_a.m = 1.3);
  check("D28", "unit grade for other-class student", "reject", d => modular(d).poudmans[0].units[0].unitScores.student_other = {m: 10});
  check("D29", "session school ownership", "reject", d => d.sessions[0].schoolId = "school_b");
  check("D30", "session lesson ownership", "reject", d => d.sessions[0].lessonId = "lesson_other");
  check("D31", "attendance outside historical roster", "reject", d => d.sessions[0].attendance.student_z = "present");
  check("D32", "score outside historical roster", "reject", d => d.sessions[0].scores.push({studentId: "student_z", type: "activity", value: 1}));
  check("D33", "historical roster unknown identity", "reject", d => d.sessions[0].roster.push({id: "missing", name: "نام"}));
  check("D34", "duplicate historical roster member", "reject", d => d.sessions[0].roster.push(structuredClone(d.sessions[0].roster[0])));
  check("D35", "invalid attendance status", "reject", d => d.sessions[0].attendance.student_a = "unknown-value");
  check("D36", "invalid calendar date", "reject", d => d.sessions[0].date = "2026-02-30");
  check("D37", "duplicate class/date/period slot", "reject", d => d.sessions.push({...structuredClone(d.sessions[0]), id: "session_duplicate"}));
  check("D38", "unit belongs to another lesson", "reject", d => { d.sessions[0].poudmanId = "pod_a"; d.sessions[0].unitId = "unit_a"; });
  check("D39", "valid modular session ownership", "accept", d => { d.sessions[0].lessonId = "lesson_modular"; d.sessions[0].poudmanId = "pod_a"; d.sessions[0].unitId = "unit_a"; });
  check("D40", "historical name remains unchanged", "accept", d => cls(d).students[0].name = "نام جاری اصلاح شده",
    d => d.sessions[0].roster[0].name === "نام تاریخی اول");
  check("D41", "timetable lesson belongs to class", "reject", d => d.masterSchedule["0-0-all"].lessonId = "lesson_other");
  check("D42", "policy year belongs to period", "reject", d => dual(d).gradingPolicy.year = year === "1406-1407" ? "1407-1408" : "1406-1407");
  check("D43", "branch and grade method agree", "reject", d => dual(d).gradingPolicy.branch = "fani");
  check("D44", "unknown future database version", "reject", d => d.schemaVersion = 999);
  check("D45", "reserved key in JSON document", "reject", d => { d.extra = JSON.parse('{"__proto__":{"polluted":true}}'); });
  check("D46", "legacy orphan identity is recovered explicitly", "accept", d => {
    d.schemaVersion = 23; d.sessions[0].attendance.legacy_missing = "absent";
  }, d => cls(d).archivedStudents.some(st => st.id === "legacy_missing" && st.recovered) &&
    d.sessions[0].roster.some(st => st.id === "legacy_missing") && d.migrationWarnings.length > 0, {legacy: true});
  check("D47", "Arabic digits preserve leading zero code", "accept", d => cls(d).students[0].code = "٠٠١",
    d => cls(d).students[0].code === "001");
  window.auditFixture = base;
  return results;
}

async function backupMatrix() {
  db = EduV24.normalizeDB(auditFixture);
  await saveDB({action: "ایجاد داده ساختگی آزمون ممیزی"});
  const base = await EduV24.snapshotInstallation();
  const period = base.stores.catalog.find(p => p.id === base.activeWorkspace);
  const results = [];
  const test = (id, name, expected, mutate) => {
    const value = structuredClone(base);
    let accepted = false, error = "";
    try { mutate(value); EduV24.validateFullBackup(value); accepted = true; }
    catch(e) { error = e.message; }
    results.push({id, name, expected, observed: accepted ? "accept" : "reject",
      pass: accepted === (expected === "accept"), ...(error ? {error} : {})});
  };
  const record = (v, logical) => v.stores.records.find(r => r.workspace === period.id && r.logical === logical);
  const badUndo = (v, before) => {
    v.stores.undo = [{id: period.id, workspace: period.id, revision: period.revision, action: "بازگردانی آزمایشی", before}];
  };
  test("B01", "valid installation backup", "accept", () => {});
  test("B02", "missing meta record", "reject", v => { v.stores.records = v.stores.records.filter(r => !(r.workspace === period.id && r.logical === "meta")); });
  test("B03", "duplicate logical record", "reject", v => v.stores.records.push(structuredClone(record(v, "meta"))));
  test("B04", "missing referenced class", "reject", v => { v.stores.records = v.stores.records.filter(r => !(r.workspace === period.id && r.logical === "class:class_a")); });
  test("B05", "orphan class record", "reject", v => {
    const value = {id: "orphan_class", name: "کلاس جاافتاده از چیدمان", students: [{id: "orphan_student", name: "هنرجوی جاافتاده"}], archivedStudents: [], lessons: []};
    v.stores.records.push({key: period.id + "|class:orphan_class", workspace: period.id, logical: "class:orphan_class", value});
  });
  test("B06", "unknown logical record type", "reject", v => v.stores.records.push({key: period.id + "|unknown:x", workspace: period.id, logical: "unknown:x", value: {name: "داده ناشناخته"}}));
  test("B07", "class record key/value identifier mismatch", "reject", v => {
    const r = record(v, "class:class_b"); r.value.id = "class_changed";
  });
  test("B08", "null-owner data record", "reject", v => v.stores.records.push({key: "orphan|class:extra", workspace: null, logical: "class:extra", value: {}}));
  test("B09", "unknown active workspace", "reject", v => v.activeWorkspace = "missing");
  test("B10", "missing undo before array", "reject", v => { badUndo(v, []); delete v.stores.undo[0].before; });
  test("B11", "undo removes mandatory meta", "reject", v => badUndo(v, [{key: "meta", value: null}]));
  test("B12", "undo refers to unknown logical record type", "reject", v => badUndo(v, [{key: "unknown:x", value: {}}]));
  test("B13", "undo would orphan a session", "reject", v => badUndo(v, [{key: "class:class_a", value: null}]));
  test("B14", "undo revision is invalid", "reject", v => { badUndo(v, []); v.stores.undo[0].revision = "invalid"; });
  test("B15", "duplicate undo store key", "reject", v => { badUndo(v, []); v.stores.undo.push(structuredClone(v.stores.undo[0])); });
  test("B16", "frozen report has malformed classes", "reject", v => v.stores.reports.push({id: "report_bad", workspace: period.id, year: period.year, term: period.term, at: "2026-10-24T00:00:00.000Z", classes: [null]}));
  test("B17", "metadata label mismatch", "reject", v => record(v, "meta").value.settings.academicTerm = "different");
  test("B18", "record references nonexistent workspace", "reject", v => v.stores.records.push({key: "missing|meta", workspace: "missing", logical: "meta", value: {}}));
  test("B19", "valid undo candidate", "accept", v => {
    const c = structuredClone(record(v, "class:class_a").value); c.name = "نام قبلی کلاس";
    badUndo(v, [{key: "class:class_a", value: c}]);
  });
  test("B20", "supported version-one full backup", "accept", v => { v.version = 1; delete v.gradeDrafts; });
  test("B21", "unknown future full-backup schema", "reject", v => v.schemaVersion = 999);
  test("B22", "duplicate catalog period identifier", "reject", v => v.stores.catalog.push(structuredClone(v.stores.catalog[0])));
  window.auditInstallation = base;
  return results;
}

async function orphanRestore() {
  const backup = structuredClone(auditInstallation);
  const original = backup.activeWorkspace;
  backup.stores.undo = [];
  backup.stores.records.push({
    key: original + "|class:orphan_class", workspace: original, logical: "class:orphan_class",
    value: {id: "orphan_class", name: "کلاس جاافتاده", students: [{id: "orphan_student", name: "هنرجوی جاافتاده"}], archivedStudents: [], lessons: []}
  });
  try { EduV24.validateFullBackup(backup); }
  catch (e) { return {id: "I01", name: "orphan class must be rejected by import validation", pass: true, rejectedAt: "validation", error: e.message}; }
  let accepted = false, error = "", missingAfterRestore = false;
  try {
    EduV24.previewFullBackup(backup);
    await EduV24.restoreFullBackup();
    accepted = true;
    missingAfterRestore = !db.schools.some(s => s.classes.some(c => c.id === "orphan_class"));
  } catch(e) { error = e.message; }
  return {id: "I01", name: "orphan class must not disappear in successful restore",
    pass: !accepted, accepted, missingAfterRestore, ...(error ? {error} : {})};
}

async function malformedFrozenReport() {
  const backup = structuredClone(auditInstallation), original = backup.activeWorkspace;
  const period = backup.stores.catalog.find(p => p.id === original);
  backup.stores.undo = [];
  backup.stores.reports = [{id: "malformed_report", workspace: original, year: period.year, term: period.term, at: "2026-10-24T00:00:00.000Z", classes: [null]}];
  try { EduV24.validateFullBackup(backup); }
  catch (e) { return {id: "I02", name: "malformed frozen report must be rejected", pass: true, rejectedAt: "validation", error: e.message}; }
  let restored = false, viewError = "", error = "";
  try {
    EduV24.previewFullBackup(backup); await EduV24.restoreFullBackup(); restored = true;
    const id = EduV24.getReportContext().id, connection = EduV24.test.getConnection();
    const reports = await new Promise((resolve, reject) => {
      const request = connection.transaction("reports", "readonly").objectStore("reports").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const report = reports.find(row => row.workspace === id);
    if (!report) throw Error("Restored report not found");
    try { await EduV24.showFrozenReport(report.id); } catch (e) { viewError = e.message; }
  } catch (e) { error = e.message; }
  return {id: "I02", name: "malformed frozen report must be rejected", pass: false, validatorAccepted: true, restored, viewError, ...(error ? {error} : {})};
}

async function refactorFlows() {
  const results = [];
  const record = (id, name, pass, details = {}) => results.push({id, name, pass: !!pass, ...details});
  const readAll = store => new Promise((resolve, reject) => {
    const request = EduV24.test.getConnection().transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const changeStore = (store, action) => new Promise((resolve, reject) => {
    const tx = EduV24.test.getConnection().transaction(store, "readwrite");
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    action(tx.objectStore(store));
  });
  const currentClass = () => db.schools[0].classes[0];
  try {
    const descriptors = new Map(["practical", "theory", "m", "c"].map(key => [key, Object.getOwnPropertyDescriptor(Object.prototype, key)]));
    let inherited;
    try {
      for (const [key, value] of [["practical", 18], ["theory", 18], ["m", 2], ["c", 2]])
        Object.defineProperty(Object.prototype, key, {value, configurable: true, writable: true});
      const c = currentClass();
      inherited = {
        dual: calcStudentLesson(c, c.lessons[0], "student_b").final,
        modular: calcStudentLesson(c, c.lessons[1], "student_b").final
      };
    } finally {
      for (const [key, descriptor] of descriptors)
        descriptor ? Object.defineProperty(Object.prototype, key, descriptor) : delete Object.prototype[key];
    }
    record("F01", "inherited properties do not become unentered grades", inherited.dual === null && inherited.modular === null, inherited);
    state.schoolId = "school_a"; state.classId = "class_a";
    showModal("ثبت نمره آزمایشی", buildLessonGradesHtml(currentClass(), currentClass().lessons[0]));
    for (const [field, value] of [["practical", "18"], ["theory", "12"]]) {
      const input = [...document.querySelectorAll("[data-grade]")].find(x => x.dataset.student === "student_b" && x.dataset.field === field);
      if (!input) throw Error("Grade input missing: " + field);
      input.value = value; input.dispatchEvent(new Event("input", {bubbles: true}));
      await EduV24.flushDrafts({strict: true});
    }
    record("F02", "native grade inputs persist a valid weighted result",
      calcStudentLesson(currentClass(), currentClass().lessons[0], "student_b").final === 16.2);
    const beforeUndo = EduV24.getReportContext().revision;
    const undoResults = await Promise.all([EduV24.undoLast(), EduV24.undoLast()]);
    const grade = currentClass().lessons[0].kardaneshScores.student_b;
    record("F03", "concurrent undo executes once and preserves previous component",
      undoResults.filter(Boolean).length === 1 && EduV24.getReportContext().revision === beforeUndo + 1 &&
      grade.practical === 18 && grade.theory == null, {undoResults});
    const context = EduV24.getReportContext();
    const recordsBefore = JSON.stringify(await readAll("records")), catalogBefore = JSON.stringify(await readAll("catalog"));
    await changeStore("undo", store => store.put({id: context.id, revision: context.revision, action: "بازگردانی خراب آزمایشی", before: [{key: "meta", value: null}]}));
    let rejectedUndo = "";
    try { await EduV24.undoLast(); } catch (error) { rejectedUndo = error.message; }
    record("F04", "invalid durable undo cannot change records or catalog",
      !!rejectedUndo && JSON.stringify(await readAll("records")) === recordsBefore && JSON.stringify(await readAll("catalog")) === catalogBefore,
      {error: rejectedUndo});
    await changeStore("undo", store => store.delete(context.id));
    const initialName = currentClass().name;
    currentClass().name = "نام موقت برای آزمون بازگردانی";
    await saveDB({classId: "class_a", action: "ویرایش نام ساختگی"});
    await EduV24.undoLast();
    record("F05", "writer accepts a valid save and undo after rejected undo", currentClass().name === initialName);
    currentClass().name = "نام محفوظ در خطای نوشتن";
    await saveDB({classId: "class_a", action: "آزمون شکست بازگردانی"});
    const stable = JSON.stringify(await readAll("records")), stableRevision = EduV24.getReportContext().revision;
    EduV24.test.failNextWrite();
    let writeError = "";
    try { await EduV24.undoLast(); } catch (error) { writeError = error.message; }
    record("F06", "failed undo write keeps durable data and revision",
      !!writeError && stable === JSON.stringify(await readAll("records")) && stableRevision === EduV24.getReportContext().revision, {error: writeError});
    await EduV24.undoLast();
    record("F07", "undo can be retried after failed write", currentClass().name === initialName);
    currentClass().name = "نام انتقالی با بازگردانی معتبر";
    await saveDB({classId: "class_a", action: "آزمون حمل بازگردانی"});
    const versionOne = await EduV24.snapshotInstallation(), previousWorkspace = EduV24.getReportContext().id;
    versionOne.version = 1; delete versionOne.gradeDrafts;
    EduV24.previewFullBackup(versionOne); await EduV24.restoreFullBackup(); await EduV24.undoLast();
    record("F08", "version-one full restore preserves executable undo and record ownership",
      EduV24.getReportContext().id !== previousWorkspace && currentClass().name === initialName);
    for (const school of db.schools)
      for (const c of school.classes)
        for (const l of c.lessons)
          if (l.gradeMode === "kardanesh") {
            for (const student of c.students) l.kardaneshScores[student.id] = {practical: 18, theory: 12};
          } else {
            for (const pod of l.poudmans)
              for (const student of c.students) pod.podScores[student.id] = {m: 2, c: 2};
          }
    await saveDB({action: "تکمیل نمرات ساختگی برای کارنامه"});
    await EduV24.finalizePeriod();
    const frozen = (await readAll("reports")).find(row => row.workspace === EduV24.getReportContext().id);
    if (!frozen) throw Error("A valid period did not create a frozen report");
    await EduV24.showFrozenReport(frozen.id);
    record("F09", "valid dual/modular final report is issued and displayed",
      EduV24.getReportContext().closed && !document.getElementById("modalBody").textContent.includes("undefined") &&
      document.getElementById("modalBody").textContent.includes("16.20"));
    const unsafeText = '<img src=x onerror="window.__auditUnsafeReport=true">';
    const literal = structuredClone(frozen); literal.id = "literal_reason_report";
    literal.classes[0].students[0].lessons[0].reason = unsafeText;
    await changeStore("reports", store => store.put(literal));
    window.__auditUnsafeReport = false;
    await EduV24.showFrozenReport(literal.id);
    await new Promise(resolve => setTimeout(resolve, 60));
    record("F10", "frozen report reason is rendered as text and cannot execute markup",
      !window.__auditUnsafeReport && !document.querySelector("#modalBody img") &&
      document.getElementById("modalBody").textContent.includes(unsafeText));
    const versionTwo = await EduV24.snapshotInstallation();
    EduV24.validateFullBackup(versionTwo);
    const source = EduV24.getReportContext().id;
    EduV24.previewFullBackup(versionTwo); await EduV24.restoreFullBackup();
    const restored = (await readAll("reports")).find(row => row.workspace === EduV24.getReportContext().id && row.classes[0].students[0].lessons[0].reason !== unsafeText);
    if (!restored) throw Error("Valid frozen report did not survive full restore");
    await EduV24.showFrozenReport(restored.id);
    record("F11", "version-two restore preserves closed period and frozen historical snapshot",
      EduV24.getReportContext().id !== source && EduV24.getReportContext().closed &&
      JSON.stringify(restored.classes) === JSON.stringify(frozen.classes));
  } catch (error) {
    record("F99", "refactor integration flow completed", false, {error: error.stack || error.message});
  }
  return results;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("node audit/data-integrity.cjs\nDeveloper audit: temporary loopback server + isolated Edge profile; no application source changes.\nRequires Node.js 22+ and Edge. Override browser executable with EDUMANAGER_EDGE.\nExit 1 means a required integrity check failed; exit 2 means the audit runner could not complete.");
    return;
  }
  const application = path.join(root, "EduManager.html");
  if (!fs.existsSync(application)) throw Error("Run the audit file from the edu-manager/audit directory.");
  const browserPath = process.env.EDUMANAGER_EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (!fs.existsSync(browserPath)) throw Error("Browser executable not found. Set EDUMANAGER_EDGE.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "edu-integrity-audit-"));
  const files = new Map([
    ["/edu-manager/EduManager.html", ["EduManager.html", "text/html; charset=utf-8"]],
    ["/edu-manager/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/edu-manager/", ["index.html", "text/html; charset=utf-8"]],
    ["/edu-manager/app.webmanifest", ["app.webmanifest", "application/manifest+json"]],
    ["/edu-manager/service-worker.js", ["service-worker.js", "application/javascript"]]
  ]);
  const server = http.createServer((request, response) => {
    const file = files.get(new URL(request.url, "http://localhost").pathname);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", file[1]);
    response.setHeader("Cache-Control", "no-store");
    response.end(fs.readFileSync(path.join(root, file[0])));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser, ws, cdp;
  const pending = new Map();
  try {
    browser = spawn(browserPath, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
      "--disable-background-networking", "--disable-extensions", "--no-first-run",
      "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"
    ], {windowsHide: true, stdio: "ignore"});
    let launchError;
    browser.once("error", error => { launchError = error; });
    const devTools = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 200 && !fs.existsSync(devTools); i++) {
      if (launchError) throw launchError;
      await delay(100);
    }
    if (!fs.existsSync(devTools)) throw Error("Browser debugging endpoint did not start.");
    const port = fs.readFileSync(devTools, "utf8").split("\n")[0];
    const pages = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
    ws = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
    };
    cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(Error("Browser timeout: " + method));
      }, 25000);
      timer.unref();
      pending.set(id, {resolve, reject, timer});
      ws.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async expression => {
      const result = await cdp("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await cdp("Page.enable");
    await cdp("Page.addScriptToEvaluateOnNewDocument", {source: "window.__EDU_TEST_MODE__=true;window.confirm=()=>true;window.alert=()=>{};"});
    await cdp("Page.navigate", {url: "http://127.0.0.1:" + server.address().port + "/edu-manager/EduManager.html"});
    let ready = false;
    for (let i = 0; i < 150; i++) {
      ready = await evaluate("!!window.EduV24?.test?.getState().ready");
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw Error("Application did not become ready in the isolated profile.");
    const data = await evaluate("(" + matrix.toString() + ")()");
    const backup = await evaluate("(" + backupMatrix.toString() + ")()");
    const integration = await evaluate("(" + orphanRestore.toString() + ")()");
    const frozenReport = await evaluate("(" + malformedFrozenReport.toString() + ")()");
    const flows = await evaluate("(" + refactorFlows.toString() + ")()");
    const cases = [...data, ...backup, integration, frozenReport, ...flows];
    for (let i = 0; i < 100; i++) {
      if (await evaluate("!!(window.EduPWA?.getStatus().offlineReady && navigator.serviceWorker.controller)")) break;
      await delay(100);
    }
    await cdp("Network.enable");
    await cdp("Network.emulateNetworkConditions", {offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0});
    await cdp("Page.reload"); await delay(500);
    for (let i = 0; i < 100; i++) {
      if (await evaluate("!!(window.EduV24?.test?.getState().ready && window.EduPWA?.getStatus().offlineReady)")) break;
      await delay(100);
    }
    const reload = await evaluate("({ready:!!window.EduV24?.test?.getState().ready,offline:!navigator.onLine,closed:window.EduV24?.getReportContext().closed,grade:db.schools[0]?.classes[0]?.lessons[0]?.kardaneshScores.student_b?.theory})");
    cases.push({id: "F12", name: "restored data and closed period survive an offline reload", pass: reload.ready && reload.offline && reload.closed && reload.grade === 12, ...reload});
    const hash = crypto.createHash("sha256").update(fs.readFileSync(application))
      .update(fs.readFileSync(path.join(root, "app.webmanifest"))).digest("hex").slice(0, 16);
    const result = {
      stage: "1-data-integrity", applicationRelease: hash, executedAt: new Date().toISOString(),
      profile, total: cases.length, passed: cases.filter(test => test.pass).length,
      failed: cases.filter(test => !test.pass).length, cases
    };
    const resultFile = path.join(profile, "data-integrity-results.json");
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({...result, resultFile}, null, 2));
    if (result.failed) process.exitCode = 1;
  } finally {
    if (cdp && ws?.readyState === WebSocket.OPEN) {
      try { await cdp("Browser.close"); } catch {}
    }
    if (ws) ws.close();
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error("Audit browser closed.")); }
    pending.clear();
    if (browser && browser.exitCode === null) browser.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 2; });
