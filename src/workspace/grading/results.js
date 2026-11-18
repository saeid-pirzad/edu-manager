// The workspace owns live state and legacy compatibility; the service owns
// calculations and annual report projections. No host state is captured early.
const gradingResults = EduGradingResults({
  getData: () => db,
  legacyCalc: (...args) => old.calcStudentLesson(...args),
  policy: EduPolicy,
  grades: EduReportGrades,
  weightedKardanesh: (...args) => weightedKardanesh(...args),
  knownStudents: (...args) => knownStudents(...args),
  clone: (value) => clone(value),
  ownScoreRecord: (...args) => ownScoreRecord(...args),
  mergeAnnualClass: (...args) => EduAnnualModules.mergeClass(...args),
});

function calcV24(c, l, sid, source = db) {
  return gradingResults.calcV24(c, l, sid, source);
}
function assessmentWeights(lesson) {
  return gradingResults.assessmentWeights(lesson);
}
function assessmentResult(lesson, sid, stage = "final") {
  return gradingResults.assessmentResult(lesson, sid, stage);
}
function assertCompatibleTermLessons(reference, candidate) {
  return gradingResults.assertCompatibleTermLessons(reference, candidate);
}
function assertAnnualLessonCompatibility(parts, schoolId, classId = "") {
  return gradingResults.assertAnnualLessonCompatibility(
    parts,
    schoolId,
    classId,
  );
}
function annualGradeRows(parts, schoolId, classId, studentId = "") {
  return gradingResults.annualGradeRows(parts, schoolId, classId, studentId);
}
function annualModularLesson(parts, schoolId, classId, lesson, sid) {
  return gradingResults.annualModularLesson(
    parts,
    schoolId,
    classId,
    lesson,
    sid,
  );
}
function annualModularUnitRows(parts, schoolId, classId, lessonId, sid) {
  return gradingResults.annualModularUnitRows(
    parts,
    schoolId,
    classId,
    lessonId,
    sid,
  );
}
function annualTechnicalRows(parts, schoolId, classId, studentId = "") {
  return gradingResults.annualTechnicalRows(
    parts,
    schoolId,
    classId,
    studentId,
  );
}
