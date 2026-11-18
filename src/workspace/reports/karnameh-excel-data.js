// Compose the pure workbook service with the existing report domain. Live UI
// selection and asynchronous delivery remain in karnameh-excel.js.
const karnamehExcelBuilder = EduKarnamehExcel({
  grades: EduReportGrades,
  annualGradeRows,
  annualModularLesson,
  annualTechnicalRows,
  assertAnnualLessonCompatibility,
  assessmentWeights,
  finalText,
  lessons: karnamehLessons,
  students: karnamehReportStudents,
  ownScoreRecord,
});
function karnamehExcelSheets(options) {
  return karnamehExcelBuilder.sheets(options);
}
