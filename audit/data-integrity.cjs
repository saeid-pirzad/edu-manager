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


async function contextFlows() {
 const cases=[],record=(id,name,pass,details={})=>cases.push({id,name,pass:!!pass,...details});
 const context=()=>EduV24.getReportContext();
 const rows=store=>new Promise((resolve,reject)=>{const q=EduV24.test.getConnection().transaction(store).objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try {
  closeModal(); await EduV24.reopenPeriod(); closeModal();
  const gradingClass=db.schools[0].classes[0],gradingLesson=gradingClass.lessons[0];
  const oldFinal=EduV24.assessmentResult(gradingLesson,"student_b","final").final;
  state.schoolId="school_a";state.classId="class_a";state.lessonId=gradingLesson.id;
  showModal("Midterm test",buildLessonGradesHtml(gradingClass,gradingLesson));document.querySelector(".assessment-stage").open=true;
  for(const [field,value] of [["midtermPractical","16"],["midtermTheory","20"]]){
    const input=[...document.querySelectorAll("[data-grade]")].find(x=>x.dataset.student==="student_b"&&x.dataset.field===field);
    input.value=value;input.dispatchEvent(new Event("input",{bubbles:true}));await EduV24.flushDrafts({strict:true});
  }
  record("G12","native midterm inputs persist independent weighted result",EduV24.assessmentResult(gradingLesson,"student_b","midterm").final===17.2&&EduV24.assessmentResult(gradingLesson,"student_b","final").final===oldFinal);
  record("G13","midterm result refreshes in visible editor",[...document.querySelectorAll("[data-assessment-final]")].find(x=>x.dataset.assessmentFinal==="student_b"&&x.dataset.stage==="midterm")?.textContent==="17.20");
  await EduV24.undoLast();const currentLesson=db.schools[0].classes[0].lessons[0];
  record("G14","midterm undo preserves final components",EduV24.assessmentResult(currentLesson,"student_b","midterm").final===null&&EduV24.assessmentResult(currentLesson,"student_b","final").final===oldFinal);
  closeModal();
  await openSettingsModal();
  closeModal();const gradeBackup=await EduV24.snapshotInstallation();EduV24.validateFullBackup(gradeBackup);
  record("G15","full backup retains midterm components",gradeBackup.stores.records.some(row=>row.value?.lessons?.some(lesson=>lesson.kardaneshScores?.student_b?.midtermPractical===16)));
  EduV24.previewFullBackup(gradeBackup);await EduV24.restoreFullBackup();
  record("G16","full restore preserves midterm and prior final scores",db.schools[0].classes[0].lessons[0].kardaneshScores.student_b.midtermPractical===16&&EduV24.assessmentResult(db.schools[0].classes[0].lessons[0],"student_b","final").final===oldFinal);
  const session=db.sessions[0];closeModal();openSessionModal(session);
  const absent=document.querySelector(".att-btns[data-sid=student_a] .absent");
  await toggleAtt(absent,"absent");
  record("J01","attendance action saves from simplified session",getSessionById(session.id).attendance.student_a==="absent");
  showSessionPanel("activity");const sessionForm=document.querySelector(".session-entry-form");
  sessionForm.elements.studentId.value="student_a";sessionForm.elements.type.value="activity";sessionForm.elements.value.value="18";sessionForm.elements.note.value="session workflow test";
  await addSessionScore({preventDefault(){},target:sessionForm},session.id);
  record("J02","activity form saves class mark and keeps active panel",getSessionById(session.id).scores.some(score=>score.studentId==="student_a"&&score.type==="activity"&&score.value===18)&&!document.querySelector("[data-session-panel=activity]").hidden);
  closeModal();await openSettingsModal();
  const revision=context().revision;
  record("C01","settings no-op does not create a revision",await saveSettings() && context().revision===revision);
  await openSettingsModal();
  document.getElementById("newPass").value="private-test-secret";
  document.getElementById("removePassword").checked=true;
  record("C02","contradictory password settings rejected with form retained",!(await saveSettings()) && !db.settings.password && !!document.querySelector("#settingsError").textContent);
  document.getElementById("removePassword").checked=false;
  record("C03","password not exposed in form baseline",!document.getElementById("settingsEditor").dataset.savedState?.includes("private-test-secret"));
  record("C04","real password hash persists and verifies",await saveSettings() && await verifyPassword("private-test-secret",db.settings.password));
  await openSettingsModal(); document.getElementById("removePassword").checked=true;
  record("C05","password removal persists",await saveSettings() && !db.settings.password);
  await openSettingsModal();document.getElementById("newPass").value="retry-secret";
  EduV24.test.failNextWrite();
  const failed=await saveSettings();
  record("C06","failed settings write retains retryable form and durable password",!failed && document.getElementById("newPass")?.value==="retry-secret" && !(await rows("records")).find(x=>x.workspace===context().id&&x.key==="meta")?.value.settings.password);
  record("C07","settings retry persists intended password",await saveSettings() && await verifyPassword("retry-secret",db.settings.password));
  await openSettingsModal();document.getElementById("removePassword").checked=true;await saveSettings();
  const original=hashPassword;
  await openSettingsModal();document.getElementById("newPass").value="race-secret";
  hashPassword=()=>new Promise(resolve=>window.__releaseHash=resolve);
  const saving=saveSettings();
  for(let i=0;i<100&&!window.__releaseHash;i++)await new Promise(r=>setTimeout(r,5));
  closeModal();
  record("C08","busy settings form cannot be closed",!document.getElementById("modal").classList.contains("hidden"));
  db.schools[0].name+=" race";await saveDB();
  window.__releaseHash("should-never-be-written");const raced=await saving;hashPassword=original;delete window.__releaseHash;
  record("C09","revision change during hashing rejects save without changing password",!raced&&!db.settings.password&&!!document.getElementById("settingsError").textContent);
  document.getElementById("newPass").value="";closeModal();

  const activeId=context().id,other=(await rows("catalog")).find(x=>x.id!==activeId);
  if(!other)throw Error("Second period fixture missing");
  await openSettingsModal();document.getElementById("newPass").value="wrong-period-secret";
  hashPassword=()=>new Promise(resolve=>window.__releaseHash=resolve);
  const switchingSave=saveSettings();
  for(let i=0;i<100&&!window.__releaseHash;i++)await new Promise(r=>setTimeout(r,5));
  const beforeCatalog=JSON.stringify((await rows("records")).filter(x=>x.key==="meta"));
  await EduV24.switchPeriod(other.id);
  window.__releaseHash("must-not-write");const switchResult=await switchingSave;
  hashPassword=original;delete window.__releaseHash;
  record("C16","period switch during hashing leaves both periods unchanged",!switchResult&&JSON.stringify((await rows("records")).filter(x=>x.key==="meta"))===beforeCatalog);
  document.getElementById("newPass").value="";closeModal();await EduV24.switchPeriod(activeId);
  const reports=EduPeriodicReports;
  reports.render("daily");reports.selectScope("school_a","class_a");reports.set("date","2026-10-24");
  const daily=await reports.generate();
  record("C17","daily report generated from durable snapshot",!!daily&&reports.getLast()===daily);
  reports.render("weekly");
  record("C18","weekly report generated from durable snapshot",!!await reports.generate());
  reports.set("audience","parent");reports.set("studentId","student_a");
  const parent=await reports.generate();
  record("C19","parent report includes current student grades",parent?.audience==="parent"&&parent.currentGrades.length===2);
  const prepare=EduV24.prepareReportSnapshot;let release;
  EduV24.prepareReportSnapshot=async()=>{const data=await prepare();await new Promise(resolve=>release=resolve);return data;};
  const pendingReport=reports.generate();
  for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,5));
  reports.author("changed during preparation");release();
  const changed=await pendingReport;EduV24.prepareReportSnapshot=prepare;
  record("C20","changing report text during preparation discards obsolete output",changed===null&&reports.getLast()===null);

  const snap=await EduV24.prepareReportSnapshot();
  record("C10","report snapshot matches current durable workspace",snap.context.id===context().id&&snap.context.revision===context().revision&&snap.data.schools[0].name===db.schools[0].name);
  snap.data.schools[0].name="detached snapshot";
  record("C11","report snapshot mutations cannot change live data",db.schools[0].name!=="detached snapshot");
  db.schools[0].name+=" newer";await saveDB();
  let stale=false;try{await EduV24.assertReportSnapshot(snap.context);}catch{stale=true;}
  record("C12","report snapshot rejected after local commit",stale);
  const current=await EduV24.prepareReportSnapshot();
  await new Promise((resolve,reject)=>{const tx=EduV24.test.getConnection().transaction("catalog","readwrite"),s=tx.objectStore("catalog"),q=s.get(current.context.id);q.onsuccess=()=>s.put({...q.result,revision:q.result.revision+1});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  let remote=false;try{await EduV24.assertReportSnapshot(current.context);}catch{remote=true;}
  record("C13","catalog revision conflict detected without BroadcastChannel",remote&&context().blocked);
  let denied=false;try{await EduV24.prepareReportSnapshot();}catch{denied=true;}
  record("C14","blocked tab cannot prepare another report",denied);
  let prints=0;const originalPrint=window.print;window.print=()=>prints++;
  const printed=await EduV24.printReport();window.print=originalPrint;
  record("C15","blocked tab cannot print",printed===false&&prints===0);

  let downloads=0;const originalDownload=downloadLocalFile;downloadLocalFile=()=>downloads++;
  const json=await EduPeriodicReports.output("json"),txt=await EduPeriodicReports.output("txt");
  downloadLocalFile=originalDownload;
  record("C21","blocked tab cannot export daily or weekly files",json===false&&txt===false&&downloads===0);

 }catch(error){record("C99","context flow completed",false,{error:error.stack||error.message});}
 return cases;
}


async function workflowChecks(width) {
 document.getElementById("pwaWelcomeLater")?.click();
 const cases=[],check=(id,name,pass,extra={})=>cases.push({id:"W"+width+"-"+id,name,pass:!!pass,...extra});
 closeModal();
 const pages=[
  ["schools",()=>goSchools()],["school",()=>goSchool("school_a")],["class",()=>goClass("class_a")],
  ["lesson",()=>goLesson("lesson_dual")],["master",()=>goMaster("class_a")],["reports",()=>{goReports();setReportTab("monthly");}]
 ];
 for(const [name,open]of pages){
  open();await new Promise(r=>setTimeout(r,80));
  check(name,"viewport contains "+name,document.documentElement.scrollWidth<=innerWidth+1,{viewport:innerWidth,content:document.documentElement.scrollWidth});
  if(name==="schools")check("quiet-home","home has schools without duplicate dashboard panels",!!document.querySelector(".workflow-welcome")&&!document.querySelector(".dashboard-report-links,.dashboard-work,.ui-hero"));
  if(name==="class")check("roster-first","class opens on student roster",state.tab==="students");
  if(name==="lesson")check("session-first","lesson opens on sessions",state.tab==="sessions");
  check(name+"-tools","maintenance disclosure is collapsed",!document.querySelector(".workspace-tools")?.open&&!document.querySelector(".workspace-bar > button"));
  if(name==="lesson"){
    document.querySelector(".session-open").click();await new Promise(r=>setTimeout(r,50));
    check("attendance-default","session opens with attendance only",!!document.querySelector("[data-session-panel=activity]")?.hidden&&!document.querySelector("[data-session-panel=attendance]")?.hidden);
    document.querySelector("[data-session-tab=activity]").click();
    check("activity-tab","native activity tab switches panels",document.querySelector("[data-session-panel=attendance]").hidden&&!document.querySelector("[data-session-panel=activity]").hidden);
    check("session-width","session fits viewport",document.documentElement.scrollWidth<=innerWidth+1);
    closeModal();
  }
 }
 return cases;
}
async function monthlyChecks(){
 const cases=[],check=(id,name,pass)=>cases.push({id,name,pass:!!pass});
 for(const [id,date,start,end,days]of [
  ["M01","2024-03-20","2024-03-20","2024-04-19",31],
  ["M02","2025-03-19","2025-02-19","2025-03-20",30],
  ["M03","2025-03-21","2025-03-21","2025-04-20",31],
  ["M04","2026-10-25","2026-10-23","2026-11-21",30]
 ]){
  const range=EduPeriodicReports.range("monthly",date);
  const m=EduPeriodicReports.build(db,{mode:"monthly",date,schoolId:"school_a",classId:"class_a",audience:"management",detailLevel:"summary"});
  check(id,"Persian month boundary and complete daily rows "+date,range.start===start&&range.end===end&&m.days.length===days&&m.days.at(-1).date===end);
 }
 EduPeriodicReports.render("monthly");EduPeriodicReports.selectScope("school_a","class_a");EduPeriodicReports.set("date","2026-10-25");
 const m=await EduPeriodicReports.generate();
 check("M05","monthly report generates and displays correct heading",!!m&&EduPeriodicReports.documentHtml(m).includes("گزارش ماهانه")&&EduPeriodicReports.textReport(m).includes("ماهانه"));
 return cases;
}


async function annualChecks(){
 const cases=[],record=(id,name,pass,extra={})=>cases.push({id,name,pass:!!pass,...extra});
 const previous=EduV24.getReportContext().id;
 try{
  if(!["اول","دوم"].includes(EduV24.test.getState().workspace.term)){
    let denied=false;try{await EduV24.prepareReportSnapshot({annual:true});}catch(error){denied=error.message.includes("بازیابی");}
    record("Y12","restored alias cannot silently report another canonical period",denied);
  }
  closeModal();await EduV24.openNewPeriod();document.getElementById("periodYear").value="1407-1408";document.getElementById("periodTerm").value="اول";await EduV24.createNewPeriod();
  const first=EduV24.getReportContext().id;
  db.sessions=[{id:"annual_session",schoolId:"school_a",classId:"class_a",lessonId:"lesson_dual",date:"2028-10-25",period:0,poudmanId:null,unitId:null,roster:structuredClone(db.schools[0].classes[0].students),attendance:{student_a:"present"},scores:[{studentId:"student_a",type:"positive",value:1,note:"first term"}]}];
  db.schools[0].classes[0].lessons[0].kardaneshScores.student_a={midtermPractical:10,midtermTheory:20,practical:20,theory:0};
  await saveDB();
  let missing=false;try{await EduV24.prepareReportSnapshot({annual:true});}catch(error){missing=error.message.includes("هر دو");}
  record("Y01","annual report refuses a missing second term",missing);
  await EduV24.openNewPeriod();document.getElementById("periodYear").value="1407-1408";document.getElementById("periodTerm").value="دوم";await EduV24.createNewPeriod();
  db.sessions=[{id:"annual_session",schoolId:"school_a",classId:"class_a",lessonId:"lesson_dual",date:"2029-03-25",period:0,poudmanId:null,unitId:null,roster:structuredClone(db.schools[0].classes[0].students),attendance:{student_a:"absent"},scores:[{studentId:"student_a",type:"negative",value:1,note:"second term"}]}];
  db.schools[0].classes[0].lessons[0].kardaneshScores.student_a={midtermPractical:18,midtermTheory:12,practical:20,theory:20};
  await saveDB();
  const snapshot=await EduV24.prepareReportSnapshot({annual:true});
  record("Y02","annual snapshot includes both terms and distinct session identities",snapshot.parts.length===2&&snapshot.data.sessions.length===2&&new Set(snapshot.data.sessions.map(x=>x.id)).size===2);
  EduPeriodicReports.render("annual");EduPeriodicReports.selectScope("school_a","class_a");
  const model=await EduPeriodicReports.generate();
  record("Y03","annual report combines both terms within academic year",model?.summary.sessions===2&&model.periods.length===2&&model.summary.present===1&&model.summary.absent===1);
  record("Y11","annual summary skips empty calendar rows while JSON retains all days",!EduPeriodicReports.documentHtml(model).includes(faDate("2028-09-23"))&&model.days.some(day=>day.date==="2028-09-23"));
  record("Y04","annual report enumerates complete academic year",model?.start==="2028-09-22"&&model.end==="2029-09-21"&&model.days.length===365,{start:model?.start,end:model?.end,days:model?.days.length});
  EduPeriodicReports.set("audience","parent");EduPeriodicReports.set("studentId","student_a");const parent=await EduPeriodicReports.generate();
  record("Y10","annual report preserves technical module grades per term and selected student",parent?.technicalGrades.length===2&&parent.technicalGrades.every(row=>row.studentId==="student_a"&&row.modules.length===1)&&EduPeriodicReports.textReport(parent).includes("پودمان"));
  record("Y09","annual report displays and exports four assessments and equal average",parent?.annualGrades.length===1&&parent.annualGrades[0].final===15.8&&EduPeriodicReports.textReport(parent).includes("15.80")&&EduPeriodicReports.documentHtml(parent).includes("15.80"));
  record("Y05","annual parent report isolates selected student",parent?.students.length===1&&parent.students[0].studentId==="student_a"&&parent.sessions.every(s=>s.participants.every(st=>st.studentId==="student_a")));
  const connection=EduV24.test.getConnection();
  const read=id=>new Promise((resolve,reject)=>{const q=connection.transaction("catalog").objectStore("catalog").get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  const write=value=>new Promise((resolve,reject)=>{const tx=connection.transaction("catalog","readwrite");tx.objectStore("catalog").put(value);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const original=await read(first);await write({...original,revision:original.revision+1});
  let conflict=false;try{await EduV24.assertReportSnapshot(snapshot.context);}catch{conflict=true;}
  record("Y06","annual output guard detects change in other term",conflict);
  await write(original);
  const second=EduV24.getReportContext().id;
  await EduV24.switchPeriod(first);await openSettingsModal();document.getElementById("newPass").value="annual-access";await saveSettings();await EduV24.switchPeriod(second);
  const oldPrompt=window.prompt;window.prompt=()=>null;let denied=false;
  try{await EduV24.prepareReportSnapshot({annual:true});}catch{denied=true;}
  record("Y07","protected other term cannot be read without its password",denied);
  window.prompt=()=>"annual-access";const authorized=await EduV24.prepareReportSnapshot({annual:true});window.prompt=oldPrompt;
  record("Y08","correct other-term password permits annual snapshot",authorized.parts.length===2);
 }catch(error){record("Y99","annual flow completed",false,{error:error.stack||error.message});}
 finally{closeModal();await EduV24.switchPeriod(previous);}
 return cases;
}


async function assessmentChecks(){
 const cases=[],check=(id,name,pass,extra={})=>cases.push({id,name,pass:!!pass,...extra});
 const fixture=structuredClone(window.auditFixture);
 const lesson=fixture.schools[0].classes[0].lessons[0];
 lesson.kardaneshScores.student_a={practical:20,theory:0,midtermPractical:10,midtermTheory:20};
 let normalized=EduV24.normalizeDB(fixture);
 check("G01","normalization preserves independent midterm and final components",normalized.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermPractical===10&&normalized.schools[0].classes[0].lessons[0].kardaneshScores.student_a.practical===20);
 for(const [id,value]of [["G02",-1],["G03",21],["G04","18"],["G05",{}]]){
  const corrupt=structuredClone(fixture);corrupt.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermTheory=value;
  let rejected=false;try{EduV24.normalizeDB(corrupt);}catch{rejected=true;}
  check(id,"invalid midterm component rejected "+JSON.stringify(value),rejected);
 }
 const a=EduV24.assessmentResult(lesson,"student_a","midterm"),b=EduV24.assessmentResult(lesson,"student_a","final");
 check("G06","each assessment uses 70/30 independently",a.final===13&&b.final===14&&b.passed===true);
 const second=structuredClone(fixture);second.schools[0].classes[0].lessons[0].kardaneshScores.student_a={practical:20,theory:20,midtermPractical:18,midtermTheory:12};
 const parts=[{period:{term:"اول"},data:fixture},{period:{term:"دوم"},data:second}];
 const rows=EduV24.annualGradeRows(parts,"school_a","class_a","student_a"),grade=rows[0];
 check("G07","annual grade is equal mean of all four assessments",rows.length===1&&grade.components.length===4&&grade.final===15.8&&grade.complete,{final:grade.final});
 delete second.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermTheory;
 const incomplete=EduV24.annualGradeRows(parts,"school_a","class_a","student_a")[0];
 check("G08","missing component prevents annual average and is not counted as zero",!incomplete.complete&&incomplete.final===null&&incomplete.passed===null);
 check("G09","annual grade request cannot include another student",EduV24.annualGradeRows(parts,"school_a","class_a","student_a").every(row=>row.studentId==="student_a"));
 const legacy=EduV24.assessmentResult({kardaneshScores:{student_a:{practical:18,theory:12}}},"student_a","midterm");
 check("G10","legacy final scores never become fabricated midterm scores",legacy.final===null&&legacy.practical===null);
 const custom={...EduPolicy.defaults("dual","1405-1406"),practicalWeight:90,passMin:10,theoryMin:19};
 check("G11","dual calculation follows confirmed 70/30 business rule",EduPolicy.dual(custom,20,0).final===14&&EduPolicy.dual(custom,20,0).passed);
 return cases;
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
    const grades = await evaluate("(" + assessmentChecks.toString() + ")()");
    const backup = await evaluate("(" + backupMatrix.toString() + ")()");
    const integration = await evaluate("(" + orphanRestore.toString() + ")()");
    const frozenReport = await evaluate("(" + malformedFrozenReport.toString() + ")()");
    const flows = await evaluate("(" + refactorFlows.toString() + ")()");
    const cases = [...data, ...grades, ...backup, integration, frozenReport, ...flows];
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
    await cdp("Network.emulateNetworkConditions", {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    cases.push(...await evaluate("(" + monthlyChecks.toString() + ")()"));
    for (const width of [360,390,768,1280]) {
      await cdp("Emulation.setDeviceMetricsOverride",{width,height:850,deviceScaleFactor:1,mobile:false});
      cases.push(...await evaluate("(" + workflowChecks.toString() + ")("+width+")"));
      if(width===390){
        await evaluate("openSessionModal(db.sessions[0]);showSessionPanel(\"activity\")");
        await delay(100);
        const shot=await cdp("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(path.join(profile,"mobile-session.png"),Buffer.from(shot.data,"base64"));
        await evaluate("closeModal();goSchool(\"school_a\");goClass(\"class_a\");goLesson(\"lesson_dual\");setTab(\"grades\")");
        await delay(100);const gradesShot=await cdp("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(path.join(profile,"mobile-grades.png"),Buffer.from(gradesShot.data,"base64"));
        await evaluate("setTab(\"sessions\")");await delay(100);
        const sessionsShot=await cdp("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(profile,"mobile-sessions.png"),Buffer.from(sessionsShot.data,"base64"));
        await evaluate("goSchools()");await delay(100);
        const homeShot=await cdp("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(profile,"mobile-home.png"),Buffer.from(homeShot.data,"base64"));
      }
    }
    cases.push(...await evaluate("(" + annualChecks.toString() + ")()"));
    cases.push(...await evaluate("(" + contextFlows.toString() + ")()"));
    const hash = crypto.createHash("sha256").update(fs.readFileSync(application))
      .update(fs.readFileSync(path.join(root, "app.webmanifest"))).digest("hex").slice(0, 16);
    const result = {
      stage: "3-simple-workflow-mobile-and-four-assessments", applicationRelease: hash, executedAt: new Date().toISOString(),
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
